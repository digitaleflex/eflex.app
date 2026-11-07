# [P0] Intégrer le détecteur dans le flux « Nouveau projet » du portail

> **Mise à jour :** réalisé. `POST /api/projects/analyze`, `lib/repo-analysis.ts`, `lib/github-url.ts`, interface en deux temps dans « Nouveau projet », plan stocké en base (`Project.plan` / `Project.detection`), plan jamais accepté du client. Voir `AGENTS.md`. Reste : dépôts privés (issue 07, GitHub App) et réponses aux questions du détecteur (aujourd'hui seulement affichées).

## Contexte

La promesse d'Eflex est « vous poussez un dépôt, Eflex comprend la stack ». Le détecteur (`packages/detector`) fait exactement ça, mais **le portail ne l'utilise pas** :

- `portail/src/app/dashboard/new/page.tsx` demande à l'utilisateur de **choisir le framework à la main** (liste codée en dur).
- `portail/src/app/api/projects/route.ts` n'appelle jamais `detect()`. `framework` est une simple chaîne venue du formulaire, et `port` vaut toujours `3000`.
- `portail/` ne dépend pas de `@eflex/detector` (il est hors du workspace pnpm et a son propre `package-lock.json`).

La valeur principale du projet est donc invisible pour l'utilisateur.

## Objectif

Quand un utilisateur saisit une URL de dépôt et une branche, le portail :
1. récupère un instantané du dépôt ;
2. lance `detect()` ;
3. affiche le `DetectionResult` : framework, runtime, commandes, port, `reasons`, `warnings`, `confidence` ;
4. si `questions` n'est pas vide (confiance < 0.7) ou s'il y a des `alternatives`, laisse l'utilisateur choisir ou répondre ;
5. enregistre le `BuildPlan` retenu avec le projet.

## Proposition technique

### 1. Rendre le détecteur consommable par le portail
Deux options, à trancher :
- **A (recommandée)** : intégrer `portail/` au workspace pnpm (`pnpm-workspace.yaml`) et dépendre de `@eflex/detector` via `workspace:*`. Supprimer `portail/package-lock.json`. Mettre à jour `AGENTS.md`, `Dockerfile.portail` et `portail/Dockerfile`.
- B : builder `packages/detector` en `dist/` et l'importer par `file:../packages/detector`.

### 2. Construire un `RepoSnapshot` côté serveur
- Nouveau module `portail/src/lib/snapshot.ts` :
  - dépôt GitHub : `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` pour la liste des fichiers, puis lecture paresseuse du contenu, **uniquement** pour les fichiers que `detect()` demande ;
  - alternative générique : `git clone --depth 1 --filter=blob:none` dans un dossier temporaire.
- Respecter `IGNORED_SEGMENTS` (`node_modules`, `vendor`, `.git`, `dist`, `build`, …), à exporter depuis le détecteur pour éviter une 4e copie de la liste.
- Limites : taille maximale du dépôt, nombre maximal de fichiers, timeout, et message d'erreur en français.

### 3. Nouvelle route d'analyse
- `POST /api/projects/analyze` `{ repoUrl, branch }` → `DetectionResult` (route authentifiée).
- `detect()` reste pur : tout l'I/O se fait dans le snapshot.

### 4. Interface en deux étapes
- Étape 1 : URL + branche, puis bouton « Analyser ».
- Étape 2 : carte de résultat (framework, runtime, install/build/start, port, badge de confiance, raisons, avertissements). En cas de questions ou d'alternatives : choix explicite. Édition possible des champs en mode avancé.
- Supprimer la grille de frameworks manuelle, ou la garder seulement sous forme d'option « Forcer le framework ».

### 5. Persistance
- Ajouter `plan Json?` (et éventuellement `detection Json?`) au modèle `Project` de `portail/prisma/schema.prisma`, avec la migration.
- Les champs `port`, `framework` et `runtime` du projet sont dérivés du plan.

## Critères d'acceptation
- [ ] L'URL d'un dépôt Next.js public affiche « Next.js », `node@XX`, le port 3000 et au moins une raison, sans choix manuel.
- [ ] Un dépôt Laravel affiche les services `app/web/queue/scheduler` et les `postDeploy`.
- [ ] Un monorepo contenant plusieurs applications affiche la question et permet de choisir.
- [ ] Un `eflex.json` invalide affiche une erreur claire (plan `null`, aucun déploiement possible).
- [ ] Le plan est stocké en base avec le projet.
- [ ] `detect()` reste déterministe et sans I/O.

## Dépendances
- Bloque : #02 « Déployer à partir du BuildPlan au lieu de Nixpacks ».
