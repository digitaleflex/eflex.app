#!/usr/bin/env bash
# Pré-vol pour validations réelles Axiom #12/#13.
# N'effectue aucune modification. Vérifie les outils, variables et signaux réseau de base.
set -euo pipefail

log() { printf '[preflight] %s\n' "$*"; }
warn() { printf '[preflight][WARN] %s\n' "$*" >&2; }
fail() { printf '[preflight][FAIL] %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "commande requise introuvable: $1"
}

check_var() {
  local name="$1" required="${2:-0}"
  if [ -z "${!name:-}" ]; then
    if [ "$required" = "1" ]; then
      fail "variable requise manquante: $name"
    else
      warn "variable optionnelle non définie: $name"
    fi
  else
    log "variable définie: $name"
  fi
}

log "vérification des outils de base"
for c in bash curl openssl; do need_cmd "$c"; done
command -v jq >/dev/null 2>&1 || warn "jq non installé (recommandé pour les scripts API)"
if command -v dig >/dev/null 2>&1; then DNS_TOOL=dig
elif command -v host >/dev/null 2>&1; then DNS_TOOL=host
elif command -v nslookup >/dev/null 2>&1; then DNS_TOOL=nslookup
else warn "aucun outil DNS (dig/host/nslookup) trouvé"; DNS_TOOL=""; fi

log "variables (adapter selon le scénario)"
check_var AXIOM_ENGINE_URL 0
check_var AXIOM_API_TOKEN 0
check_var AXIOM_SERVER_ID 0
check_var APP_DOMAIN_NODE 0
check_var APP_DOMAIN_PYTHON 0
check_var AGENT_HOST 0

resolve_domain() {
  local d="$1"
  [ -z "$d" ] && return 0
  [ -z "$DNS_TOOL" ] && { warn "résolution ignorée (pas d'outil DNS) pour $d"; return 0; }
  log "résolution DNS: $d"
  case "$DNS_TOOL" in
    dig) dig +short "$d" || true ;;
    host) host "$d" || true ;;
    nslookup) nslookup "$d" || true ;;
  esac
}

for d in "${APP_DOMAIN_NODE:-}" "${APP_DOMAIN_PYTHON:-}"; do resolve_domain "$d"; done

if [ -n "${AXIOM_ENGINE_URL:-}" ]; then
  log "sonde moteur (best effort)"
  curl -fsS --max-time 10 "${AXIOM_ENGINE_URL%/}/health" >/dev/null 2>&1 && log "GET /health OK" || warn "GET /health indisponible ou non exposé"
  curl -fsS --max-time 10 "${AXIOM_ENGINE_URL%/}/ready" >/dev/null 2>&1 && log "GET /ready OK" || warn "GET /ready indisponible ou non exposé"
fi

log "pré-vol terminé (aucune modification effectuée)"