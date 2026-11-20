#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Healthcheck Eflex : portail public, TLS, Docker, PostgreSQL, Redis
# ═══════════════════════════════════════════════════════════════════════════
# Vérifie :
#   1. GET https://<portail>/api/health → HTTP 200 + `"status":"ok"` (timeout) ;
#   2. l'expiration TLS de l'apex et de chaque domaine d'application
#      (`ProjectApp.domain`, app principale incluse, openssl),
#      alerte si < EFLEX_TLS_MIN_DAYS (21 j) ou certificat invalide ;
#   3. l'état Docker : `eflex-portail` healthy, `eflex-postgres` et
#      `eflex-redis` healthy + réponses pg_isready / redis-cli ping ;
#   4. optionnellement, envoie une alerte :
#        - POST JSON sur ALERT_WEBHOOK_URL (Slack/Mattermost/Discord…),
#        - e-mail via Resend si RESEND_API_KEY *et* ALERT_EMAIL sont définis.
#      Aucune valeur secrète (clé Resend, URL de webhook, token) n'est écrite
#      dans les journaux.
#
# Usage :
#   bash scripts/healthcheck.sh
#   bash scripts/healthcheck.sh --no-alert
#
# Variables (facultatives) :
#   EFLEX_PORTAL_URL          URL du portail (déf. https://$PORTAL_DOMAIN)
#   EFLEX_HTTP_TIMEOUT        timeout curl en secondes (déf. 10)
#   EFLEX_TLS_MIN_DAYS        seuil d'expiration TLS (déf. 21)
#   EFLEX_TLS_TIMEOUT         timeout openssl en secondes (déf. 15)
#   EFLEX_HEALTHCHECK_SKIP_PROJECT_DOMAINS=1  ne teste que l'apex
#   ALERT_WEBHOOK_URL         webhook JSON d'alerte (facultatif)
#   ALERT_EMAIL               destinataire e-mail (facultatif)
#   RESEND_API_KEY            clé Resend (lue dans .env.prod, jamais affichée)
#   EFLEX_ENV_FILE            fichier de variables (déf. <repo>/.env.prod)
#   EFLEX_BACKUP_HEALTHCHECK=1  active la vérification des statuts backup/restore portail
#   EFLEX_BACKUP_DIR          dossier des statuts backup/restore (déf. /home/fantome/backups/eflex)
#   EFLEX_BACKUP_MAX_AGE_HOURS      âge max sauvegarde locale (déf. 26)
#   EFLEX_RESTORE_TEST_MAX_AGE_DAYS âge max preuve de restauration (déf. 35)
#   EFLEX_BACKUP_REQUIRE_OFFSITE=1  traite l’absence de copie hors site comme anomalie
#
# Code de sortie : 0 si tout est sain, 1 si au moins une anomalie est détectée.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${EFLEX_ENV_FILE:-$REPO_DIR/.env.prod}"
PG_CONTAINER="${EFLEX_PG_CONTAINER:-eflex-postgres}"
REDIS_CONTAINER="${EFLEX_REDIS_CONTAINER:-eflex-redis}"
PORTAL_CONTAINER="${EFLEX_PORTAL_CONTAINER:-eflex-portail}"
HTTP_TIMEOUT="${EFLEX_HTTP_TIMEOUT:-10}"
TLS_MIN_DAYS="${EFLEX_TLS_MIN_DAYS:-21}"
TLS_TIMEOUT="${EFLEX_TLS_TIMEOUT:-15}"
CA_BUNDLE="${EFLEX_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}"
SEND_ALERT=1
FAILED=0
FAILURES=()
TMP_FILES=()

log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$2"; }
ok() { log "OK  " "$*"; }
warn() { log "WARN" "$*"; }
record_fail() {
  FAILED=1
  FAILURES+=("$*")
  log "FAIL" "$*"
}

cleanup() {
  local file
  for file in "${TMP_FILES[@]:-}"; do
    [ -n "$file" ] && rm -f -- "$file"
  done
}
trap cleanup EXIT

# ── Lecture prudente de .env.prod : jamais d'affichage, pas de `source` ─────
read_env_var() {
  local key="$1" file="${2:-$ENV_FILE}" line=""
  [ -r "$file" ] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -n1)" || return 0
  local val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" =~ ^\"(.*)\"$ ]]; then
    val="${BASH_REMATCH[1]}"
  elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
    val="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$val"
}

# Priorité : variable d'environnement, puis .env.prod, puis défaut.
setting() {
  local name="$1" default="${2:-}" val=""
  val="${!name:-}"
  [ -n "$val" ] || val="$(read_env_var "$name")"
  printf '%s' "${val:-$default}"
}

