#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Sauvegarde quotidienne de la base PostgreSQL du portail Eflex
# ═══════════════════════════════════════════════════════════════════════════
# - pg_dump (format custom, non compressé) exécuté DANS le conteneur, puis
#   gzip côté hôte (le fichier final est autonome et restaurable par
#   `gunzip -c … | pg_restore`).
# - Vérifications : en-tête PGDMP, `gzip -t`, taille minimale, fraîcheur.
# - Rétention : 7 sauvegardes quotidiennes + 4 hebdomadaires (le dimanche).
#   Seuls les fichiers portant NOS préfixes sont supprimés.
# - Permissions : dossier 700, fichiers 600 (le dump contient des hachages de
#   mots de passe et des variables d'environnement chiffrées).
# - Aucun secret n'est affiché : la connexion passe par la socket locale du
#   conteneur (trust), sans mot de passe sur la ligne de commande.
#
# Usage :
#   bash scripts/backup-db.sh
#   EFLEX_BACKUP_DIR=/mnt/backups/eflex bash scripts/backup-db.sh
#
# Variables (toutes facultatives) :
#   EFLEX_BACKUP_DIR          dossier de destination (déf. /home/fantome/backups/eflex)
#   EFLEX_PG_CONTAINER        conteneur PostgreSQL (déf. eflex-postgres)
#   EFLEX_PG_USER             utilisateur SQL (déf. POSTGRES_USER de .env.prod)
#   EFLEX_PG_DB               base à sauvegarder (déf. POSTGRES_DB de .env.prod)
#   EFLEX_ENV_FILE            fichier de variables (déf. <repo>/.env.prod)
#   EFLEX_BACKUP_MIN_BYTES    taille minimale du .dump.gz (déf. 10240)
#   EFLEX_BACKUP_MIN_FREE_MB  espace libre minimal avant dump (déf. 100)
#   EFLEX_DAILY_KEEP          quotidiennes conservées (déf. 7)
#   EFLEX_WEEKLY_KEEP         hebdomadaires conservées (déf. 4)
#
# Code de sortie : 0 succès, 1 échec (journal lisible sur stdout + journald).
# ═══════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${EFLEX_ENV_FILE:-$REPO_DIR/.env.prod}"
BACKUP_DIR="${EFLEX_BACKUP_DIR:-/home/fantome/backups/eflex}"
PG_CONTAINER="${EFLEX_PG_CONTAINER:-eflex-postgres}"
MIN_BYTES="${EFLEX_BACKUP_MIN_BYTES:-10240}"
MIN_FREE_MB="${EFLEX_BACKUP_MIN_FREE_MB:-100}"
DAILY_KEEP="${EFLEX_DAILY_KEEP:-7}"
WEEKLY_KEEP="${EFLEX_WEEKLY_KEEP:-4}"

DAILY_PREFIX="eflex-db-daily-"
WEEKLY_PREFIX="eflex-db-weekly-"
DAILY_NAME="${DAILY_PREFIX}$(date +%Y%m%d).dump.gz"
WEEKLY_NAME="${WEEKLY_PREFIX}$(date +%G-W%V).dump.gz" # ISO : 2026-W45
LOG="$BACKUP_DIR/backup.log"
TMP=""

log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG"
}

fail() {
  log "[ERREUR] $*"
  exit 1
}

cleanup() {
  if [ -n "$TMP" ]; then
    rm -f -- "$TMP"
  fi
  return 0
}
trap cleanup EXIT

# Lit une variable dans un fichier .env sans l'exporter ni afficher sa valeur.
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

resolve_pg_setting() {
  local override="$1" env_name="$2" file_name="$3" fallback="$4" val=""
  val="${!override:-}"
  [ -n "$val" ] || val="${!env_name:-}"
  [ -n "$val" ] || val="$(read_env_var "$file_name")"
  [ -n "$val" ] || val="$(docker exec "$PG_CONTAINER" printenv "$env_name" 2>/dev/null || true)"
  printf '%s' "${val:-$fallback}"
}

require_tools() {
  local tool
  for tool in docker gzip stat date find sort awk df; do
    command -v "$tool" >/dev/null 2>&1 || fail "outil requis introuvable : $tool"
  done
}

prepare() {
  command -v docker >/dev/null 2>&1 || fail "docker introuvable"
  if ! docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -qx true; then
    fail "conteneur PostgreSQL '$PG_CONTAINER' introuvable ou arrêté"
  fi

  install -d -m 700 -- "$BACKUP_DIR" || fail "impossible de créer $BACKUP_DIR (permissions ?)"
  chmod 700 -- "$BACKUP_DIR" 2>/dev/null || true
  touch "$LOG"
  chmod 600 "$LOG"

  # Rotation simple du journal (une génération) pour éviter une croissance infinie.
  if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    mv -f -- "$LOG" "$LOG.1"
    touch "$LOG"
    chmod 600 "$LOG" "$LOG.1"
  fi

  # Le dump peut être volumineux : refuser de démarrer sans marge.
  local free_mb
  free_mb="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print int($4/1024)}')"
  if [ -n "$free_mb" ] && [ "$free_mb" -lt "$MIN_FREE_MB" ]; then
    fail "espace disque insuffisant : ${free_mb} Mo libres < ${MIN_FREE_MB} Mo requis"
  fi
}

