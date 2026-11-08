# AGENTS.md

## Repo map

Ce dépôt fusionne `digitaleflex/eflex.app` (produit EFLEX, TypeScript) et `digitaleflex/axiom` (moteur Go). Cible : console EFLEX → API du moteur Axiom → agent sur les VPS. Voir `README.md` (« Feuille de route de l'unification »).

- `services/engine` — moteur Go (API, analyse, plan, build, exécution, GitHub, secrets, auth, migrations SQL). `cd services/engine && go test ./...` ; les tests d'intégration exigent `AXIOM_TEST_DATABASE_URL`.
- `services/agent`, `services/orchestrator` — modules Go séparés (chacun son `go.mod`).
- `apps/cloud` (Vite) et `apps/client-dashboard` (Next 16) — consoles Axiom héritées, npm, hors workspace pnpm ; vouées à être remplacées par la console EFLEX.
- `schemas/` (Axiom) ≠ `schema/` (Eflex `eflex.json`). Docs Axiom dans `docs/` (ADR dans `docs/adr`).
- CI : `.github/workflows/` (Go, contrats de schémas, agent, et `ts.yml` pour les packages TS + le portail).

- `packages/detector` — deterministic repo snapshot → `BuildPlan`; no network/LLM/runtime deps. Entry: `src/detect.ts` (`detect`), CLI `src/cli.ts`.
- `packages/renderer` — `BuildPlan` → docker-compose YAML + nginx/env templates. Entry: `src/render.ts`; yaml dependency. `src/dockerfile.ts` génère le Dockerfile, `src/deploy.ts` assemble les artefacts de déploiement (port réel, `build_pack`, `postDeploy` en service one-shot). Le portail les consomme via l'alias `@eflex/renderer` (`lib/deploy-plan.ts`) ; `yaml` est aussi dépendance du portail.
- `schema/v1.json` — authoritative JSON Schema for plans; `schema/test.ts` validates every fixture plan/alternative via Ajv.
- `config/domains.sh` — **source unique** des domaines/URLs publics (un seul `EFLEX_ROOT_DOMAIN`, aucune valeur secrète) ; `scripts/sync-domains.sh` régénère les fichiers statiques qui ne peuvent pas interpoler `${VAR}`.
- `portail/` — Next.js 15 App Router portal (Better Auth, Prisma, Coolify client). **Not** in root pnpm workspace; has own `package-lock.json`; use `npm` there.
- `README.md` (detector behavior), `DEV.md`/`PROD.md` (infra), `schema/README.md` (plan contract).

## Commands (root)

```bash
pnpm install          # pnpm@10, Node >=24
pnpm test             # Vitest (packages TS + modules du portail ; périmètre dans vitest.config.ts)
pnpm typecheck        # tsc detector + renderer only; NOT portail
pnpm detect <dir>     # tsx packages/detector/src/cli.ts
pnpm render <dir>     # tsx packages/renderer/src/main.ts
```

Single test: `pnpm vitest run packages/detector/test/detect.test.ts`; filter test: `pnpm vitest run -t "detects Next.js"`.
`pnpm typecheck:all` couvre détecteur + renderer + portail (avec `prisma generate`). Le portail a aussi `npm run lint` (ESLint `--max-warnings=0`, `.eslintrc.json` ; `next lint` est déprécié). La CI `ts.yml` lance tests, typechecks, garde-fou domaines, `prisma validate/generate`, lint et **`next build`** avec des variables factices.
Portal: `cd portail && npm install && npm run dev|build|start|lint|typecheck`.

Détection dans le portail : `POST /api/projects/analyze` → `lib/repo-analysis.ts` récupère l'arborescence (API GitHub ; dépôts publics via raw.githubusercontent.com, dépôts privés via l'API Contents avec jeton d'installation GitHub App) puis les fichiers demandés, et appelle `@eflex/detector` en boucle. `lib/github-url.ts` valide les URL. Le portail importe le détecteur par alias (`tsconfig` paths + `experimental.externalDir` + `extensionAlias` dans `next.config.mjs`) : **n'importer que des types (`import type`) dans les composants client**. `POST /api/projects` refait l'analyse côté serveur et ne reçoit jamais le plan du client. Les tests de ces modules (`portail/src/**/*.test.ts`) tournent avec `pnpm test`.

Docker : l'image du portail se construit avec la **racine du dépôt** comme contexte (`docker build -f portail/Dockerfile .`), car elle embarque `packages/detector` ; l'allowlist du contexte est dans `portail/Dockerfile.dockerignore`.

Auth: Better Auth (`portail/src/lib/auth.ts` serveur, `auth-client.ts` client, `session.ts` pour `getSession()`). Modèles Prisma `User`/`Session`/`Account`/`Verification` imposés par Better Auth ; le mot de passe e-mail vit dans `Account.password` (hash bcrypt). Variables : `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

Prisma: **une seule source de vérité**, `portail/prisma/schema.prisma` (modèles Better Auth + `Project`/`EnvVar`/`Deployment`/`Subscription`). Depuis `portail/` : `npx prisma generate` / `npx prisma migrate dev` / `npx prisma validate`. Il n'existe plus de schéma Prisma à la racine ; la CI valide le schéma avant `tsc --noEmit`.

Secrets des projets (issue 04) : `portail/src/lib/crypto.ts` chiffre `EnvVar.value` en AES-256-GCM (`v1:<nonce>:<ciphertext+tag>`, AAD `projectId:key`). Clé `ENV_ENCRYPTION_KEY` (32 octets base64) **hors base et hors image Docker**, `ENV_ENCRYPTION_KEY_PREVIOUS` pour la rotation, validation au démarrage via `portail/src/instrumentation.ts`, migration/rotation via `pnpm exec tsx portail/scripts/encrypt-existing-env-vars.ts`. Aucune route `GET` ne renvoie de valeur.

E-mails (issue 05) : `portail/src/lib/email.ts` envoie via l'API REST **Resend** (aucune dépendance), `email-templates.ts` pour les gabarits français. `RESEND_API_KEY` + `EMAIL_FROM` (domaine vérifié dans Resend). Better Auth : `emailVerification.sendVerificationEmail`, `sendOnSignUp`/`sendOnSignIn`, `requireEmailVerification` et `sendResetPassword`. **La vérification n'est exigée que si `RESEND_API_KEY` est présente** (sinon aucun compte ne peut être verrouillé sans lien). Pages `/verify-email`, `/forgot-password`, `/reset-password` ; `/api/auth/config` expose l'état à l'interface. Le limiteur de débit **partagé** via Redis (multi-instances) reste à faire ; le limiteur actuel est en mémoire.
GitHub App (issue 07) : `portail/src/lib/github-app.ts` (JWT RS256, jetons d'installation, `X-Hub-Signature-256`), modèles Prisma `GitInstallation` / `WebhookDelivery` et champs `Project.repoFullName` / `installationId` / `productionBranch`. Webhook **`POST https://eflex.app/api/webhooks/github`** : signature vérifiée, idempotence par `X-GitHub-Delivery`, `push` → `Deployment queued` + file BullMQ avec le SHA. Routes `/api/github/{config,installations,repositories}`, sélecteur `components/new-project/github-picker.tsx`. `repo-analysis.ts` lit les dépôts privés via l'API Contents avec le jeton court. Variables `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_SLUG` (jamais commitées). Création de l'App côté GitHub = étape humaine.

Déploiements asynchrones (issue 06) : file **BullMQ** `portail/src/lib/queue.ts` (`jobId = deploymentId`, `REDIS_URL`), worker `portail/src/worker.ts` démarré par `src/instrumentation.ts` (dans le processus du portail), machine à états `lib/deployment-state.ts`. `POST /api/projects` → **202 `queued`** ; `GET /api/deployments/[id]` (statut + logs), `POST /api/projects/[id]/redeploy`, panneau temps réel `components/deployment-panel.tsx` (polling 3 s). `bullmq` + `ioredis` sont dans `serverExternalPackages`. Le worker est idempotent et reprend les jobs après redémarrage.

Webhooks Resend : URL publique **`https://eflex.app/api/webhooks/`** (alias : `/api/webhooks/resend`), servie avec ou sans slash final (`skipTrailingSlashRedirect`). Signature **Svix** vérifiée par `portail/src/lib/resend-webhook.ts` (`svix-id` / `svix-timestamp` / `svix-signature`, HMAC-SHA256, tolérance 5 min). Secret `RESEND_WEBHOOK_SECRET` (préfixe `whsec_`) dans `.env.prod`, jamais commité. Événements : `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`. Route exemptée du mode maintenance.

## Design system & UI

- Skills de design disponibles dans `.agents/skills/` : `tailwind-design-system`, `web-design-guidelines` (règles Vercel), `fixing-accessibility`, `responsive-design`, `improve-ui`, `frontend-ui-ux`. Les charger avant toute retouche d'interface.
- `portail/src/app/globals.css` est la **source unique des tokens** (Tailwind v3 / HSL) : chaque surface a son `-foreground`, thèmes clair et sombre complets **via `prefers-color-scheme`** (aucun JS, `darkMode: 'media'`), élévation (`--shadow-*`), easing (`--ease-out-expo`), `color-scheme`, `::selection`, scrollbars, focus de secours et `prefers-reduced-motion`. Toutes les paires texte/fond sont ≥ 4.5:1 (AA) dans les deux thèmes.
- `portail/tailwind.config.ts` relie ces tokens aux utilitaires : échelle fluide `text-display` / `text-display-sm` / `text-lead-lg`, `shadow-sm|md|lg|primary`, `ease-out-expo`.
- Identité du portail : navy + bleu royal (pas de bascule vers l'Axiom Design DNA, réservé à `docs/design/design-dna/README.md` pour la console du moteur). Inter + JetBrains Mono via `next/font`.
- Règles UI : pas de texte en dégradé, pas d'« eyebrow »/kicker au-dessus d'un titre, pas de `transition-all` (propriétés explicites), focus visible partout, cibles tactiles ≥ 44 px, `tabular-nums` pour les valeurs techniques, libellés et messages en français.
- Logos : **toujours les assets originaux en couleur**, jamais de filtre monochrome. En thème sombre le logo Eflex (`img[alt^='Eflex']`) reçoit une plaque claire ; les icônes `FrameworkIcon` reçoivent une plaque teintée de leur couleur de marque (`--brand-rgb`, `color-mix`).
- Section « Technologies reconnues » (`page.tsx` + `.stacks-grid`) : 14 SVG de marque réels, révélation **en cascade au scroll** via `animation-timeline: view()` + `--i` (CSS seul, sans JS, inactive sous `prefers-reduced-motion`) et survol avec élévation de la pastille.

## Detector / renderer rules

- Detection precedence in `detect.ts`: valid `eflex.json` > `Dockerfile` > monorepo resolution > candidates in `collectCandidates` order; **invalid** `eflex.json` → `plan: null` (no fallback).
- Adding a new framework: register detector in `collectCandidates()` (priority matters) **and** add fixture to `test/fixtures.ts` listed in `allFixtures()`.
- Changing any `BuildPlan` field must update `packages/detector/src/types.ts` and `schema/v1.json`; `schema.test.ts` validates all fixture plans/alternatives.
- Detection is deterministic: inputs are only `RepoSnapshot`; no filesystem or network access inside `detect()`.
- User‑facing detector strings (reasons, warnings, questions) are **French**; keep them French.
- Relative TS imports use explicit `.js` suffixes (ESM, strict TS `noUnused*`/`noFallthroughCasesInSwitch`).
- Renderer maps every framework in `render.ts` (serveurs: `nextjs`/`nuxt`/`node`/`remix`/`solidstart`/`redwoodjs`/`php`/`python` → service `app` ; statique: `static`/`vite`/`astro`/`svelte` → `web` nginx ; `laravel` → `app`+`web`+workers ; `docker`/`eflex-config` → générique) ; framework inconnu → `RenderError`. Réseau externe unifié : `proxy`. Generated compose is parsed as YAML in tests.

## Infra

- Dev: `docker compose -f docker-compose.dev.yml up -d` (Postgres 5432, Redis 6379, MinIO 9000/9001). Coolify is **intentionally remote**; set `COOLIFY_API_URL`/`COOLIFY_API_TOKEN` in `.env`.
- Prod: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`; portal image from `Dockerfile.portail` (standalone) or `portail/Dockerfile`. `.env.prod` must **never** be committed.
- Domaines/URLs publics : **source unique** `config/domains.sh` (une seule variable `EFLEX_ROOT_DOMAIN`, le reste est dérivé et exporté). Aucun domaine codé en dur dans les fichiers Compose ou les scripts : `deploy.sh` source ce fichier. Après un changement : `bash scripts/sync-domains.sh` puis `bash deploy.sh`. Les anciens hôtes `*.eurinhash.com` sont abandonnés.
- `.next/`, `*.tsbuildinfo`, `portail/.env`, and root `.env` are local artifacts; do not commit them.
- `.env.example` is tracked; `.env.prod.example` is tracked per the gitignore exception `!.env.prod.example`.

## Monorepo / workspace

- `pnpm-workspace.yaml: packages/*` only; `portail/` is outside the workspace and has its own `package-lock.json`. Use `npm` in `portail/`.
- Detector ignores `.git`, `node_modules`, `vendor`, `.next`, `dist`, `build`, etc. (`IGNORED_SEGMENTS` in detect.ts; duplicated in CLI/render walkers).
- The walk order in CLI and renderer mirrors detector’s ignored‑segment list; keep in sync when adding directories.