#!/usr/bin/env bash
# Gabarit de provisionnement VPS pour validation réelle Axiom #12/#13.
# À LIRE ET ADAPTER AVANT EXÉCUTION. Peut modifier le système (paquets, Docker, fichiers).
# Usage recommandé : exécuter manuellement étape par étape sur un VPS jetable.
set -euo pipefail

: "${EFLEX_ROOT_DOMAIN:?définir EFLEX_ROOT_DOMAIN (domaine racine de test)}"
: "${ACME_EMAIL:?définir ACME_EMAIL (Let's Encrypt)}"
: "${TRAEFIK_DYNAMIC_DIR:=/etc/traefik/dynamic}"
: "${TRAEFIK_ACME_DIR:=/etc/traefik/acme}"
: "${AXIOM_AGENT_DATA_DIR:=/var/lib/axiom-agent}"

if [ "${I_UNDERSTAND_THIS_SCRIPT:-0}" != "1" ]; then
  cat >&2 <<'MSG'
[provision] Refus par sécurité.
Ce script est un gabarit qui peut installer des paquets et écrire sous /etc.
1. Relisez-le entièrement.
2. Adaptez-le à votre OS (Ubuntu/Debian attendu) et à votre politique de sécurité.
3. Relancez avec I_UNDERSTAND_THIS_SCRIPT=1.

Aucune action effectuée.
MSG
  exit 2
fi

log() { printf '[provision] %s\n' "$*"; }

log "mise à jour paquets (exemple Debian/Ubuntu)"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release jq openssl

if ! command -v docker >/dev/null 2>&1; then
  log "Docker non détecté : installer Docker Engine selon la documentation officielle avant de continuer."
  log "Ce gabarit ne force pas une méthode d'installation unique."
  exit 1
fi

log "création des répertoires"
install -d -m 0755 "$TRAEFIK_DYNAMIC_DIR"
install -d -m 0700 "$TRAEFIK_ACME_DIR"
install -d -m 0700 "$AXIOM_AGENT_DATA_DIR"
[ -f "$TRAEFIK_ACME_DIR/acme.json" ] || (touch "$TRAEFIK_ACME_DIR/acme.json" && chmod 600 "$TRAEFIK_ACME_DIR/acme.json")

log "rappel Traefik"
cat <<EOF
- Exposer 80/tcp et 443/tcp vers Internet.
- Configurer entrypoints web/websecure, provider file sur $TRAEFIK_DYNAMIC_DIR, ACME HTTP-01 avec stockage $TRAEFIK_ACME_DIR/acme.json.
- S'assurer que le DNS de *.${EFLEX_ROOT_DOMAIN} (ou vos hôtes applicatifs) pointe vers l'IP publique de ce VPS.
- Ne pas activer de dashboard Traefik non protégé en environnement exposé.

Ce script ne déploie pas automatiquement une configuration Traefik complète : utilisez TRAEFIK_SETUP.md comme base de comparaison et adaptez-la au contexte réel.
EOF

log "provisionnement gabarit terminé"