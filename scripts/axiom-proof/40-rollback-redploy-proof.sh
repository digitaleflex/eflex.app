#!/usr/bin/env bash
# Gabarit de sondes pour redéploiement et scénario d'échec santé/rollback (#12).
# Les actions de déploiement/rupture sont à déclencher par l'opérateur ; ce script aide à mesurer et consigner.
set -euo pipefail

: "${APP_URL:?définir APP_URL (https://...)}"
: "${OUT_DIR:=./evidence-redeploy-$(date -u +%Y%m%dT%H%M%SZ)}"
: "${PROBE_INTERVAL:=1}"
: "${PROBE_DURATION:=120}"
mkdir -p "$OUT_DIR"

log() { printf '[redeploy-proof] %s\n' "$*"; }

log "sonde continue vers $APP_URL pendant ${PROBE_DURATION}s (intervalle ${PROBE_INTERVAL}s)"
log "lancer le redéploiement dans une autre session pendant cette fenêtre"
printf 'timestamp_utc,http_code,time_total\n' >"$OUT_DIR/probe.csv"
end=$((SECONDS + PROBE_DURATION))
while [ $SECONDS -lt $end ]; do
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  read -r code ttotal < <(curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time 10 "$APP_URL" 2>/dev/null || echo "000 0")
  printf '%s,%s,%s\n' "$ts" "$code" "$ttotal" >>"$OUT_DIR/probe.csv"
  sleep "$PROBE_INTERVAL"
done

cat >"$OUT_DIR/health-failure-template.md" <<'MD'
# Scénario d'échec santé / rollback (à compléter)

- Date/heure (UTC) :
- Application / déploiement initial (LIVE) :
- Méthode de provocation de l'échec santé (endpoint, image, config) :
- Déploiement déclenché :
- État observé étape par étape (BUILD/CREATE_RUNTIME/NETWORK/START/VERIFY/...) :
- Comportement observé (rollback, FAILED, conteneurs restants, routage) :
- Conformité avec docs/operations/runbook.md §8 :
- Écarts constatés :
- Preuves (logs moteur/agent, API /health, docker ps, Traefik) :
MD

log "sonde terminée: $OUT_DIR/probe.csv"
log "compléter $OUT_DIR/health-failure-template.md après le scénario de rollback"