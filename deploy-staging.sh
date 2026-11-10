#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Déploiement de l'environnement de STAGING Eflex.
# ---------------------------------------------------------------------------
# Ce script ne touche jamais à la production :
#   * il n'utilise QUE docker-compose.staging.yml et .env.staging ;
#   * il force le projet Compose `eflex-staging` ;
#   * il refuse toute DATABASE_URL qui ressemble à la base de production.
#
# Usage :
#   cp .env.staging.example .env.staging   # puis renseigner les secrets
#   bash deploy-staging.sh
#
# Options (variables d'environnement) :
#   ENV_FILE=.env.staging       fichier de variables (défaut)
#   STAGING_DOMAIN=...          surcharge le domaine vérifié en HTTPS
#   STAGING_PORTAL_PORT=...     surcharge le port local de secours
#   CHECK_ONLY=1                vérifications + config Compose, sans rien démarrer
#   SKIP_HEALTHCHECK=1          ne pas attendre /api/health
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.staging.yml"
COMPOSE_PROJECT="eflex-staging"
ENV_FILE="${ENV_FILE:-.env.staging}"
STAGING_DOMAIN="${STAGING_DOMAIN:-}"
STAGING_PORTAL_PORT="${STAGING_PORTAL_PORT:-}"

COMPOSE=(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
die()  { echo "ERREUR : $*" >&2; exit 1; }
warn() { echo "ATTENTION : $*" >&2; }

# Lit la dernière occurrence de KEY= dans un fichier .env (guillemets retirés).
file_value() {
  local file="$1" key="$2"
  grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -n 1 | cut -d= -f2- |
    sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true
}

env_value() { file_value "$ENV_FILE" "$1"; }

# Domaine/port : priorité au shell, puis au fichier .env.staging, puis défauts.
STAGING_DOMAIN="${STAGING_DOMAIN:-$(env_value STAGING_DOMAIN)}"
STAGING_DOMAIN="${STAGING_DOMAIN:-staging.eflex.app}"
STAGING_PORTAL_PORT="${STAGING_PORTAL_PORT:-$(env_value STAGING_PORTAL_PORT)}"
STAGING_PORTAL_PORT="${STAGING_PORTAL_PORT:-3001}"

mask() {
  local value="$1"
  if [ "${#value}" -le 8 ]; then printf '***'; else printf '%s…' "${value:0:4}"; fi
}

echo "==> Staging Eflex — vérifications préalables"

# ---------------------------------------------------------------------------
# 1. Fichiers et garde-fous de base
# ---------------------------------------------------------------------------
[ -f "$COMPOSE_FILE" ] || die "$COMPOSE_FILE introuvable (lancer depuis la racine du dépôt)."
[ -f "$ENV_FILE" ] || die "$ENV_FILE introuvable. Copie d'abord : cp .env.staging.example .env.staging"

case "$ENV_FILE" in
  *prod*) die "$ENV_FILE ressemble à un fichier de production : le staging exige .env.staging." ;;
esac

command -v docker >/dev/null 2>&1 || die "docker est introuvable."
docker compose version >/dev/null 2>&1 || die "le plugin 'docker compose' est introuvable."

# ---------------------------------------------------------------------------
# 2. Secrets obligatoires
# ---------------------------------------------------------------------------
DATABASE_URL_VALUE="$(env_value DATABASE_URL)"
REDIS_URL_VALUE="$(env_value REDIS_URL)"
POSTGRES_PASSWORD_VALUE="$(env_value POSTGRES_PASSWORD)"
REDIS_PASSWORD_VALUE="$(env_value REDIS_PASSWORD)"
BETTER_AUTH_SECRET_VALUE="$(env_value BETTER_AUTH_SECRET)"
ENV_ENCRYPTION_KEY_VALUE="$(env_value ENV_ENCRYPTION_KEY)"

