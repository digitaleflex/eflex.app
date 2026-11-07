# [P2] Portail : singleton Prisma, schéma Prisma unique et typecheck/lint en CI

## Contexte

1. **Plusieurs `new PrismaClient()`** : un dans `portail/src/lib/auth.ts`, un autre dans `portail/src/app/api/projects/route.ts`. En dev Next.js (hot reload), chaque rechargement ouvre un nouveau pool de connexions, jusqu'à épuiser celles de Postgres (« too many clients »). En prod, cela crée plusieurs pools inutiles.
2. **Deux schémas Prisma divergents** : `prisma/schema.prisma` à la racine et `portail/prisma/schema.prisma`. `AGENTS.md` le signale déjà, et on ne sait pas lequel fait foi.
3. **Le portail n'est couvert par aucune vérification** : `pnpm typecheck` ne regarde que `detector` et `renderer`. `AGENTS.md` indique que `tsc --noEmit` échouait sur le portail ; c'est à revérifier depuis l'ajout des modèles (`aeca1d5`).
4. Aucune CI GitHub Actions dans le dépôt (pas de `.github/workflows`).
5. Typage faible : `catch (err: any)`, corps de requête non validé (pas de Zod), `session.user.id` utilisé sans augmentation du type NextAuth.

## Travail à faire

- [ ] Créer `portail/src/lib/prisma.ts` avec le pattern singleton sur `globalThis`, et l'utiliser partout.
- [ ] Supprimer `prisma/schema.prisma` à la racine (ou l'inverse) pour ne garder **qu'une seule** source, puis mettre à jour `AGENTS.md`, `Dockerfile.portail` et `portail/Dockerfile`.
- [ ] Valider les corps de requête avec Zod : `name`, `repoUrl` (URL https valide), `branch` (nom de branche valide), `envVars`.
- [ ] Augmenter le type `Session` de NextAuth (`types/next-auth.d.ts`) pour y ajouter `user.id`.
- [ ] Ajouter le portail à un script racine `pnpm typecheck:all`, ou l'intégrer au workspace (voir #01).
- [ ] Workflow `.github/workflows/ci.yml` : install, `pnpm test`, `pnpm typecheck`, `npx prisma validate`, `next lint` et `next build` du portail.
- [ ] Rendre la création du `slug` sûre : aujourd'hui, deux projets portant le même nom, même chez deux utilisateurs différents, font échouer `prisma.project.create` avec une erreur 500. Ajouter un suffixe aléatoire ou renvoyer une erreur 409 lisible.

## Critères d'acceptation
- [ ] Une seule instanciation de `PrismaClient` dans le code.
- [ ] Un seul `schema.prisma` dans le dépôt.
- [ ] La CI échoue si le portail ne compile pas.
- [ ] Créer deux projets portant le même nom ne provoque pas d'erreur 500.
