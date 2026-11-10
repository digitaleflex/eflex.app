#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Validation réelle des volumes persistants Coolify (Eflex)
# ═══════════════════════════════════════════════════════════════════════════
# Crée une application JETABLE dans un projet Coolify de staging, y monte un
# stockage persistant, déploie, écrit un fichier, redéploie et vérifie que le
# fichier a survécu. L'application, son conteneur et son volume sont supprimés
# à la fin (sauf --keep).
#
# Le dépôt de test par défaut est public et sans dépendance :
#   https://github.com/digitaleflex/eflex-volume-smoke
# (`GET /write` écrit /data/eflex-volume-test.txt, `GET /read` le relit.)
#
# Usage :
#   bash scripts/validate-persistent-volume.sh                # run + nettoyage
#   bash scripts/validate-persistent-volume.sh --keep         # laisse l'app
#   bash scripts/validate-persistent-volume.sh --dry-run      # affiche le plan
#
# Variables :
#   EFLEX_ENV_FILE        fichier de variables (déf. <repo>/.env.staging ;
#                         un fichier .env.prod est TOUJOURS refusé)
#   EFLEX_SMOKE_PROJECT   projet Coolify cible (déf. « Eflex Staging »)
#   EFLEX_SMOKE_ENV       environnement Coolify (déf. vide → premier trouvé)
#   EFLEX_SMOKE_REPO      dépôt public à déployer
#   EFLEX_SMOKE_MOUNT     point de montage (déf. /data)
#   EFLEX_SMOKE_STORAGE   nom du stockage (déf. eflex-volume-test)
#   EFLEX_SMOKE_TIMEOUT   attente max d'un déploiement en s (déf. 600)
#
# Garde-fous :
#   - refuse toute cible qui n'est pas un projet de staging, et tout fichier
#     d'environnement de production ;
#   - le nom d'application commence par `volume-smoke-`, sinon abandon ;
#   - `docker exec` n'est autorisé que sur les conteneurs de CETTE application ;
#     les noms `eflex-portail`, `eflex-postgres`, `eflex-redis`,
#     `eflex-staging-*` et `coolify*` sont bloqués ;
#   - le jeton Coolify n'est jamais affiché ni écrit sur disque.
#
# Code de sortie : 0 si la persistance est prouvée, 1 sinon.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${EFLEX_ENV_FILE:-$REPO_DIR/.env.staging}"
PROJECT_NAME="${EFLEX_SMOKE_PROJECT:-Eflex Staging}"
ENV_NAME="${EFLEX_SMOKE_ENV:-}"
SMOKE_REPO="${EFLEX_SMOKE_REPO:-https://github.com/digitaleflex/eflex-volume-smoke}"
MOUNT_PATH="${EFLEX_SMOKE_MOUNT:-/data}"
STORAGE_NAME="${EFLEX_SMOKE_STORAGE:-eflex-volume-test}"
DEPLOY_TIMEOUT="${EFLEX_SMOKE_TIMEOUT:-600}"
KEEP=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) printf 'Option inconnue : %s\n' "$arg" >&2; exit 2 ;;
  esac
done

# Les journaux vont sur stderr : stdout reste réservé aux valeurs capturées
# par les substitutions de commandes (uuid, statuts).
log() { printf '%s [%s] %s\n' "$(date '+%H:%M:%S')" "$1" "$2" >&2; }
die() { log ERREUR "$1"; exit 1; }

# api METHOD PATH [JSON] : renseigne les globales API_STATUS et API_BODY.
# Aucune sortie sur stdout : l'appelant lit $API_BODY, ce qui fonctionne même
# dans une substitution de commandes (`x="$(f)"`).
API_STATUS=""
API_BODY=""
api() {
  local method="$1" path="$2" body="${3:-}" tmp
  tmp="$(mktemp)"
  local -a args=(-sS -m 60 -o "$tmp" -w '%{http_code}'
    -X "$method" -H "Authorization: Bearer $COOLIFY_API_TOKEN"
    -H 'Accept: application/json')
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary "$body")
  API_STATUS="$(curl "${args[@]}" "${COOLIFY_API_URL%/}$path" 2>/dev/null)" || API_STATUS="000"
  API_BODY="$(cat "$tmp" 2>/dev/null)"
  rm -f "$tmp"
}

jget() { jq -r "$1 // empty" 2>/dev/null; }

# --- Lecture du fichier d'environnement (jamais de `source` : valeurs non
#     citées avec des espaces ou des `|` casseraient le shell) ----------------
env_get() {
  [[ -r "$ENV_FILE" ]] || die "fichier d'environnement illisible : $ENV_FILE"
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | head -n1 |
    sed -E 's/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'
}

case "$(basename "$ENV_FILE")" in
  *.env.prod*) die "refus : $ENV_FILE est un fichier de production" ;;
esac

