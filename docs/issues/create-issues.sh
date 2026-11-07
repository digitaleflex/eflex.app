#!/usr/bin/env bash
# Crée une issue GitHub par brouillon docs/issues/NN-*.md.
# Usage : ./docs/issues/create-issues.sh [owner/repo]
set -euo pipefail

REPO="${1:-digitaleflex/eflex.app}"
DIR="$(cd "$(dirname "$0")" && pwd)"

for file in "$DIR"/[0-9][0-9]-*.md; do
  title="$(head -n 1 "$file" | sed 's/^# //')"
  body="$(tail -n +3 "$file")"
  echo "→ $title"
  gh issue create --repo "$REPO" --title "$title" --body "$body"
done
