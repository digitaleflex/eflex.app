#!/usr/bin/env bash
# Aide opérateur pour enrôlement agent distant (#13).
# Effectue uniquement des appels API de contrôle/statut côté moteur et des vérifications locales.
# N'installe pas l'agent automatiquement sur la machine distante.
set -euo pipefail

: "${AXIOM_ENGINE_URL:?}"
: "${AXIOM_API_TOKEN:?}"
: "${SERVER_ID:?}"   # serveur en état pending
: "${OUT_DIR:=./evidence-agent-enroll-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

api() {
  local method="$1" path="$2" body="${3:-}"
  local url="${AXIOM_ENGINE_URL%/}${path}"
  local args=(-sS -w '\n%{http_code}' -X "$method" "$url" -H "Authorization: Bearer ${AXIOM_API_TOKEN}")
  if [ -n "$body" ]; then
    args+=( -H 'Content-Type: application/json' --data "$body" )
  fi
  curl "${args[@]}"
}

mask_token_file() {
  # Remplace la valeur du token dans un fichier JSON de réponse par [REDACTED].
  local in="$1" out="$2"
  if command -v jq >/dev/null 2>&1; then
    jq 'if has("token") then .token="[REDACTED]" else . end' "$in" >"$out" 2>/dev/null || cp "$in" "$out"
  else
    sed -E 's/"token"[[:space:]]*:[[:space:]]*"[^"]+"/"token":"[REDACTED]"/g' "$in" >"$out" || cp "$in" "$out"
  fi
}

log() { printf '[agent-enroll] %s\n' "$*"; }

log "1) émission du jeton bootstrap (usage unique) pour serverId=$SERVER_ID"
resp=$(api POST "/api/v1/servers/${SERVER_ID}/bootstrap")
http_code=$(printf '%s' "$resp" | tail -n1)
body=$(printf '%s' "$resp" | sed '$d')
printf '%s' "$body" >"$OUT_DIR/bootstrap.raw.json"
mask_token_file "$OUT_DIR/bootstrap.raw.json" "$OUT_DIR/bootstrap.redacted.json"
printf '%s\n' "$http_code" >"$OUT_DIR/bootstrap.http_code"

if [ "$http_code" != "200" ]; then
  log "échec bootstrap (HTTP $http_code). Voir bootstrap.redacted.json"
  exit 1
fi

log "Jeton émis. IMPORTANT: récupérer le token depuis bootstrap.raw.json sur un canal sûr, puis supprimer bootstrap.raw.json."
log "Ne jamais committer bootstrap.raw.json."

cat >"$OUT_DIR/remote-steps.md" <<'MD'
# Étapes à exécuter sur le VPS distant (agent)

1. Installer Docker et préparer les répertoires (DataRoot, Traefik dynamic dir si requis).
2. Déposer la configuration (voir scripts/axiom-proof/agent/axiom-agent.env.example, .service.example).
3. Définir AXIOM_AGENT_TOKEN avec le jeton bootstrap (une seule fois) et démarrer l'agent.
4. Vérifier les logs : "agent registered", agentId/serverId, négociation, clé d'opération émise.
5. Supprimer AXIOM_AGENT_TOKEN de la configuration de service et redémarrer : l'agent doit repartir avec l'état persisté.
6. Vérifier depuis le moteur : GET /api/v1/agent/status?serverId=... et heartbeats.
7. Tenter de réutiliser le même token bootstrap : doit échouer (preuve d'usage unique).

Preuves à collecter (sans secrets) : extraits de logs, statut API, permissions de DataRoot, noms des fichiers persistés, horodatages.
MD

log "2) vérification de statut (avant/après installation selon le moment)"
api GET "/api/v1/agent/status?serverId=${SERVER_ID}" | tee "$OUT_DIR/agent-status.txt" >/dev/null || true

log "dossier de preuves: $OUT_DIR"