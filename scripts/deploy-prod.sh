#!/usr/bin/env bash
# Déploiement prod avec garde-fous : enveloppe `deploy.sh`.
#
# Ce que le script ajoute :
#   1. `git fetch` AVANT tout : un `git pull` sur une référence périmée redéploie l'ancienne version
#      sans rien dire (c'est arrivé : main local resté sur un commit ancien).
#   2. refuse de déployer si des fichiers suivis sont modifiés ou si la branche a divergé ;
#   3. affiche le commit à déployer ET le précédent (pour revenir en arrière) ;
#   4. après `deploy.sh`, vérifie que le site répond et, avec --expect, qu'il sert bien le nouveau
#      contenu (les pages publiques sont pré-générées : sans ce contrôle, on croit avoir déployé).
#
# Usage :
#   bash scripts/deploy-prod.sh                         # déploie origin/main
#   bash scripts/deploy-prod.sh --expect "Migrez vos projets vers"
#   bash scripts/deploy-prod.sh --dry-run               # montre ce qui serait déployé, ne déploie pas
#
# Variables : DEPLOY_BRANCH (défaut : main).
set -euo pipefail

cd "$(dirname "$0")/.."

BRANCH="${DEPLOY_BRANCH:-main}"
EXPECT=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --expect)
      [ $# -ge 2 ] || { echo "ERREUR : --expect attend un texte."; exit 2; }
      EXPECT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "ERREUR : option inconnue : $1"; exit 2 ;;
  esac
done

# Source unique des domaines (PORTAL_URL).
set -a
. ./config/domains.sh
set +a

echo "==> 1/4 Rafraîchissement des références (git fetch)"
git fetch origin --prune

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERREUR : des fichiers suivis sont modifiés ; déploiement refusé."
  git status --short --untracked-files=no
  echo "Annulez ou commitez ces changements, puis relancez."
  exit 1
fi

PREVIOUS="$(git rev-parse HEAD)"
git checkout -q "$BRANCH"
if ! git merge --ff-only -q "origin/$BRANCH"; then
  echo "ERREUR : $BRANCH a divergé de origin/$BRANCH (pas de fast-forward) ; déploiement refusé."
  exit 1
fi

HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" != "$(git rev-parse "origin/$BRANCH")" ]; then
  echo "ERREUR : le code local n'est pas celui de origin/$BRANCH ; déploiement refusé."
  exit 1
fi

echo "==> 2/4 Commit à déployer"
echo "    $(git log -1 --format='%h %s' HEAD)"
echo "    Précédent (retour arrière) : $(git log -1 --format='%h' "$PREVIOUS")"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "(--dry-run) Rien n'est déployé."
  exit 0
fi

echo "==> 3/4 Déploiement (deploy.sh)"
bash ./deploy.sh

echo "==> 4/4 Vérification du site servi"
rollback_help() {
  echo "    Pour revenir à la version précédente :"
  echo "      git checkout $(git rev-parse --short "$PREVIOUS") && bash deploy.sh"
}

if ! curl -fsS --max-time 10 "${PORTAL_URL}/api/health" >/dev/null 2>&1; then
  echo "ERREUR : ${PORTAL_URL}/api/health ne répond pas après le déploiement."
  rollback_help
  exit 1
fi
echo "    /api/health : OK"

if [ -n "$EXPECT" ]; then
  # Paramètre unique : contourne un éventuel cache intermédiaire.
  FOUND="$(curl -fsS --max-time 15 "${PORTAL_URL}/?verif=$(date +%s)" | grep -c -F -- "$EXPECT" || true)"
  if [ "${FOUND:-0}" -gt 0 ]; then
    echo "    Contenu attendu présent : « $EXPECT »"
  else
    echo "ERREUR : le texte « $EXPECT » est absent de ${PORTAL_URL}/ : la nouvelle version n'est pas servie."
    echo "    Pistes : cache d'un CDN frontal à purger, ou image non reconstruite."
    rollback_help
    exit 1
  fi
fi

echo
echo "Déploiement vérifié : $(git log -1 --format='%h %s' HEAD)"
