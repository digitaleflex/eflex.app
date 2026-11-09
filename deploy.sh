#!/usr/bin/env bash
# Déploiement prod du portail Eflex.
# Traefik n'est pas lancé ici : on utilise celui déjà en place sur le réseau `proxy`.
# Usage : bash deploy.sh   (ou chmod +x deploy.sh && ./deploy.sh)
set -euo pipefail

cd "$(dirname "$0")"

# Source unique des domaines : une seule variable à modifier dans config/domains.sh.
# Les variables exportées sont prioritaires sur --env-file pour l'interpolation Compose.
set -a
. ./config/domains.sh
set +a

if [ ! -f .env.prod ]; then
  echo "ERREUR : .env.prod introuvable."
  echo "Copie d'abord : cp .env.prod.example .env.prod  (puis renseigne les secrets)"
  exit 1
fi

if ! docker network inspect proxy >/dev/null 2>&1; then
  echo "ERREUR : réseau Docker 'proxy' introuvable."
  echo "Traefik doit tourner et exposer ce réseau avant le déploiement."
  exit 1
fi

if ! grep -qE '^ENV_ENCRYPTION_KEY=.+' .env.prod; then
  echo "ERREUR : ENV_ENCRYPTION_KEY est absente ou vide dans .env.prod."
  echo "Générez-la avec : openssl rand -base64 32"
  exit 1
fi

if ! grep -qE '^RESEND_API_KEY=.+' .env.prod; then
  echo "ATTENTION : RESEND_API_KEY est vide — la vérification d'e-mail reste désactivée."
fi

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

echo "==> 1/5 Démarrage de PostgreSQL et Redis"
"${COMPOSE[@]}" up -d postgres redis

echo "==> 2/5 Migration Prisma (conteneur one-off)"
# L'image du profil `tools` embarque le dossier prisma/ : il faut la
# reconstruire à chaque déploiement, sinon les nouvelles migrations ne sont
# pas vues (up -d --build ne couvre pas les services hors profil).
"${COMPOSE[@]}" --profile tools build migrate
"${COMPOSE[@]}" --profile tools run --rm migrate

echo "==> 3/5 Build + redémarrage prod"
"${COMPOSE[@]}" up -d --build

echo "==> 4/5 Attente de la disponibilité du portail"
# Traefik met quelques dizaines de secondes à re-détecter le conteneur recréé.
# Sans cette attente, le déploiement semblerait terminé alors que le site
# renvoie encore un 404 temporaire.
PORTAL_READY=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 "${PORTAL_URL}/api/health" >/dev/null 2>&1; then
    PORTAL_READY=1
    break
  fi
  sleep 2
done
if [ "$PORTAL_READY" -eq 1 ]; then
  echo "    Portail disponible sur ${PORTAL_URL}."
else
  echo "    ATTENTION : le portail ne répond pas encore via Traefik."
  echo "    À vérifier : docker logs traefik"
  echo "                 ${COMPOSE[*]} ps"
fi

echo "==> 5/5 État des services"
"${COMPOSE[@]}" ps

echo
echo "Logs portail (20 dernières lignes) :"
"${COMPOSE[@]}" logs --tail=20 portail || true

echo
echo "Déploiement terminé. Vérifie la santé avec :"
echo "  curl -f ${PORTAL_URL}/api/health"
