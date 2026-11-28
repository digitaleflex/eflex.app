# ADR-0017 — SemVer strict, release-please et version globale du monorepo

- **Statut** : Accepté
- **Date** : 2026-11-28
- **Issue** : —
- **Remplace** : convention CalVer `v2026.11.x` (tags historiques conservés, non repris)

## Contexte

Le dépôt utilisait des tags CalVer (`v2026.11.10` à `v2026.11.23`) sans GitHub
Releases ni CHANGELOG. Les packages (`package.json` racine, `portail/`,
`packages/detector`, `packages/renderer`) restaient figés à `0.1.0`. Les commits
suivent déjà majoritairement les Conventional Commits (`feat:`, `fix:`, `docs:`,
etc.), ce qui permet d'automatiser la sémantique de version.

Le déploiement production est devenu automatisé (workflow `deploy.yml`, SSH vers
le serveur). Il manquait un chaînon entre « merge sur main » et « version
publiée / déployée » : pas de versioning sémantique, pas de release traçable,
pas de changelog.

## Décision

1. **SemVer strict** (`MAJOR.MINOR.PATCH`) pour le produit EFLEX. `feat:` →
   minor, `fix:` → patch, `feat!: ` / `BREAKING CHANGE:` → major.
2. **Version globale unique** pour le monorepo (portail + packages + racine
   bumpés ensemble). Le produit est déployé comme un seul ensemble.
3. **release-please** (`googleapis/release-please-action`) maintient une PR de
   release sur `main`. La fusion de cette PR crée le tag `vX.Y.Z`, la GitHub
   Release et met à jour `CHANGELOG.md` + les `package.json`.
4. **Déploiement déclenché sur `release: published`** (et `workflow_dispatch`
   manuel). La chaîne normale est : merge PR → release-please tag/release →
   workflow `deploy.yml` → `scripts/deploy-prod.sh` sur le serveur.
5. **bootstrap-sha** fixé au dernier tag CalVer (`924759d`, `v2026.11.23`) pour
   que le premier changelog généré couvre l'historique post-CalVer.
6. Les tags CalVer existants sont **conservés** pour l'historique ; ils ne sont
   pas renommés ni supprimés.

## Conséquences

- Chaque fusion de la PR de release produit un artefact traçable (tag, release,
  changelog, commit de version).
- Le bump est déterministe et auditable : il découle des messages de commit.
- Les commits non conformes aux Conventional Commits tombent dans « Maintenance »
  ou sont ignorés selon la config ; les contributeurs doivent suivre la
  convention (déjà majoritairement le cas).
- Le premier cycle SemVer part de la base `0.1.0` déclarée dans le manifest ;
  la prochaine release calculée par release-please deviendra la première release
  SemVer officielle (probablement `1.0.0` ou `0.2.0` selon les commits).
- `deploy.yml` ne se déclenche plus sur chaque push `main` : un push `main` met
  à jour la PR de release, la fusion de cette PR déclenche le déploiement. Un
  hotfix urgent peut passer par `workflow_dispatch`.

## Alternatives considérées

- **CalVer conservé** : lisible chronologiquement, mais ne communique pas la
  compatibilité/sémantique des changements.
- **Full-auto à chaque push** : simple, mais génère trop de releases et supprime
  le point de contrôle humain avant mise en production.
- **semantic-release** : puissant, mais plus intrusif (pas de PR de review,
  publie directement) ; release-please correspond mieux au flux PR/gouvernance.
- **Version par package** : pertinent pour des libs publiées indépendamment ;
  ici le portail est déployé comme un tout, une version globale est plus claire.
