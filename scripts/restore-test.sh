#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Test de restauration NON DESTRUCTIF de la base Eflex
# ═══════════════════════════════════════════════════════════════════════════
# Prend la dernière sauvegarde (ou un fichier explicite), crée une base
# jetable `eflex_restore_test`, y restaure le dump, vérifie que les tables,
# utilisateurs, projets et migrations sont présents, puis supprime la base.
#
# GARDE-FOUS :
#   - le nom de la base cible DOIT contenir « test » (insensible à la casse) ;
#   - la base cible ne peut pas être la base de production ;
#   - la base cible est supprimée à la sortie, même en cas d'échec
#     (sauf --keep, réservé au diagnostic).
#   La base de production `eflex` n'est jamais modifiée : seules des lectures
#   de comptage y sont faites, pour comparer avec la restauration.
#
# Usage :
#   bash scripts/restore-test.sh
#   bash scripts/restore-test.sh --file /home/fantome/backups/eflex/eflex-db-weekly-2026-W45.dump.gz
#   bash scripts/restore-test.sh --keep      # laisse la base pour inspection
#
# Variables (facultatives) :
#   EFLEX_BACKUP_DIR       dossier des sauvegardes (déf. /home/fantome/backups/eflex)
#   EFLEX_RESTORE_DB       base cible, doit contenir « test » (déf. eflex_restore_test)
#   EFLEX_PG_CONTAINER     conteneur PostgreSQL (déf. eflex-postgres)
#   EFLEX_PG_USER / EFLEX_PG_DB  identifiants SQL (déf. .env.prod)
#   EFLEX_RESTORE_MIN_TABLES     tables minimales attendues (déf. 20)
#
# Code de sortie : 0 si la restauration et toutes les vérifications passent.
# ═══════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${EFLEX_ENV_FILE:-$REPO_DIR/.env.prod}"
BACKUP_DIR="${EFLEX_BACKUP_DIR:-/home/fantome/backups/eflex}"
PG_CONTAINER="${EFLEX_PG_CONTAINER:-eflex-postgres}"
TARGET_DB="${EFLEX_RESTORE_DB:-eflex_restore_test}"
MIN_TABLES="${EFLEX_RESTORE_MIN_TABLES:-20}"
LOG="$BACKUP_DIR/restore-test.log"
DUMP_FILE=""
KEEP=0
DB_CREATED=0

log() {
  local line
  line="$(date '+%Y-%m-%d %H:%M:%S') $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG"
}

fail() {
  log "[ERREUR] $*"
  exit 1
}

usage() {
  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --file)
        [ "$#" -ge 2 ] || fail "--file attend un chemin"
        DUMP_FILE="$2"
        shift 2
        ;;
      --file=*)
        DUMP_FILE="${1#--file=}"
        shift
        ;;
      --keep)
        KEEP=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "argument inconnu : $1 (voir --help)"
        ;;
    esac
  done
}

# Lit une variable de .env.prod sans l'exporter ni l'afficher.
read_env_var() {
  local key="$1" file="${2:-$ENV_FILE}" line=""
  [ -r "$file" ] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -n1)" || return 0
  local val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" =~ ^\"(.*)\"$ ]]; then
    val="${BASH_REMATCH[1]}"
  elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
    val="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$val"
}

resolve_pg_setting() {
  local override="$1" env_name="$2" file_name="$3" fallback="$4" val=""
  val="${!override:-}"
  [ -n "$val" ] || val="${!env_name:-}"
  [ -n "$val" ] || val="$(read_env_var "$file_name")"
  [ -n "$val" ] || val="$(docker exec "$PG_CONTAINER" printenv "$env_name" 2>/dev/null || true)"
  printf '%s' "${val:-$fallback}"
}

