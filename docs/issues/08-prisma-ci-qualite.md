# [P2] Portail : singleton Prisma, schéma Prisma unique et typecheck/lint en CI

> **Mise à jour :** terminé sur `chore/08-ci-slug`. Zod déjà en place sur toutes les routes qui reçoivent un corps (`/api/projects`, `/api/projects/analyze`, `/api/github/installations`). `pnpm typecheck:all` couvre détecteur + renderer + portail. CI `ts.yml` ajoute **lint ESLint** (`--max-warnings=0`) et **`next build`** avec variables factices. `uniqueSlug` est extrait dans `lib/project-slug.ts` et couvert par 7 tests (plus aucune erreur 500 sur deux projets au même nom).

## Contexte

1. **Plusieurs `new PrismaClient()`** : un dans `portail/src/lib/auth.ts`, un autre dans `portail/src/app/api/projects/route.ts`. En dev Next.js (hot reload), chaque rechargement ouvre un nouveau pool de connexions, jusqu'à épuiser celles de Postgres (« too many clients »). En prod, cela crée plusieurs pools inutiles. → **résolu** : singleton dans `portail/src/lib/prisma.ts`, utilisé partout.
2. **Deux schémas Prisma divergents** : `prisma/schema.prisma` à la racine et `portail/prisma/schema.prisma`. `AGENTS.md` le signalait, et on ne savait pas lequel faisait foi. → **résolu** : le schéma racine a été supprimé, `portail/prisma/schema.prisma` est la seule source.
3. **Le portail n'était couvert par aucune vérification** : `pnpm typecheck` ne regarde que `detector` et `renderer`. `tsc --noEmit` du portail passe désormais (après `npx prisma generate`, qui régénère le client) ; la CI le vérifie.
4. Les workflows existants ne couvraient que Go, les contrats de schémas et l'agent, pas la partie TypeScript / portail. → **résolu** par `.github/workflows/ts.yml`.
5. Typage faible : `catch (err: any)`, corps de requête non validé (pas de Zod).

## Travail à faire

- [x] Créer `portail/src/lib/prisma.ts` avec le pattern singleton sur `globalThis`, et l'utiliser partout.
- [x] Supprimer `prisma/schema.prisma` à la racine pour ne garder **qu'une seule** source (`portail/prisma/schema.prisma`) ; `AGENTS.md` mis à jour, aucun Dockerfile ne référençait le fichier racine.
- [x] Valider les corps de requête avec Zod : `name`, `repoUrl`, `branch`, `root`, `commitSha`, `framework`, `envVars`, `installationId`.
- [x] Ajouter le portail à un script racine `pnpm typecheck:all` (détecteur + renderer + portail, avec `prisma generate`).
- [x] Workflow `.github/workflows/ts.yml` : install, `pnpm test`, `pnpm typecheck`, garde-fou domaines, `npm ci`, `prisma validate`, `prisma generate`, `npm run typecheck`, **`npm run lint`**, **`npm run build`** (variables factices : aucune connexion réseau/base).
- [x] Rendre la création du `slug` sûre : `lib/project-slug.ts` ajoute un suffixe aléatoire en cas de collision, testé.

## Critères d'acceptation
- [x] Une seule instanciation de `PrismaClient` dans le code.
- [x] Un seul `schema.prisma` dans le dépôt.
- [x] La CI échoue si le portail ne compile pas **ou si le lint remonte un avertissement**.
- [x] Créer deux projets portant le même nom ne provoque pas d'erreur 500 (7 tests `project-slug`).

**Note :** `next lint` est déprécié en Next 15.5 et supprimé en 16 ; la CI utilise donc le **CLI ESLint** directement (`eslint . --max-warnings=0`) avec `.eslintrc.json` (`next/core-web-vitals` + `next/typescript`).
