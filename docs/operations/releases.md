# Releases et versioning

## Schéma

EFLEX utilise **Semantic Versioning** (`MAJOR.MINOR.PATCH`, ex. `v1.2.3`) avec
une **version globale** pour tout le monorepo (racine, `portail/`,
`packages/detector`, `packages/renderer`).

- `feat:` → bump **minor** (nouvelle fonctionnalité rétrocompatible)
- `fix:` / `perf:` → bump **patch**
- `feat!:`, `fix!:`, ou pied de commit `BREAKING CHANGE:` → bump **major**
- `docs:`, `test:`, `ci:`, `chore:`, `refactor:` → pas de bump de version à
  eux seuls (apparaissent dans le changelog)

Les commits suivent les [Conventional Commits](https://www.conventionalcommits.org/fr/v1.0.0/).
C'est déjà la convention dominante du dépôt.

## Chaîne automatique

1. **Push sur `main`** → `release-please` analyse les commits depuis la dernière
   release et ouvre/met à jour une **PR de release** (`chore(release): X.Y.Z`).
2. **Fusion de la PR de release** → release-please crée le tag `vX.Y.Z`, la
   GitHub Release et met à jour `CHANGELOG.md` + les `package.json`.
3. **Publication de la release** → le workflow `deploy.yml` déploie en production
   via SSH (`scripts/deploy-prod.sh`).

Rien n'est déployé sans qu'une PR de release ait été fusionnée (point de contrôle
humain). Un déploiement manuel reste possible via **Actions → Déploiement production
→ Run workflow**.

## Fichiers gérés par release-please

- `CHANGELOG.md`
- `.release-please-manifest.json`
- `package.json` (racine)
- `portail/package.json`
- `packages/detector/package.json`
- `packages/renderer/package.json`

Ne pas bumper ces versions à la main : laisser release-please le faire dans sa PR.

## Historique

Avant le 2026-11-28, le projet utilisait des tags CalVer (`v2026.11.10` à
`v2026.11.23`). Ces tags sont conservés pour l'historique ; le flux SemVer
commence après le `bootstrap-sha` configuré dans `release-please-config.json`.

## Bootstrap (première release SemVer)

`release-please-config.json` contient `"release-as": "1.0.0"` pour forcer la
première release SemVer après l'historique CalVer. **Après fusion de la première
PR de release, retirer cette clé** (et laisser release-please calculer les bumps
suivants normalement).

## Dépannage

- **La PR de release n'apparaît pas** : vérifier que les commits sur `main`
  respectent les Conventional Commits et que le workflow `Release` a tourné.
- **`GitHub Actions is not permitted to create or approve pull requests`** :
  soit activer **Settings → Actions → General → Workflow permissions → Allow
  GitHub Actions to create and approve pull requests**, soit définir un secret
  `RELEASE_PLEASE_TOKEN` (PAT avec `contents`, `pull-requests`, `issues`, ou
  token d'une GitHub App) ; le workflow l'utilise en priorité sur
  `GITHUB_TOKEN`.
- **Mauvais bump** : corriger le message de commit (amend/rebase avant merge) ou
  ajuster la PR de release manuellement avant fusion.
- **Forcer une version** : ajouter `Release-As: X.Y.Z` dans le corps d'un commit
  sur `main` (voir doc release-please).
- **Hotfix urgent sans release** : `workflow_dispatch` sur `deploy.yml`, puis
  laisser release-please rattraper au prochain cycle normal.