# ── Garde-fous : la cible doit être une base de test, jamais la production ──
validate_target() {
  local lower="${TARGET_DB,,}"
  if [[ "$lower" != *test* ]]; then
    fail "refus : la base cible '$TARGET_DB' ne contient pas « test »"
  fi
  if [[ ! "$TARGET_DB" =~ ^[a-z][a-z0-9_]{0,62}$ ]]; then
    fail "refus : nom de base cible invalide '$TARGET_DB' (minuscules, chiffres, _)"
  fi
  if [ "$TARGET_DB" = "$PG_DB" ]; then
    fail "refus : la base cible est identique à la base source '$PG_DB'"
  fi
}

psql_src() {
  docker exec "$PG_CONTAINER" psql --username "$PG_USER" --dbname "$PG_DB" -At -v ON_ERROR_STOP=1 -c "$1"
}

psql_admin() {
  docker exec "$PG_CONTAINER" psql --username "$PG_USER" --dbname postgres -At -v ON_ERROR_STOP=1 -c "$1"
}

psql_target() {
  docker exec "$PG_CONTAINER" psql --username "$PG_USER" --dbname "$TARGET_DB" -At -v ON_ERROR_STOP=1 -c "$1"
}

drop_target() {
  # pg_terminate_backend + DROP … WITH (FORCE) : aucune session ne peut retenir
  # la base de test. Le nom a déjà été validé (contient « test »).
  psql_admin "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql_admin "DROP DATABASE IF EXISTS \"$TARGET_DB\" WITH (FORCE);" >/dev/null 2>&1
}

cleanup() {
  local rc=$?
  if [ "$DB_CREATED" -eq 1 ]; then
    if [ "$KEEP" -eq 1 ]; then
      log "nettoyage ignoré (--keep) : base '$TARGET_DB' laissée en place"
      log "pour la supprimer : docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c 'DROP DATABASE IF EXISTS \"$TARGET_DB\" WITH (FORCE);'"
    elif drop_target; then
      log "nettoyage : base '$TARGET_DB' supprimée"
    else
      log "[ERREUR] nettoyage : impossible de supprimer la base '$TARGET_DB'"
      [ "$rc" -eq 0 ] && rc=1
    fi
  fi
  exit "$rc"
}
trap cleanup EXIT

latest_backup() {
  local file=""
  file="$(find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name 'eflex-db-daily-*.dump.gz' -o -name 'eflex-db-weekly-*.dump.gz' \) \
    -printf '%T@ %p\n' 2>/dev/null | LC_ALL=C sort -nr | head -n1 | cut -d' ' -f2-)" || true
  printf '%s' "$file"
}

check_dump() {
  [ -f "$DUMP_FILE" ] || fail "sauvegarde introuvable : $DUMP_FILE"
  [ -r "$DUMP_FILE" ] || fail "sauvegarde illisible : $DUMP_FILE"
  gzip -t "$DUMP_FILE" 2>>"$LOG" || fail "archive gzip corrompue : $DUMP_FILE"
  local magic
  magic="$(gzip -dc -- "$DUMP_FILE" 2>/dev/null | head -c 5 || true)"
  [ "$magic" = "PGDMP" ] || fail "en-tête pg_dump absent : $DUMP_FILE"
}