[ -n "$DATABASE_URL_VALUE" ] || die "DATABASE_URL est vide dans $ENV_FILE."
[ -n "$REDIS_URL_VALUE" ]    || die "REDIS_URL est vide dans $ENV_FILE."
[ -n "$POSTGRES_PASSWORD_VALUE" ] || die "POSTGRES_PASSWORD est vide dans $ENV_FILE."
[ -n "$REDIS_PASSWORD_VALUE" ]    || die "REDIS_PASSWORD est vide dans $ENV_FILE."
[ -n "$BETTER_AUTH_SECRET_VALUE" ] || die "BETTER_AUTH_SECRET est vide dans $ENV_FILE."
[ -n "$ENV_ENCRYPTION_KEY_VALUE" ] || die "ENV_ENCRYPTION_KEY est vide dans $ENV_FILE (openssl rand -base64 32)."

# ---------------------------------------------------------------------------
# 3. GARDE-FOU ANTI-PRODUCTION sur la base de données
# ---------------------------------------------------------------------------
# Refus explicite si l'URL pointe vers la base de production `eflex`.
case "$DATABASE_URL_VALUE" in
  */eflex|*/eflex\?*|*/eflex\"*|*/eflex\'*)
    die "DATABASE_URL pointe vers la base de production '/eflex'. Le staging doit utiliser 'eflex_staging'. Rien n'a été démarré." ;;
esac

DB_NAME="$(printf '%s' "$DATABASE_URL_VALUE" | sed -E 's|^[^/]*//[^/]*/([^?]*).*|\1|')"
DB_HOST="$(printf '%s' "$DATABASE_URL_VALUE" | sed -E 's|^[a-z+]+://([^@/]*@)?([^:/?]+).*|\2|')"

[ "$DB_NAME" = "eflex_staging" ] || die "DATABASE_URL doit cibler la base 'eflex_staging' (trouvé : '$DB_NAME'). Rien n'a été démarré."

case "$DB_HOST" in
  eflex-postgres)
    die "DATABASE_URL pointe vers le conteneur de production 'eflex-postgres'. Utiliser 'eflex-staging-postgres'. Rien n'a été démarré." ;;
esac

REDIS_HOST="$(printf '%s' "$REDIS_URL_VALUE" | sed -E 's|^[a-z+]+://([^@/]*@)?([^:/?]+).*|\2|')"
case "$REDIS_HOST" in
  eflex-redis)
    die "REDIS_URL pointe vers le Redis de production 'eflex-redis'. Utiliser 'eflex-staging-redis'. Rien n'a été démarré." ;;
esac

POSTGRES_DB_VALUE="$(env_value POSTGRES_DB)"
if [ -n "$POSTGRES_DB_VALUE" ] && [ "$POSTGRES_DB_VALUE" != "eflex_staging" ]; then
  die "POSTGRES_DB doit valoir 'eflex_staging' (trouvé : '$POSTGRES_DB_VALUE')."
fi

echo "    Base ciblée   : $DB_NAME @ $DB_HOST (utilisateur $(env_value POSTGRES_USER))"
echo "    Redis ciblé   : $REDIS_HOST"
echo "    Clé de chiffrement : $(mask "$ENV_ENCRYPTION_KEY_VALUE") (doit différer de la prod)"

# ---------------------------------------------------------------------------
# 4. Avertissements d'isolation (non bloquants)
# ---------------------------------------------------------------------------
if [ -f .env.prod ]; then
  for key in BETTER_AUTH_SECRET ENV_ENCRYPTION_KEY POSTGRES_PASSWORD REDIS_PASSWORD; do
    prod_value="$(file_value .env.prod "$key")"
    staging_value="$(env_value "$key")"
    if [ -n "$prod_value" ] && [ "$prod_value" = "$staging_value" ]; then
      warn "$key est identique à celui de .env.prod : le staging doit avoir ses propres secrets."
    fi
  done
fi

if grep -qE '^COOLIFY_PROJECT_NAME=Eflex$' "$ENV_FILE" 2>/dev/null; then
  warn "COOLIFY_PROJECT_NAME=Eflex : le staging piloterait le projet Coolify de production. Utiliser 'Eflex Staging'."
fi