usage() {
  sed -n '2,36p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-alert) SEND_ALERT=0; shift ;;
      -h|--help) usage; exit 0 ;;
      *) log "FAIL" "argument inconnu : $1 (voir --help)"; exit 2 ;;
    esac
  done
}

json_escape() {
  # Échappe une chaîne pour un payload JSON minimal, sans dépendance externe.
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

read_status_value() {
  local file="$1" key="$2"
  [ -r "$file" ] || return 0
  awk -F= -v k="$key" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$file" 2>/dev/null || true
}

iso_age_hours() {
  local iso="$1" epoch now
  [ -n "$iso" ] || { printf '%s' ""; return 0; }
  epoch="$(date -u -d "$iso" +%s 2>/dev/null)" || { printf '%s' ""; return 0; }
  now="$(date -u +%s)"
  printf '%s' "$(( (now - epoch) / 3600 ))"
}

http_check() {
  local body code start end elapsed
  body="$(mktemp /tmp/eflex-health-XXXXXX)"
  TMP_FILES+=("$body")

  start="$(date +%s%3N)"
  code="$(curl -sS --max-time "$HTTP_TIMEOUT" -o "$body" -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)" || code="000"
  end="$(date +%s%3N)"
  elapsed=$((end - start))

  if [ "$code" != "200" ]; then
    record_fail "HTTP $HEALTH_URL : code ${code} (attendu 200) en ${elapsed} ms"
    return
  fi
  if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$body" 2>/dev/null; then
    record_fail "HTTP $HEALTH_URL : 200 sans « status:ok » (corps inattendu)"
    return
  fi
  ok "HTTP $HEALTH_URL → 200 status=ok (${elapsed} ms)"
}

docker_health() {
  local container="$1" status
  if ! docker inspect "$container" >/dev/null 2>&1; then
    record_fail "docker : conteneur $container absent"
    return
  fi
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null)"
  if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
    ok "docker : $container $status"
  else
    record_fail "docker : $container $status"
  fi
}

service_checks() {
  docker_health "$PORTAL_CONTAINER"
  docker_health "$PG_CONTAINER"
  docker_health "$REDIS_CONTAINER"

  if docker exec "$PG_CONTAINER" pg_isready --quiet \
    --username "$PG_USER" --dbname "$PG_DB" >/dev/null 2>&1; then
    ok "postgres : pg_isready ($PG_DB)"
  else
    record_fail "postgres : pg_isready en échec"
  fi

  if [ "$(docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null)" = "PONG" ]; then
    ok "redis : PONG"
  else
    record_fail "redis : pas de PONG"
  fi
}

tls_check() {
  local host="$1" out verify end epoch now days
  out="$(timeout "$TLS_TIMEOUT" openssl s_client \
    -servername "$host" -connect "${host}:443" \
    -verify_hostname "$host" -CAfile "$CA_BUNDLE" </dev/null 2>&1)" || {
    record_fail "TLS $host : handshake impossible (DNS, port 443 ou Traefik)"
    return
  }

  verify="$(printf '%s\n' "$out" | sed -n 's/^Verify return code: //p' | head -n1)"
  case "$verify" in
    "0 (ok)"*) ;;
    *) record_fail "TLS $host : certificat invalide (${verify:-vérification absente})" ;;
  esac

  end="$(printf '%s\n' "$out" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2-)"
  if [ -z "$end" ]; then
    record_fail "TLS $host : date d'expiration illisible"
    return
  fi
  epoch="$(LC_ALL=C date -d "$end" +%s 2>/dev/null)" || {
    record_fail "TLS $host : date d'expiration non analysable ($end)"
    return
  }
  now="$(date +%s)"
  days=$(( (epoch - now) / 86400 ))

  if [ "$epoch" -le "$now" ]; then
    record_fail "TLS $host : certificat EXPIRÉ (${end})"
  elif [ "$days" -lt "$TLS_MIN_DAYS" ]; then
    record_fail "TLS $host : expire dans ${days} j (< ${TLS_MIN_DAYS} j, le ${end})"
  else
    ok "TLS $host : valide ${days} j (jusqu'au ${end})"
  fi
}

skip_project_domains() {
  case "${EFLEX_HEALTHCHECK_SKIP_PROJECT_DOMAINS:-0}" in
    1|true|yes) return 0 ;;
    *) return 1 ;;
  esac
}

