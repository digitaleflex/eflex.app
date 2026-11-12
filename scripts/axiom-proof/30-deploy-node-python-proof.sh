#!/usr/bin/env bash
# Gabarit d'orchestration API pour les preuves de déploiement Node/Python (#12).
# Ce script ne devine pas les IDs/réponses exactes de votre instance : il fournit
# des appels curl traçables à adapter. Il ne prouve rien sans analyse des sorties.
set -euo pipefail

: "${AXIOM_ENGINE_URL:?}"
: "${AXIOM_API_TOKEN:?}"
: "${OUT_DIR:=./evidence-deploy-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

api() {
  local method="$1" path="$2" body="${3:-}"
  shift 3 || true
  local url="${AXIOM_ENGINE_URL%/}${path}"
  local args=(-sS -D "$OUT_DIR/headers-$(date +%s%N).txt" -w '\n%{http_code}' -X "$method" "$url" \
    -H "Authorization: Bearer ${AXIOM_API_TOKEN}" -H 'Content-Type: application/json')
  if [ -n "$body" ]; then args+=(--data "$body"); fi
  curl "${args[@]}" "$@"
}

log() { printf '[deploy-proof] %s\n' "$*"; }

log "IMPORTANT: adaptez les endpoints/payloads à la version réelle de l'API déployée."
log "Consultez docs/architecture/api-contract.md et les routes services/engine/internal/api."

cat >"$OUT_DIR/README.txt" <<'TXT'
Ce dossier doit contenir, pour chaque déploiement (Node, Python) :
- requête de création/analyse/plan/déploiement (JSON masqué si sensible)
- réponses complètes et codes HTTP
- identifiants (applicationId, analysisId, planId, deploymentId, serverId)
- polling d'état jusqu'à LIVE/FAILED (horodaté)
- sondes HTTPS finales (curl + openssl) via scripts/axiom-proof/20-traefik-tls-verify.sh
TXT

# Exemple de squelette (à décommenter/adapter) :
# log "liste serveurs"
# api GET "/api/v1/servers" | tee "$OUT_DIR/servers.json"
#
# log "créer déploiement (adapter payload)"
# api POST "/api/v1/applications/${APP_ID}/deployments" '{"planId":"..."}' | tee "$OUT_DIR/deploy-create.json"

log "gabarit prêt : complétez les appels selon votre flux (GitHub/analyse/plan ou fixtures)." 
log "sorties à placer dans $OUT_DIR"