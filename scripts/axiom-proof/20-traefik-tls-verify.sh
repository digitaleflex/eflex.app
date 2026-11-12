#!/usr/bin/env bash
# Vérifications DNS/HTTP/HTTPS/TLS et collecte d'état Traefik pour #12.
# Lecture seule côté applicatif distant (curl/openssl/dig) ; lecture locale si exécuté sur le VPS.
set -euo pipefail

OUT_DIR="${OUT_DIR:-./evidence-traefik-tls-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

log() { printf '[traefik-tls] %s\n' "$*"; }

: "${APP_DOMAIN:?définir APP_DOMAIN (domaine applicatif à vérifier)}"

resolve() {
  log "DNS $APP_DOMAIN"
  if command -v dig >/dev/null 2>&1; then
    dig +noall +answer "$APP_DOMAIN" | tee "$OUT_DIR/dns-answer.txt" || true
    dig +short "$APP_DOMAIN" | tee "$OUT_DIR/dns-short.txt" || true
  elif command -v host >/dev/null 2>&1; then
    host "$APP_DOMAIN" | tee "$OUT_DIR/dns-host.txt" || true
  else
    log "aucun outil DNS disponible" | tee "$OUT_DIR/dns-missing.txt"
  fi
}

probe_http() {
  log "HTTP (redirect/état)"
  curl -sv --max-time 20 -o "$OUT_DIR/http-body.txt" -D "$OUT_DIR/http-headers.txt" \
    "http://$APP_DOMAIN/" >"$OUT_DIR/http-curl.log" 2>&1 || true
}

probe_https() {
  log "HTTPS"
  curl -svk --max-time 20 -o "$OUT_DIR/https-body.txt" -D "$OUT_DIR/https-headers.txt" \
    "https://$APP_DOMAIN/" >"$OUT_DIR/https-curl.log" 2>&1 || true
  log "certificat (openssl)"
  # -servername pour SNI ; connexion peut échouer si DNS/routage incorrect.
  echo | openssl s_client -servername "$APP_DOMAIN" -connect "$APP_DOMAIN:443" \
    -showcerts 2>"$OUT_DIR/openssl-stderr.txt" | tee "$OUT_DIR/openssl.txt" >/dev/null || true
  openssl x509 -noout -subject -issuer -dates -ext subjectAltName \
    -in <(awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print; if(/END CERTIFICATE/) exit}' "$OUT_DIR/openssl.txt" 2>/dev/null || true) \
    >"$OUT_DIR/cert-summary.txt" 2>&1 || true
}

collect_local_traefik() {
  if [ "${COLLECT_LOCAL_TRAEFIK:-0}" != "1" ]; then
    log "collecte Traefik locale ignorée (définir COLLECT_LOCAL_TRAEFIK=1 sur le VPS)"
    return 0
  fi
  log "collecte locale Traefik"
  docker ps --format '{{.Names}}\t{{.Status}}\t{{.Image}}' >"$OUT_DIR/docker-ps.txt" 2>&1 || true
  if docker ps --format '{{.Names}}' | grep -qx "${TRAEFIK_CONTAINER:-traefik}"; then
    docker logs --tail 400 "${TRAEFIK_CONTAINER:-traefik}" >"$OUT_DIR/traefik.log" 2>&1 || true
  fi
  if [ -d "${TRAEFIK_DYNAMIC_DIR:-/etc/traefik/dynamic}" ]; then
    ls -la "${TRAEFIK_DYNAMIC_DIR:-/etc/traefik/dynamic}" >"$OUT_DIR/traefik-dynamic-ls.txt" 2>&1 || true
    # Ne pas copier acme.json brut s'il contient des clés privées ; préférer un résumé contrôlé.
    find "${TRAEFIK_DYNAMIC_DIR:-/etc/traefik/dynamic}" -maxdepth 1 -type f -name '*.yml' -o -name '*.yaml' 2>/dev/null | \
      while read -r f; do cp "$f" "$OUT_DIR/$(basename "$f").snapshot" 2>/dev/null || true; done
  fi
}

resolve
probe_http
probe_https
collect_local_traefik

log "preuves écrites dans $OUT_DIR"
log "interprétation humaine requise : ce script ne conclut pas à un certificat valide."