project_domains() {
  docker exec "$PG_CONTAINER" psql --username "$PG_USER" --dbname "$PG_DB" -At \
    -v ON_ERROR_STOP=1 \
    -c "SELECT DISTINCT btrim(domain) FROM \"ProjectApp\" WHERE domain IS NOT NULL AND btrim(domain) <> '' ORDER BY 1;" \
    2>/dev/null
}

tls_checks() {
  local domains host
  tls_check "$PORTAL_HOST"

  if skip_project_domains; then
    log "INFO" "TLS : domaines des applications ignorés (EFLEX_HEALTHCHECK_SKIP_PROJECT_DOMAINS)"
    return
  fi

  domains="$(project_domains)" || {
    record_fail "TLS : impossible de lire ProjectApp.domain (PostgreSQL)"
    domains=""
  }
  while IFS= read -r host; do
    [ -n "$host" ] || continue
    [ "$host" = "$PORTAL_HOST" ] && continue
    tls_check "$host"
  done <<<"$domains"
}

# Vérification optionnelle des preuves de sauvegarde/restauration du portail (backup.status,
# restore-test.status). Activée par EFLEX_BACKUP_HEALTHCHECK=1 ou si un fichier de statut existe
# dans EFLEX_BACKUP_DIR. Ne lit aucun secret : uniquement horodatages et résultats.
backup_status_checks() {
  local dir="${EFLEX_BACKUP_DIR:-/home/fantome/backups/eflex}"
  local backup_file="$dir/backup.status"
  local restore_file="$dir/restore-test.status"
  local enabled="${EFLEX_BACKUP_HEALTHCHECK:-}"
  local max_backup_h="${EFLEX_BACKUP_MAX_AGE_HOURS:-26}"
  local max_restore_days="${EFLEX_RESTORE_TEST_MAX_AGE_DAYS:-35}"
  local require_offsite="${EFLEX_BACKUP_REQUIRE_OFFSITE:-0}"

  if [ "$enabled" != "1" ] && [ "$enabled" != "true" ] && [ ! -f "$backup_file" ] && [ ! -f "$restore_file" ]; then
    return
  fi

  if [ -f "$backup_file" ]; then
    local local_at overall_at offsite age
    local_at="$(read_status_value "$backup_file" local_success_at)"
    [ -n "$local_at" ] || local_at="$(read_status_value "$backup_file" last_success_at)"
    overall_at="$(read_status_value "$backup_file" last_success_at)"
    offsite="$(read_status_value "$backup_file" offsite)"
    age="$(iso_age_hours "$local_at")"
    if [ -z "$local_at" ] || [ -z "$age" ]; then
      record_fail "Sauvegarde portail : statut illisible ($backup_file)"
    elif [ "$age" -gt "$max_backup_h" ]; then
      record_fail "Sauvegarde portail : dernière sauvegarde locale trop ancienne (${age} h > ${max_backup_h} h)"
    else
      ok "Sauvegarde portail : locale OK il y a ${age} h (fichier $(read_status_value "$backup_file" last_file))"
    fi
    case "$offsite" in
      ok) ok "Sauvegarde portail : copie hors site OK" ;;
      skipped)
        if [ "$require_offsite" = "1" ] || [ "$require_offsite" = "true" ]; then
          record_fail "Sauvegarde portail : copie hors site non configurée (requise)"
        else
          warn "Sauvegarde portail : copie hors site non configurée (recommandée)"
        fi
        ;;
      error)
        record_fail "Sauvegarde portail : dernière copie hors site en échec (preuve locale conservée)"
        ;;
      *) warn "Sauvegarde portail : état de copie hors site inconnu (${offsite:-vide})" ;;
    esac
    if [ -n "$overall_at" ]; then
      ok "Sauvegarde portail : succès global consigné"
    elif [ "$offsite" = "error" ]; then
      log "INFO" "Sauvegarde portail : pas de succès global (copie hors site en échec) — restauration locale possible"
    fi
  else
    warn "Sauvegarde portail : aucun backup.status trouvé dans $dir"
  fi

  if [ -f "$restore_file" ]; then
    local restore_at restore_age_h
    restore_at="$(read_status_value "$restore_file" last_success_at)"
    restore_age_h="$(iso_age_hours "$restore_at")"
    if [ -z "$restore_at" ] || [ -z "$restore_age_h" ]; then
      record_fail "Restauration portail : statut illisible ($restore_file)"
    elif [ "$restore_age_h" -gt $((max_restore_days * 24)) ]; then
      record_fail "Restauration portail : dernière preuve trop ancienne (${restore_age_h} h > $((max_restore_days * 24)) h)"
    else
      ok "Restauration portail : restauration testée il y a ${restore_age_h} h (preuve $(read_status_value "$restore_file" last_file))"
    fi
  else
    warn "Restauration portail : aucun restore-test.status trouvé dans $dir"
  fi
}