dump_and_verify() {
  local started size magic age
  started="$(date '+%Y-%m-%d %H:%M:%S')"
  log "=== début sauvegarde (base=$PG_DB conteneur=$PG_CONTAINER) ==="

  TMP="$(mktemp "$BACKUP_DIR/.eflex-db-XXXXXX")"
  chmod 600 "$TMP"

  # --compress=0 : gzip fait le travail, le dump custom reste relisible après
  # gunzip. --no-owner/--no-privileges : restauration possible avec un autre
  # rôle. --lock-wait-timeout : ne bloque pas indéfiniment un ALTER TABLE.
  if ! docker exec "$PG_CONTAINER" pg_dump \
    --username "$PG_USER" \
    --dbname "$PG_DB" \
    --format=custom \
    --compress=0 \
    --no-owner \
    --no-privileges \
    --lock-wait-timeout=30s 2>>"$LOG" | gzip -9 >"$TMP"; then
    fail "pg_dump a échoué (voir $LOG)"
  fi

  gzip -t "$TMP" 2>>"$LOG" || fail "archive gzip corrompue (gzip -t)"
  magic="$(gzip -dc -- "$TMP" 2>/dev/null | head -c 5 || true)"
  [ "$magic" = "PGDMP" ] || fail "en-tête pg_dump absent : archive inutilisable"

  size="$(stat -c %s "$TMP")"
  if [ "$size" -lt "$MIN_BYTES" ]; then
    fail "sauvegarde trop petite (${size} octets < ${MIN_BYTES}) : dump suspect"
  fi

  age=$(( $(date +%s) - $(stat -c %Y "$TMP") ))
  if [ "$age" -gt 300 ]; then
    fail "horodatage incohérent : fichier produit il y a ${age} s"
  fi

  log "dump vérifié : $(numfmt --to=iec --suffix=B "$size" 2>/dev/null || echo "$size octets") (démarré à $started)"
}

publish() {
  local daily="$BACKUP_DIR/$DAILY_NAME"

  mv -f -- "$TMP" "$daily"
  TMP=""
  chmod 600 "$daily"
  log "quotidienne : $DAILY_NAME"

  # Une sauvegarde hebdomadaire chaque dimanche, en lien dur : elle survit à la
  # purge des quotidiennes sans consommer d'espace supplémentaire.
  if [ "$(date +%u)" -eq 7 ]; then
    ln -f -- "$daily" "$BACKUP_DIR/$WEEKLY_NAME"
    chmod 600 "$BACKUP_DIR/$WEEKLY_NAME"
    log "hebdomadaire : $WEEKLY_NAME (lien dur sur la quotidienne)"
  fi
}

prune() {
  local prefix="$1" keep="$2"
  local -a files=()
  local file removed=0

  while IFS= read -r -d '' file; do
    files+=("$file")
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${prefix}*" -print0 2>/dev/null)

  local total="${#files[@]}"
  if [ "$total" -le "$keep" ]; then
    log "rétention ${prefix}* : ${total}/${keep}, rien à supprimer"
    return 0
  fi

  # Les noms contiennent une date ISO : l'ordre lexicographique = chronologique.
  while IFS= read -r file; do
    if [ "$removed" -ge $((total - keep)) ]; then
      break
    fi
    rm -f -- "$file"
    log "rétention ${prefix}* : suppression de $(basename "$file")"
    removed=$((removed + 1))
  done < <(printf '%s\n' "${files[@]}" | LC_ALL=C sort)

  log "rétention ${prefix}* : ${keep} conservées, ${removed} supprimée(s)"
}

main() {
  require_tools

  PG_USER="$(resolve_pg_setting EFLEX_PG_USER POSTGRES_USER POSTGRES_USER eflex)"
  PG_DB="$(resolve_pg_setting EFLEX_PG_DB POSTGRES_DB POSTGRES_DB eflex)"
  [[ "$PG_DB" =~ ^[A-Za-z0-9_]+$ ]] || fail "nom de base invalide : '$PG_DB'"

  prepare
  dump_and_verify
  publish
  prune "$DAILY_PREFIX" "$DAILY_KEEP"
  prune "$WEEKLY_PREFIX" "$WEEKLY_KEEP"

  local count size_total
  count="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "${DAILY_PREFIX}*" -o -name "${WEEKLY_PREFIX}*" \) | wc -l)"
  size_total="$(du -sh -- "$BACKUP_DIR" 2>/dev/null | cut -f1)"
  log "=== fin sauvegarde : OK (${count} archive(s), ${size_total} au total) ==="
}

main "$@"