COOLIFY_API_URL="$(env_get COOLIFY_API_URL)"
COOLIFY_API_TOKEN="$(env_get COOLIFY_API_TOKEN)"
[[ -n "$COOLIFY_API_URL" && -n "$COOLIFY_API_TOKEN" ]] ||
  die "COOLIFY_API_URL / COOLIFY_API_TOKEN absents de $ENV_FILE"

case "$PROJECT_NAME" in
  Eflex|eflex|""|production|Production)
    die "refus : projet Coolify « $PROJECT_NAME » (production). Utilisez EFLEX_SMOKE_PROJECT=\"Eflex Staging\"." ;;
esac

TS="$(date +%Y%m%dT%H%M%S)"
APP_NAME="volume-smoke-$TS"
if [[ "$APP_NAME" != volume-smoke-* ]]; then
  die "refus : le nom d'application doit commencer par volume-smoke-"
fi

log PLAN "projet=$PROJECT_NAME stockage=$STORAGE_NAME montage=$MOUNT_PATH app=$APP_NAME"
log PLAN "dépôt=$SMOKE_REPO"
if (( DRY_RUN )); then log PLAN "dry-run : aucun appel effectué"; exit 0; fi

# --- Résolution du projet, de l'environnement et du serveur ----------------
api GET /projects
projects="$API_BODY"
[[ "$API_STATUS" == 200 ]] || die "GET /projects → HTTP $API_STATUS ($(jget .message <<<"$projects"))"
PROJECT_UUID="$(jget ".projects? // . | .[] | select(.name == \"$PROJECT_NAME\") | .uuid" <<<"$projects")"
[[ -n "$PROJECT_UUID" ]] || die "projet Coolify introuvable : $PROJECT_NAME"

api GET "/projects/$PROJECT_UUID/environments"
envs="$API_BODY"
[[ "$API_STATUS" == 200 ]] || die "GET environnements → HTTP $API_STATUS"
if [[ -n "$ENV_NAME" ]]; then
  ENV_FOUND="$(jq -r --arg n "$ENV_NAME" '.[] | select(.name == $n) | .name' <<<"$envs")"
else
  ENV_FOUND="$(jq -r '.[0].name' <<<"$envs")"
fi
[[ -n "$ENV_FOUND" ]] || die "environnement Coolify introuvable (demandé : ${ENV_NAME:-premier})"
log INFO "projet=$PROJECT_UUID environnement=$ENV_FOUND"

api GET /servers
servers="$API_BODY"
SERVER_UUID="$(jget '.[0].uuid' <<<"$servers")"
[[ -n "$SERVER_UUID" ]] || die "aucun serveur Coolify utilisable"

# --- Nettoyage (toujours sûr : uniquement l'application créée ici) ---------
APP_UUID=""
cleanup() {
  local code=$?
  if [[ -n "$APP_UUID" ]]; then
    if (( KEEP )); then
      log KEEP "application conservée : $APP_UUID (supprimer : DELETE /applications/$APP_UUID)"
      return $code
    fi
    log CLEAN "suppression de l'application $APP_UUID (volume inclus)"
    api DELETE "/applications/$APP_UUID?delete_volumes=true&delete_connected_networks=true"
    for _ in $(seq 1 30); do
      docker ps -a --format '{{.Names}}' | grep -q "^$APP_UUID" || break
      sleep 2
    done
    if docker ps -a --format '{{.Names}}' | grep -q "^$APP_UUID"; then
      log WARN "conteneur encore présent : vérifier docker ps -a | grep $APP_UUID"
    fi
    if docker volume ls --format '{{.Name}}' | grep -q "^$APP_UUID-"; then
      log WARN "volume résiduel : docker volume rm $APP_UUID-$STORAGE_NAME"
    fi
    log CLEAN "nettoyage terminé"
  fi
  return $code
}
trap cleanup EXIT INT TERM

# --- Création de l'application et du stockage ------------------------------
log STEP "création de l'application ($APP_NAME)"
api POST /applications/public "$(jq -n \
  --arg name "$APP_NAME" --arg project "$PROJECT_UUID" --arg server "$SERVER_UUID" \
  --arg env "$ENV_FOUND" --arg repo "$SMOKE_REPO" '{
    name: $name, project_uuid: $project, server_uuid: $server, environment_name: $env,
    git_repository: $repo, git_branch: "main", build_pack: "nixpacks",
    ports_exposes: "3000", start_command: "node server.js",
    connect_to_docker_network: true, autogenerate_domain: false,
    # Coolify 4.7.3 échoue (« Undefined variable $labels ») quand des labels
    # personnalisés sont attendus mais absents : on laisse Coolify générer.
    is_container_label_readonly_enabled: true, is_auto_deploy_enabled: false
  }')"
[[ "$API_STATUS" == 201 || "$API_STATUS" == 200 ]] ||
  die "création de l'application → HTTP $API_STATUS ($(jget .message <<<"$API_BODY"))"
