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

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

echo "==> 1/4 Démarrage de PostgreSQL et Redis"
"${COMPOSE[@]}" up -d postgres redis

echo "==> 2/4 Migration Prisma (conteneur one-off)"
"${COMPOSE[@]}" --profile tools run --rm migrate

echo "==> 3/4 Build + redémarrage prod"
"${COMPOSE[@]}" up -d --build

echo "==> 4/4 État des services"
"${COMPOSE[@]}" ps

echo
echo "Logs portail (20 dernières lignes) :"
"${COMPOSE[@]}" logs --tail=20 portail || true

echo
echo "Déploiement terminé. Vérifie la santé avec :"
echo "  curl -f ${PORTAL_URL}/api/health"