main() {
  parse_args "$@"

  command -v docker >/dev/null 2>&1 || fail "docker introuvable"
  command -v gzip >/dev/null 2>&1 || fail "gzip introuvable"
  docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null | grep -qx true \
    || fail "conteneur PostgreSQL '$PG_CONTAINER' introuvable ou arrêté"

  install -d -m 700 -- "$BACKUP_DIR"
  touch "$LOG"
  chmod 600 "$LOG"

  PG_USER="$(resolve_pg_setting EFLEX_PG_USER POSTGRES_USER POSTGRES_USER eflex)"
  PG_DB="$(resolve_pg_setting EFLEX_PG_DB POSTGRES_DB POSTGRES_DB eflex)"

  validate_target

  if [ -z "$DUMP_FILE" ]; then
    DUMP_FILE="$(latest_backup)"
    [ -n "$DUMP_FILE" ] || fail "aucune sauvegarde eflex-db-*.dump.gz dans $BACKUP_DIR"
  fi

  log "=== début test de restauration ==="
  log "source : $(basename "$DUMP_FILE")"
  log "cible  : $TARGET_DB (conteneur $PG_CONTAINER)"
  check_dump

  local src_users src_projects
  src_users="$(psql_src 'SELECT count(*) FROM "User";')" || fail "lecture de la base source impossible"
  src_projects="$(psql_src 'SELECT count(*) FROM "Project";')" || fail "lecture de la base source impossible"

  log "recréation de la base de test"
  drop_target
  psql_admin "CREATE DATABASE \"$TARGET_DB\";" >/dev/null || fail "création de $TARGET_DB impossible"
  DB_CREATED=1

  log "restauration en cours (pg_restore --exit-on-error)"
  if ! gunzip -c -- "$DUMP_FILE" | docker exec -i "$PG_CONTAINER" pg_restore \
    --username "$PG_USER" \
    --dbname "$TARGET_DB" \
    --no-owner \
    --no-privileges \
    --exit-on-error 2>>"$LOG"; then
    fail "pg_restore a échoué (voir $LOG)"
  fi

  local core_tables tables users projects migrations failed_migrations latest_migration size failures=0
  core_tables="$(psql_target "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('User','Project','Deployment','Organization','_prisma_migrations');")" || fail "vérification des tables impossible"
  tables="$(psql_target "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")" || fail "comptage des tables impossible"
  users="$(psql_target 'SELECT count(*) FROM "User";')" || fail "comptage des utilisateurs impossible"
  projects="$(psql_target 'SELECT count(*) FROM "Project";')" || fail "comptage des projets impossible"
  migrations="$(psql_target 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;')" || fail "comptage des migrations impossible"
  failed_migrations="$(psql_target 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL;')" || fail "lecture des migrations impossible"
  latest_migration="$(psql_target 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1;')" || latest_migration="?"
  size="$(psql_target 'SELECT pg_size_pretty(pg_database_size(current_database()));')" || size="?"

  if [ "$core_tables" -lt 5 ]; then
    log "[ÉCHEC] tables essentielles manquantes (${core_tables}/5 : User, Project, Deployment, Organization, _prisma_migrations)"
    failures=$((failures + 1))
  fi
  if [ "$tables" -lt "$MIN_TABLES" ]; then
    log "[ÉCHEC] ${tables} tables restaurées < ${MIN_TABLES} attendues"
    failures=$((failures + 1))
  fi
  if [ "$migrations" -lt 1 ]; then
    log "[ÉCHEC] aucune migration Prisma appliquée dans la restauration"
    failures=$((failures + 1))
  fi
  if [ "$failed_migrations" -ne 0 ]; then
    log "[ÉCHEC] ${failed_migrations} migration(s) non terminée(s) dans _prisma_migrations"
    failures=$((failures + 1))
  fi
  if [ "$users" -ne "$src_users" ]; then
    log "[ATTENTION] utilisateurs restaurés=${users}, source=${src_users} (écriture après le dump ?)"
  fi
  if [ "$projects" -ne "$src_projects" ]; then
    log "[ATTENTION] projets restaurés=${projects}, source=${src_projects} (écriture après le dump ?)"
  fi
  if [ "$users" -eq 0 ] && [ "$projects" -eq 0 ]; then
    log "[ATTENTION] base restaurée vide (0 utilisateur, 0 projet) : vérifier que la sauvegarde est bien celle attendue"
  fi

  log "tables=${tables} (dont ${core_tables}/5 essentielles) utilisateurs=${users} projets=${projects} migrations=${migrations} (dernière : ${latest_migration}) taille=${size}"

  if [ "$failures" -ne 0 ]; then
    fail "${failures} vérification(s) en échec"
  fi

  log "=== fin test de restauration : OK ==="
}

main "$@"
