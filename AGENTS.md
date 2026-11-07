# AGENTS.md

## Repo map

Ce dépôt fusionne `digitaleflex/eflex.app` (produit EFLEX, TypeScript) et `digitaleflex/axiom` (moteur Go). Cible : console EFLEX → API du moteur Axiom → agent sur les VPS. Voir `README.md` (« Feuille de route de l'unification »).

- `services/engine` — moteur Go (API, analyse, plan, build, exécution, GitHub, secrets, auth, migrations SQL). `cd services/engine && go test ./...` ; les tests d'intégration exigent `AXIOM_TEST_DATABASE_URL`.
- `services/agent`, `services/orchestrator` — modules Go séparés (chacun son `go.mod`).
- `apps/cloud` (Vite) et `apps/client-dashboard` (Next 16) — consoles Axiom héritées, npm, hors workspace pnpm ; vouées à être remplacées par la console EFLEX.
- `schemas/` (Axiom) ≠ `schema/` (Eflex `eflex.json`). Docs Axiom dans `docs/` (ADR dans `docs/adr`).
- CI : `.github/workflows/` (Go, contrats de schémas, agent).

- `packages/detector` — deterministic repo snapshot → `BuildPlan`; no network/LLM/runtime deps. Entry: `src/detect.ts` (`detect`), CLI `src/cli.ts`.
- `packages/renderer` — `BuildPlan` → docker-compose YAML + nginx/env templates. Entry: `src/render.ts`; yaml dependency.
- `schema/v1.json` — authoritative JSON Schema for plans; `schema/test.ts` validates every fixture plan/alternative via Ajv.
- `portail/` — Next.js 15 App Router portal (Better Auth, Prisma, Coolify client). **Not** in root pnpm workspace; has own `package-lock.json`; use `npm` there.
- `README.md` (detector behavior), `DEV.md`/`PROD.md` (infra), `schema/README.md` (plan contract).

## Commands (root)

```bash
pnpm install          # pnpm@10, Node >=24
pnpm test             # Vitest (47 tests across detector + renderer; scope set in vitest.config.ts)
pnpm typecheck        # tsc detector + renderer only; NOT portail
pnpm detect <dir>     # tsx packages/detector/src/cli.ts
pnpm render <dir>     # tsx packages/renderer/src/main.ts
```

Single test: `pnpm vitest run packages/detector/test/detect.test.ts`; filter test: `pnpm vitest run -t "detects Next.js"`.
Portal: `cd portail && npm install && npm run dev|build|start`. Root `typecheck` does not cover it.

Détection dans le portail : `POST /api/projects/analyze` → `lib/repo-analysis.ts` récupère l'arborescence (API GitHub, dépôts publics uniquement) puis les fichiers demandés (raw.githubusercontent.com), et appelle `@eflex/detector` en boucle. `lib/github-url.ts` valide les URL. Le portail importe le détecteur par alias (`tsconfig` paths + `experimental.externalDir` + `extensionAlias` dans `next.config.mjs`) : **n'importer que des types (`import type`) dans les composants client**. `POST /api/projects` refait l'analyse côté serveur et ne reçoit jamais le plan du client. Les tests de ces modules (`portail/src/**/*.test.ts`) tournent avec `pnpm test`.

Déploiement : `lib/coolify-plan.ts` (pur) traduit un `BuildPlan` en applications Coolify (runtime `docker@*` → build pack dockerfile, `static@*` → static + `publish`, sinon nixpacks avec les commandes du plan ; chaque service annexe devient une application « worker »). `lib/coolify.ts` est le client de l'API v4 (réponses non enveloppées dans `data`, chemins `/envs` et `/deploy?uuid=`), `lib/deployer.ts` orchestre tout-ou-rien (supprime les applications créées en cas d'échec) et synchronise le statut. Les tests valident chaque charge utile contre le schéma officiel (`lib/test-support/coolify-api-schemas.json`, extrait de https://raw.githubusercontent.com/coollabsio/coolify/v4.x/openapi.json : à rafraîchir si l'API évolue) ; `fake-coolify.ts` imite le serveur. Ne pas envoyer de champ absent de ce schéma : Coolify refuse les champs inconnus (422).

Docker : l'image du portail se construit avec la **racine du dépôt** comme contexte (`docker build -f portail/Dockerfile .`), car elle embarque `packages/detector` ; l'allowlist du contexte est dans `portail/Dockerfile.dockerignore`.

Auth: Better Auth (`portail/src/lib/auth.ts` serveur, `auth-client.ts` client, `session.ts` pour `getSession()`). Modèles Prisma `User`/`Session`/`Account`/`Verification` imposés par Better Auth ; le mot de passe e-mail vit dans `Account.password` (hash bcrypt). Variables : `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

Prisma: from `portail/` run `npx prisma generate` / `npx prisma migrate dev`. `prisma/schema.prisma` (racine) est synchronisé avec `portail/prisma/schema.prisma` (modèles auth + `Project`/`EnvVar`/`Deployment`/`Subscription`) ; toute dérive doit être réconciliée avant `tsc --noEmit` du portail.

Axiom (Go) : `cd services/<engine|agent|orchestrator> && go test ./... -count=1 -p 1`. Avec PostgreSQL : `AXIOM_TEST_DATABASE_URL=postgres://axiom:axiom@127.0.0.1:5432/axiom?sslmode=disable`. Tests Docker réels : `AXIOM_TEST_DOCKER=1` (plus `AXIOM_TEST_E2E=1` pour `engine/internal/e2e`). La CI ne les lance que pour le moteur (`./internal/e2e/`, `./internal/build/`), pas pour l'agent. État vérifié du moteur (ce qui est prouvé ou non) : `docs/roadmap/parallel-plan.md`, section « Verified status ».

Docker dans la sandbox cloud : `dockerd` est installé mais à démarrer à la main, avec `HTTPS_PROXY` et sans `--bridge=none` (sans réseau de pont, aucun port ne se publie) : `dockerd --host=unix:///var/run/docker.sock --iptables=false --ip6tables=false --registry-mirror=https://mirror.gcr.io &`. Docker Hub limite les téléchargements anonymes : passer par le miroir. Les `RUN` d'un build qui sortent sur Internet exigent `--build-arg HTTPS_PROXY` (et `--network=host`). Le trafic sortant est intercepté par le proxy : un `RUN pip install` échoue sur le certificat. Pour les tests de bout en bout Python, construire une image de base locale qui fait confiance au proxy (copier `/root/.ccr/ca-bundle.crt` et l'ajouter à `/etc/ssl/certs/ca-certificates.crt`, avec `PIP_CERT`/`SSL_CERT_FILE`) et la nommer `python:3.12-slim-bookworm` : `TestPythonToLive` ne retélécharge pas une image présente. Rien de tout cela ne persiste d'une session à l'autre ; nettoyer avec `docker system prune -af`.

