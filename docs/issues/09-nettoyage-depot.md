# [P2] Nettoyage du dépôt : logos dupliqués à la racine et listes d'exclusion copiées

## Contexte

### Assets dupliqués à la racine
- `EFLEX Flow Tech Logo.png` et `EFLEX-Flow-Tech-Logo.png` sont **identiques** (726 687 octets chacun).
- `Glossy Blue Ribbon F Logo.png` et `Glossy-Blue-Ribbon-F-Logo.png` sont **identiques** (827 822 octets chacun).
- S'y ajoutent les `.webp` correspondants.

Cela fait environ 3 Mo de PNG à la racine, dont la moitié en double, et les noms avec espaces posent problème dans les scripts et le Dockerfile. Le portail a déjà ses propres copies dans `portail/public/` (`logo.png`, `logo.webp`, `favicon.*`).

### Listes d'exclusion copiées
`AGENTS.md` indique que `IGNORED_SEGMENTS` (`detect.ts`) est **dupliqué** dans `packages/detector/src/cli.ts` et `packages/renderer/src/main.ts`, et qu'il faut garder ces copies synchronisées à la main. Avec l'intégration au portail (snapshot, voir #01), ce serait une 4e copie.

## Travail à faire

- [ ] Supprimer les doublons avec espaces et déplacer les sources de marque dans `assets/brand/` (ou `portail/public/brand/`).
- [ ] Vérifier avec `grep` qu'aucun fichier ne référence les anciens chemins.
- [ ] Optionnel : passer les gros PNG sources sous Git LFS, ou ne garder que les `.webp` optimisés.
- [ ] Exporter `IGNORED_SEGMENTS` (et la fonction de parcours de répertoire) depuis `@eflex/detector`, l'importer dans le CLI, le renderer et le portail, puis supprimer les copies.
- [ ] Mettre à jour `AGENTS.md` en retirant la consigne « keep in sync ».

## Critères d'acceptation
- [ ] Plus aucun fichier en double ni de nom avec espace à la racine.
- [ ] Une seule définition de `IGNORED_SEGMENTS` dans le code.
- [ ] `pnpm test` et `pnpm typecheck` passent.
