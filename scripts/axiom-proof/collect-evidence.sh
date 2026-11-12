#!/usr/bin/env bash
# Collecte de preuves pour #12/#13 dans un dossier horodaté.
# Copie des fichiers/journaux indiqués ; ne modifie pas les sources.
set -euo pipefail

: "${ISSUE:?définir ISSUE=12 ou ISSUE=13}"
: "${OUT_ROOT:=./evidence}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT_ROOT/issue-$ISSUE/$TS"
mkdir -p "$DEST"

log() { printf '[collect] %s\n' "$*"; }

copy_if_exists() {
  local src="$1"
  if [ -e "$src" ]; then
    mkdir -p "$DEST/$(dirname "${src#/}")"
    cp -a "$src" "$DEST/$(dirname "${src#/}")/" 2>/dev/null || cp -a "$src" "$DEST/" || true
    log "copié: $src"
  else
    log "absent (ignoré): $src"
  fi
}

{
  echo "issue=$ISSUE"
  echo "collected_at_utc=$TS"
  echo "host=$(hostname -f 2>/dev/null || hostname || echo unknown)"
  echo "user=$(id -un 2>/dev/null || echo unknown)"
  echo "pwd=$(pwd)"
  echo "git_rev=$(git rev-parse HEAD 2>/dev/null || echo n/a)"
  echo "git_status_porcelain_count=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo n/a)"
} >"$DEST/metadata.txt"

# Liste de chemins fournie via arguments ou via EVIDENCE_PATHS (séparés par :)
if [ "$#" -gt 0 ]; then
  for p in "$@"; do copy_if_exists "$p"; done
elif [ -n "${EVIDENCE_PATHS:-}" ]; then
  IFS=: read -r -a arr <<<"$EVIDENCE_PATHS"
  for p in "${arr[@]}"; do [ -n "$p" ] && copy_if_exists "$p"; done
else
  log "aucun chemin fourni ; seules les métadonnées ont été écrites"
  log "usage: ISSUE=12 collect-evidence.sh /chemin/log1 /chemin/log2"
fi

log "preuves rassemblées dans $DEST"
log "relire le contenu avant partage : supprimer toute donnée sensible/secrets."