APP_UUID="$(jget .uuid <<<"$API_BODY")"
[[ -n "$APP_UUID" ]] || die "réponse sans uuid d'application"
log OK "application $APP_UUID"

api POST "/applications/$APP_UUID/storages" "$(jq -n \
  --arg name "$STORAGE_NAME" --arg path "$MOUNT_PATH" \
  '{type: "persistent", name: $name, mount_path: $path}')"
[[ "$API_STATUS" == 201 || "$API_STATUS" == 200 ]] ||
  die "création du stockage → HTTP $API_STATUS ($(jget .message <<<"$API_BODY"))"
STORAGE_UUID="$(jget .uuid <<<"$API_BODY")"
[[ -n "$STORAGE_UUID" ]] || die "réponse sans uuid de stockage"
log OK "stockage $STORAGE_UUID ($STORAGE_NAME → $MOUNT_PATH)"

# --- Déploiement, avec attente bornée --------------------------------------
wait_deployment() {
  local uuid="$1" deadline=$((SECONDS + DEPLOY_TIMEOUT)) status=""
  while (( SECONDS < deadline )); do
    api GET "/deployments/$uuid"
    status="$(jget .status <<<"$API_BODY")"
    case "$status" in
      finished) echo "$status"; return 0 ;;
      failed|cancelled*) echo "$status"; return 1 ;;
    esac
    sleep 8
  done
  echo "timeout"
  return 1
}

deploy() {
  local body dep
  api POST /deploy "$(jq -n --arg uuid "$APP_UUID" '{uuid: $uuid}')"
  body="$API_BODY"
  [[ "$API_STATUS" == 200 || "$API_STATUS" == 201 ]] ||
    die "déclenchement du déploiement → HTTP $API_STATUS ($(jget .message <<<"$body"))"
  dep="$(jq -r '.deployments[0].deployment_uuid' <<<"$body")"
  [[ -n "$dep" && "$dep" != null ]] || die "réponse de déploiement sans deployment_uuid"
  log STEP "déploiement $dep"
  local result
  result="$(wait_deployment "$dep")" || die "déploiement $dep : $result"
  log OK "déploiement $dep : $result"
  echo "$dep"
}

DEPLOY1="$(deploy)" || exit 1

# --- Écriture dans le volume (chemin privilégié : docker exec) -------------
container_of_app() {
  local names name
  names="$(docker ps --format '{{.Names}}' | grep "^$APP_UUID" || true)"
  while read -r name; do
    [[ -z "$name" ]] && continue
    case "$name" in
      eflex-portail|eflex-postgres|eflex-redis|eflex-staging-*|coolify*)
        die "refus : conteneur protégé $name" ;;
    esac
    echo "$name"
    return 0
  done <<<"$names"
  return 1
}

CONTAINER1="$(container_of_app)" || die "conteneur de l'application introuvable"
log INFO "conteneur après 1er déploiement : $CONTAINER1"
docker exec "$CONTAINER1" node -e \
  "fetch('http://127.0.0.1:3000/write').then(r=>r.text()).then(t=>console.log(t))" ||
  die "écriture via /write impossible"
STAMP="$(docker exec "$CONTAINER1" cat "$MOUNT_PATH/eflex-volume-test.txt")"
log OK "fichier écrit : $(tr '\n' ' ' <<<"$STAMP")"

# --- Redéploiement puis vérification ---------------------------------------
DEPLOY2="$(deploy)" || exit 1
CONTAINER2="$(container_of_app)" || die "conteneur de l'application introuvable après redéploiement"
log INFO "conteneur après 2e déploiement : $CONTAINER2"
if [[ "$CONTAINER1" == "$CONTAINER2" ]]; then
  die "le conteneur n'a pas été remplacé : la persistance n'est pas prouvée"
fi

AFTER1="$(docker exec "$CONTAINER2" cat "$MOUNT_PATH/eflex-volume-test.txt" 2>/dev/null || true)"
AFTER2="$(docker exec "$CONTAINER2" node -e \
  "fetch('http://127.0.0.1:3000/read').then(r=>r.text()).then(t=>console.log(t))" 2>/dev/null || true)"
log INFO "lecture après redéploiement (docker exec) : $(tr '\n' ' ' <<<"$AFTER1")"
log INFO "lecture après redéploiement (/read) : $AFTER2"

if [[ "$AFTER1" == "$STAMP" ]] && grep -q 'ecrit=' <<<"$AFTER2"; then
  log OK "PERSISTANCE PROUVÉE : $CONTAINER1 → $CONTAINER2"
  log RESUME "app=$APP_UUID storage=$STORAGE_UUID deploy1=$DEPLOY1 deploy2=$DEPLOY2"
  exit 0
fi
log ERREUR "fichier absent ou différent après redéploiement"
exit 1