send_webhook() {
  local message="$1" payload response code
  payload="{\"text\":\"$(json_escape "$message")\"}"
  response="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    --data-binary "$payload" \
    "$ALERT_WEBHOOK_URL" 2>/dev/null)" || response="000"
  code="$response"
  if [ "$code" = "200" ] || [ "$code" = "202" ] || [ "$code" = "204" ]; then
    log "INFO" "alerte webhook envoyée (HTTP $code)"
  else
    log "WARN" "alerte webhook en échec (HTTP $code) — URL non journalisée"
  fi
}

send_email() {
  local message="$1" payload subject code cfg
  subject="[Eflex] $(hostname -s 2>/dev/null || echo serveur) : ${#FAILURES[@]} anomalie(s)"
  payload="{\"from\":\"$(json_escape "$MAIL_FROM")\",\"to\":[\"$(json_escape "$ALERT_EMAIL")\"],\"subject\":\"$(json_escape "$subject")\",\"text\":\"$(json_escape "$message")\"}"

  # La clé part dans un fichier de configuration 600 (option -K), jamais dans
  # l'argv du processus ni dans les journaux.
  cfg="$(mktemp /tmp/eflex-resend-XXXXXX)"
  TMP_FILES+=("$cfg")
  chmod 600 "$cfg"
  printf 'header = "Authorization: Bearer %s"\n' "$RESEND_API_KEY" >"$cfg"

  code="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    -K "$cfg" \
    -H 'Content-Type: application/json' \
    --data-binary "$payload" \
    'https://api.resend.com/emails' 2>/dev/null)" || code="000"

  if [ "$code" = "200" ] || [ "$code" = "202" ]; then
    log "INFO" "alerte e-mail envoyée (HTTP $code)"
  else
    log "WARN" "alerte e-mail en échec (HTTP $code)"
  fi
}

send_alerts() {
  [ "$SEND_ALERT" -eq 1 ] || { log "INFO" "alertes désactivées (--no-alert)"; return; }
  [ "${#FAILURES[@]}" -gt 0 ] || return

  local details message
  details="$(printf -- '- %s\n' "${FAILURES[@]}")"
  message="Healthcheck Eflex — $(hostname -f 2>/dev/null || hostname) — $(date '+%Y-%m-%d %H:%M:%S %Z')
${#FAILURES[@]} anomalie(s) :
${details}"

  if [ -n "$ALERT_WEBHOOK_URL" ]; then
    send_webhook "$message"
  fi
  if [ -n "$ALERT_EMAIL" ] && [ -n "$RESEND_API_KEY" ]; then
    send_email "$message"
  elif [ -n "$ALERT_EMAIL" ]; then
    log "WARN" "ALERT_EMAIL défini sans RESEND_API_KEY : alerte e-mail ignorée"
  fi
}

main() {
  parse_args "$@"

  # Domaines : source unique versionnée, aucun secret.
  if [ -r "$REPO_DIR/config/domains.sh" ]; then
    # shellcheck disable=SC1091
    set -a
    . "$REPO_DIR/config/domains.sh"
    set +a
  fi
  PORTAL_HOST="${PORTAL_DOMAIN:-eflex.app}"
  HEALTH_URL="${EFLEX_PORTAL_URL:-${PORTAL_URL:-https://$PORTAL_HOST}}/api/health"

  ALERT_WEBHOOK_URL="$(setting ALERT_WEBHOOK_URL)"
  ALERT_EMAIL="$(setting ALERT_EMAIL)"
  RESEND_API_KEY="$(setting RESEND_API_KEY)"
  MAIL_FROM="$(setting EMAIL_FROM 'Eflex <noreply@eflex.app>')"

  PG_USER="$(setting POSTGRES_USER eflex)"
  PG_DB="$(setting POSTGRES_DB eflex)"

  log "INFO" "=== healthcheck Eflex ($(hostname -f 2>/dev/null || hostname)) ==="
  command -v curl >/dev/null 2>&1 || record_fail "curl introuvable"
  command -v openssl >/dev/null 2>&1 || record_fail "openssl introuvable"

  http_check
  service_checks
  tls_checks
  backup_status_checks

  if [ "$FAILED" -eq 0 ]; then
    log "INFO" "=== healthcheck : OK ==="
    exit 0
  fi

  log "INFO" "=== healthcheck : ${#FAILURES[@]} anomalie(s) ==="
  send_alerts
  exit 1
}

main "$@"
