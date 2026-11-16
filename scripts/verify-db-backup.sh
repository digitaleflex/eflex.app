#!/usr/bin/env bash
# Vérifie qu'une sauvegarde PostgreSQL se restaure vraiment.
#
# Restaure le fichier dans un conteneur PostgreSQL jetable (jamais dans la base de production),
# puis compte les tables et les lignes. Une sauvegarde qui n'a jamais été restaurée n'est pas une
# garantie : lancez ce script au moins une fois par mois sur une sauvegarde récente de chaque base.
#
# Usage :
#   bash scripts/verify-db-backup.sh <fichier-de-sauvegarde> [version-postgres]
#
#   <fichier-de-sauvegarde>  fichier produit par Coolify (pg_dump au format « custom », souvent
#                            *.dmp), sur le serveur : /data/coolify/backups/databases/…
#   [version-postgres]       version majeure de la base d'origine (défaut : 16)
#
# Code de sortie : 0 si la restauration réussit et contient au moins une table, 1 sinon.
set -euo pipefail

FILE="${1:-}"
PG_VERSION="${2:-16}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage : bash scripts/verify-db-backup.sh <fichier-de-sauvegarde> [version-postgres]" >&2
  exit 1
fi
if ! [[ "$PG_VERSION" =~ ^[0-9]{2}$ ]]; then
  echo "Version PostgreSQL invalide : $PG_VERSION (exemple : 16)" >&2
  exit 1
fi
command -v docker >/dev/null || { echo "Docker est requis." >&2; exit 1; }

FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
NAME="eflex-restore-check-$$"
PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ Fichier : $FILE ($(du -h "$FILE" | cut -f1))"
echo "→ Démarrage d'un PostgreSQL $PG_VERSION jetable (sans réseau)…"
docker run -d --name "$NAME" --network none \
  -e POSTGRES_PASSWORD="$PASSWORD" -e POSTGRES_DB=restore_check \
  -v "$FILE":/backup/dump:ro \
  "postgres:${PG_VERSION}-alpine" >/dev/null

# L'image démarre un serveur temporaire pour s'initialiser, l'arrête, puis lance le vrai serveur :
# on attend la fin de l'initialisation avant de tester la disponibilité.
READY=0
for _ in $(seq 1 90); do
  if docker logs "$NAME" 2>&1 | grep -q "init process complete" \
    && docker exec "$NAME" pg_isready -U postgres -d restore_check >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [[ "$READY" -ne 1 ]]; then
  echo "✗ PostgreSQL n'a pas démarré. Derniers journaux :" >&2
  docker logs --tail 20 "$NAME" >&2 || true
  exit 1
fi

echo "→ Restauration…"
START=$(date +%s)
if ! docker exec "$NAME" pg_restore -U postgres -d restore_check --no-owner --no-privileges --exit-on-error /backup/dump; then
  # Fichier au format texte (pg_dump sans --format=custom) : on tente psql, sans les propriétaires
  # ni les droits, qui désignent des rôles absents du conteneur jetable.
  if ! docker exec "$NAME" sh -c "grep -vE '^(ALTER .* OWNER TO |GRANT |REVOKE )' /backup/dump | psql -v ON_ERROR_STOP=1 -U postgres -d restore_check -q >/dev/null"; then
    echo "✗ Échec : le fichier ne se restaure pas." >&2
    exit 1
  fi
fi
DURATION=$(( $(date +%s) - START ))

TABLES=$(docker exec "$NAME" psql -U postgres -d restore_check -At -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type='BASE TABLE';")
# Les statistiques ne sont pas encore calculées juste après la restauration : ANALYZE d'abord.
docker exec "$NAME" psql -U postgres -d restore_check -q -c "ANALYZE;" >/dev/null
ROWS=$(docker exec "$NAME" psql -U postgres -d restore_check -At -c \
  "SELECT coalesce(sum(n_live_tup),0) FROM pg_stat_user_tables;")

echo "→ Tables restaurées : $TABLES · lignes (estimation) : $ROWS · durée : ${DURATION} s"
if [[ "$TABLES" -lt 1 ]]; then
  echo "✗ Échec : la restauration ne contient aucune table." >&2
  exit 1
fi
echo "✓ Sauvegarde restaurable. Notez la date de ce test dans le suivi d'exploitation."