if [ "${CHECK_ONLY:-0}" != "1" ] && ! docker network inspect proxy >/dev/null 2>&1; then
  die "réseau Docker 'proxy' introuvable (Traefik requis pour https://${STAGING_DOMAIN}).
       Démarrer Traefik, ou retirer les labels/le réseau 'proxy' de $COMPOSE_FILE
       pour un staging local uniquement (accès http://127.0.0.1:${STAGING_PORTAL_PORT})."
fi

# ---------------------------------------------------------------------------
# 5. Validation de la configuration Compose (sans rien démarrer)
# ---------------------------------------------------------------------------
echo "==> 1/5 Validation de la configuration Compose"
"${COMPOSE[@]}" config -q
echo "    Configuration valide."

if [ "${CHECK_ONLY:-0}" = "1" ]; then
  echo
  echo "CHECK_ONLY=1 : vérifications terminées, aucun conteneur n'a été démarré."
  exit 0
fi

# ---------------------------------------------------------------------------
# 6. Base + migrations
# ---------------------------------------------------------------------------
echo "==> 2/5 Démarrage de PostgreSQL et Redis (staging)"
"${COMPOSE[@]}" up -d postgres redis

echo "==> 3/5 Migration Prisma (conteneur one-off)"
# L'image du profil `tools` embarque portail/prisma : la reconstruire à chaque
# fois, sinon les nouvelles migrations ne sont pas vues.
"${COMPOSE[@]}" --profile tools build migrate
"${COMPOSE[@]}" --profile tools run --rm migrate

# ---------------------------------------------------------------------------
# 7. Build + démarrage du portail
# ---------------------------------------------------------------------------
echo "==> 4/5 Build + démarrage du portail"
"${COMPOSE[@]}" up -d --build

# ---------------------------------------------------------------------------
# 8. Vérification de santé
# ---------------------------------------------------------------------------
echo "==> 5/5 Vérification de santé"
if [ "${SKIP_HEALTHCHECK:-0}" = "1" ]; then
  warn "vérification de santé ignorée (SKIP_HEALTHCHECK=1)."
else
  LOCAL_HEALTH="http://127.0.0.1:${STAGING_PORTAL_PORT}/api/health"
  PUBLIC_HEALTH="https://${STAGING_DOMAIN}/api/health"
  HEALTHY=0

  # 1) Santé du conteneur via le bind loopback (indépendant du DNS/TLS).
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$LOCAL_HEALTH" >/dev/null 2>&1; then
      HEALTHY=1
      break
    fi
    sleep 2
  done

  if [ "$HEALTHY" -ne 1 ]; then
    echo "    ÉCHEC : $LOCAL_HEALTH ne répond pas." >&2
    echo "    Diagnostic :" >&2
    echo "      ${COMPOSE[*]} ps" >&2
    echo "      ${COMPOSE[*]} logs --tail=80 portail" >&2
    exit 1
  fi
  echo "    Conteneur sain : $LOCAL_HEALTH"

  # 2) Exposition publique : peut échouer si le DNS n'est pas encore propagé
  #    ou si Let's Encrypt n'a pas encore émis le certificat. Non bloquant.
  PUBLIC_OK=0
  for _ in $(seq 1 10); do
    if curl -fsS --max-time 5 "$PUBLIC_HEALTH" >/dev/null 2>&1; then
      PUBLIC_OK=1
      break
    fi
    sleep 2
  done

  if [ "$PUBLIC_OK" -eq 1 ]; then
    echo "    Exposition publique OK : $PUBLIC_HEALTH"
  else
    warn "https://${STAGING_DOMAIN}/api/health ne répond pas encore."
    echo "    Causes probables : DNS non propagé, certificat non émis, ou Traefik non rechargé."
    echo "    Vérifier : dig +short ${STAGING_DOMAIN}"
    echo "               docker logs traefik --tail=50"
    echo "    Le staging reste accessible en local : http://127.0.0.1:${STAGING_PORTAL_PORT}"
  fi
fi

echo
echo "==> État des services (staging)"
"${COMPOSE[@]}" ps

echo
echo "Logs portail (20 dernières lignes) :"
"${COMPOSE[@]}" logs --tail=20 portail || true

echo
echo "Staging prêt (ou presque). Accès :"
echo "  local  : http://127.0.0.1:${STAGING_PORTAL_PORT}"
echo "  public : https://${STAGING_DOMAIN} (si DNS + certificat)"
echo "Rappel : ce script ne touche ni aux conteneurs eflex-portail/eflex-postgres/eflex-redis,"
echo "         ni aux volumes eflex_postgres_data, ni au projet Coolify de production."
