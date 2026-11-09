# Organisation des milestones par branche

> Créé le 2026-11-08. Base commune : `main` @ `6e30ce9`.
> Règle : **une branche = un jalon = une PR vers `main`**.
>
> **Feuille de route Eflex terminée** : les 7 jalons sont livrés, mergés et déployés. Branches remises à niveau sur `main` ; elles peuvent être supprimées ou réutilisées.
> **Points de rupture Axiom fermés** (`fix/axiom-breakpoints`) : le moteur construit `build.Engine` + `executor.Runner` + `agentclient`, et le binaire agent passe par `internal/bootstrap`. Engine et agent compilent et passent `go test ./...`.
> Reste hors périmètre : unification (moteur/manifeste/console) et gates humaines de release (VPS de référence, agent installé, credentials).

## Convention

- `feat/<id>-<slug>` pour une fonctionnalité, `chore/<id>-<slug>` pour la qualité/le nettoyage, `fix/...` pour une correction.
- Branche créée depuis `main`, PR vers `main`, merge après `pnpm test`, `pnpm typecheck`, `npx tsc --noEmit` (portail), `npm run build` et revue.
- `AGENTS.md` et le brouillon `docs/issues/NN-*.md` sont mis à jour **dans la branche du jalon**.
- Aucun secret dans les branches : `.env.prod` et `portail/.env` restent locaux et gitignorés.
- Les branches sans commit sont des points de départ : les rebase sur `main` avant d'y travailler.

## Périmètre actuel — issues Eflex (`docs/issues/README.md`)

| Ordre | Branche | Issue | Priorité | Dépend de | État |
|---|---|---|---|---|---|
| 1 | `feat/04-encrypt-env-vars` | [04 — chiffrer les variables d'env](../issues/04-chiffrer-variables-env.md) | **P0 sécurité** | — | ✅ livré (mergé sur `main`) |
| 2 | `feat/05-email-verification` | [05 — vérification d'email + reset](../issues/05-inscription-verification-email.md) | **P0 sécurité** | domaine Resend vérifié + `RESEND_API_KEY` | ✅ livré (Resend actif + webhooks signés) |
| 3 | `feat/02-buildplan-deploy` | [02 — déployer depuis le BuildPlan](../issues/02-deployer-depuis-buildplan.md) | **P0** | 01 ✅, 03 ✅ (débloqué) | ✅ livré ( artefacts générés + testés ; validation Coolify distant à faire ) |
| 4 | `feat/06-redis-queue` | [06 — file de déploiement Redis](../issues/06-file-deploiement-redis.md) | P1 | 02 | ✅ livré (file BullMQ, worker, 202, statut/logs temps réel) |
| 5 | `feat/07-github-app` | [07 — GitHub App, dépôts privés, webhooks](../issues/07-github-app-webhooks.md) | P1 | 06 | ✅ livré (plomberie complète ; création de l'App + secrets = étape humaine) |
| 6 | `chore/08-ci-slug` | [08 — slug sûr, lint/build en CI](../issues/08-prisma-ci-qualite.md) | P2 | — | ✅ livré (typecheck:all, ESLint, next build, 7 tests slug) |
| 7 | `chore/09-repo-cleanup` | [09 — nettoyage du dépôt](../issues/09-nettoyage-depot.md) | P2 | — | ✅ livré (assets/brand, walkRepository unique, 3 tests) |

### Déjà livrés sur `main` (pas de branche dédiée)

- **01** détecteur intégré au portail (`/api/projects/analyze`, `Project.plan` / `Project.detection`). Reste : réponses aux `questions` du détecteur, à traiter dans la branche 07 ou un jalon dédié.
- **03** renderer couvrant les 15 frameworks.
- **08** gros du travail (singleton Prisma, schéma unique, CI `ts.yml`, validation Zod).

## Hors périmètre actuel (à planifier ensuite)

- **Unification** (`README.md`) : `feat/unify-engine-analyzer`, `feat/unify-manifest`, `feat/unify-console`, `chore/retire-legacy`.
- **Axiom V0.1** (`docs/roadmap/parallel-plan.md`) : points de rupture **fermés** (`fix/axiom-breakpoints`) ; reste Wave 5 et les gates humaines (#108/#109 : VPS de référence, agent installé).

## Protocole de merge

1. Travailler sur la branche du jalon, commits atomiques.
2. `git fetch origin main` puis `git rebase origin/main` avant la PR.
3. PR vers `main` avec le brouillon d'issue mis à jour (cases cochées).
4. Après merge : `bash deploy.sh`, vérifier `/api/health`, `/api/status`, puis pousser `main`.