## Detector / renderer rules

- Detection precedence in `detect.ts`: valid `eflex.json` > `Dockerfile` > monorepo resolution > candidates in `collectCandidates` order; **invalid** `eflex.json` → `plan: null` (no fallback).
- Adding a new framework: register detector in `collectCandidates()` (priority matters) **and** add fixture to `test/fixtures.ts` listed in `allFixtures()`.
- Changing any `BuildPlan` field must update `packages/detector/src/types.ts` and `schema/v1.json`; `schema.test.ts` validates all fixture plans/alternatives.
- Detection is deterministic: inputs are only `RepoSnapshot`; no filesystem or network access inside `detect()`.
- User‑facing detector strings (reasons, warnings, questions) are **French**; keep them French.
- Relative TS imports use explicit `.js` suffixes (ESM, strict TS `noUnused*`/`noFallthroughCasesInSwitch`).
- Renderer maps every framework in `render.ts` (serveurs: `nextjs`/`nuxt`/`node`/`remix`/`solidstart`/`redwoodjs`/`php`/`python` → service `app` ; statique: `static`/`vite`/`astro`/`svelte` → `web` nginx ; `laravel` → `app`+`web`+workers ; `docker`/`eflex-config` → générique) ; framework inconnu → `RenderError`. Réseau externe unifié : `proxy`. Generated compose is parsed as YAML in tests.

## Infra

- Dev: `docker compose -f docker-compose.dev.yml up -d` (Postgres 5432, Redis 6379, MinIO 9000/9001). Coolify is **intentionally remote**; set `COOLIFY_API_URL`, `COOLIFY_API_TOKEN`, `COOLIFY_SERVER_UUID`, `COOLIFY_PROJECT_UUID` in `.env` (voir `DEV.md`).
- Prod: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`; portal image from `Dockerfile.portail` (standalone) or `portail/Dockerfile`. `.env.prod` must **never** be committed.
- `.next/`, `*.tsbuildinfo`, `portail/.env`, and root `.env` are local artifacts; do not commit them.
- `.env.example` is tracked; `.env.prod.example` is tracked per the gitignore exception `!.env.prod.example`.

## Monorepo / workspace

- `pnpm-workspace.yaml: packages/*` only; `portail/` is outside the workspace and has its own `package-lock.json`. Use `npm` in `portail/`.
- Detector ignores `.git`, `node_modules`, `vendor`, `.next`, `dist`, `build`, etc. (`IGNORED_SEGMENTS` in detect.ts; duplicated in CLI/render walkers).
- The walk order in CLI and renderer mirrors detector’s ignored‑segment list; keep in sync when adding directories.