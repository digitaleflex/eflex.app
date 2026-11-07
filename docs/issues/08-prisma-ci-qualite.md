# [P2] Portail : singleton Prisma, schéma Prisma unique et typecheck/lint en CI

## Contexte

1. **Plusieurs `new PrismaClient()`** : un dans `portail/src/lib/auth.ts`, un autre dans `portail/src/app/api/projects/route.ts`. En dev Next.js (hot reload), chaque rechargement ouvre un nouveau pool de connexions, jusqu'à épuiser celles de Postgres (« too many clients »). En prod, cela crée plusieurs pools inutiles. → **résolu** : singleton dans `portail/src/lib/prisma.ts`, utilisé partout.
2. **Deux schémas Prisma divergents** : `prisma/schema.prisma` à la racine et `portail/prisma/schema.prisma`. `AGENTS.md` le signalait, et on ne savait pas lequel faisait foi. → **résolu** : le schéma racine a été supprimé, `portail/prisma/schema.prisma` est la seule source.
3. **Le portail n'était couvert par aucune vérification** : `pnpm typecheck` ne regarde que `detector` et `renderer`. `tsc --noEmit` du portail passe désormais (après `npx prisma generate`, qui régénère le client) ; la CI le vérifie.
4. Les workflows existants ne couvraient que Go, les contrats de schémas et l'agent, pas la partie TypeScript / portail. → **résolu** par `.github/workflows/ts.yml`.
5. Typage faible : `catch (err: any)`, corps de requête non validé (pas de Zod).

## Travail à faire

- [x] Créer `portail/src/lib/prisma.ts` avec le pattern singleton sur `globalThis`, et l'utiliser partout.
- [x] Supprimer `prisma/schema.prisma` à la racine pour ne garder **qu'une seule** source (`portail/prisma/schema.prisma`) ; `AGENTS.md` mis à jour, aucun Dockerfile ne référençait le fichier racine.
- [ ] Valider les corps de requête avec Zod : `name`, `repoUrl` (URL https valide), `branch` (nom de branche valide), `envVars`.
- [ ] Ajouter le portail à un script racine `pnpm typecheck:all`, ou l'intégrer au workspace (voir #01). La CI lance déjà `npx tsc --noEmit` depuis `portail/`.
- [x] Workflow `.github/workflows/ts.yml` : install, `pnpm test`, `pnpm typecheck`, `npx prisma validate`, `npx prisma generate` et `npx tsc --noEmit` du portail. Reste à ajouter `next lint` et `next build` (ils exigent les variables d'environnement du portail).
- [ ] Rendre la création du `slug` sûre : aujourd'hui, deux projets portant le même nom, même chez deux utilisateurs différents, font échouer `prisma.project.create` avec une erreur 500. Ajouter un suffixe aléatoire ou renvoyer une erreur 409 lisible.

## Critères d'acceptation
- [x] Une seule instanciation de `PrismaClient` dans le code.
- [x] Un seul `schema.prisma` dans le dépôt.
- [x] La CI échoue si le portail ne compile pas.
- [ ] Créer deux projets portant le même nom ne provoque pas d'erreur 500.
