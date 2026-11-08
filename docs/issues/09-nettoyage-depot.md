# [P2] Nettoyage du dépôt : logos dupliqués à la racine et listes d'exclusion copiées

> **Mise à jour :** terminé sur `chore/09-repo-cleanup`. Les 6 images de la racine (3 uniques + 3 doublons avec espaces) sont supprimées ; les sources vivent désormais dans `assets/brand/` (retirées de `portail/public/`, qui ne garde que les assets réellement servis). `walkRepository()` dans `packages/detector/src/walk.ts` est la source unique du parcours et des exclusions ; le CLI et le renderer l'importent, la copie locale du renderer est supprimée. 3 tests dédiés.

## Contexte

### Assets dupliqués à la racine
- `EFLEX Flow Tech Logo.png` et `EFLEX-Flow-Tech-Logo.png` sont **identiques** (726 687 octets chacun).
- `Glossy Blue Ribbon F Logo.png` et `Glossy-Blue-Ribbon-F-Logo.png` sont **identiques** (827 822 octets chacun).
- S'y ajoutent les `.webp` correspondants.

Cela fait environ 3 Mo de PNG à la racine, dont la moitié en double, et les noms avec espaces posent problème dans les scripts et le Dockerfile. Le portail a déjà ses propres copies dans `portail/public/` (`logo.png`, `logo.webp`, `favicon.*`).

### Listes d'exclusion copiées
`AGENTS.md` indique que `IGNORED_SEGMENTS` (`detect.ts`) est **dupliqué** dans `packages/detector/src/cli.ts` et `packages/renderer/src/main.ts`, et qu'il faut garder ces copies synchronisées à la main. Avec l'intégration au portail (snapshot, voir #01), ce serait une 4e copie.

## Travail à faire

- [x] Supprimer les doublons avec espaces et déplacer les sources de marque dans `assets/brand/`.
- [x] Vérifier avec `grep` qu'aucun fichier ne référence les anciens chemins.
- [x] Pas besoin de Git LFS : ~1,5 Mo de sources, dont les versions WebP optimisées servies restent dans `portail/public/`.
- [x] Exporter la fonction de parcours (`walkRepository`, `packages/detector/src/walk.ts`) et l'importer dans le CLI et le renderer ; supprimer les copies (le portail n'utilise que `isIgnoredPath` sur les snapshots GitHub, sans parcours local).
- [x] Mettre à jour `AGENTS.md` en retirant la consigne « keep in sync ».

## Critères d'acceptation
- [x] Plus aucun fichier en double ni de nom avec espace à la racine.
- [x] Une seule définition de `IGNORED_SEGMENTS` dans le code, avec `walkRepository` testé.
- [x] `pnpm test` et `pnpm typecheck` passent.
