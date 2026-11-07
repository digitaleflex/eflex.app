# AGENTS.md

## Repo map

- `packages/detector` — deterministic repo snapshot → `BuildPlan`; no network/LLM/runtime deps. Entry: `src/detect.ts` (`detect`), CLI `src/cli.ts`.
- `packages/renderer` — `BuildPlan` → docker-compose YAML + nginx/env templates. Entry: `src/render.ts`; yaml dependency.
- `schema/v1.json` — authoritative JSON Schema for plans; `schema/test.ts` validates every fixture plan/alternative via Ajv.
- `portail/` — Next.js 15 App Router portal (NextAuth v5 beta, Prisma, Coolify client). **Not** in root pnpm workspace; has own `package-lock.json`; use `npm` there.
- `README.md` (detector behavior), `DEV.md`/`PROD.md` (infra), `schema/README.md` (plan contract).

## Commands (root)

```bash
pnpm install          # pnpm@10, Node >=24
pnpm test             # Vitest (47 tests across detector + renderer)
pnpm typecheck        # tsc detector + renderer only; NOT portail
pnpm detect <dir>     # tsx packages/detector/src/cli.ts
pnpm render <dir>     # tsx packages/renderer/src/main.ts
```

Single test: `pnpm vitest run packages/detector/test/detect.test.ts`; filter test: `pnpm vitest run -t "detects Next.js"`.
Portal: `cd portail && npm install && npm run dev|build|start`. Root `typecheck` does not cover it.

Prisma: from `portail/` run `npx prisma generate` / `npx prisma migrate dev`. `prisma/schema.prisma` (racine) est synchronisé avec `portail/prisma/schema.prisma` (modèles auth + `Project`/`EnvVar`/`Deployment`/`Subscription`) ; toute dérive doit être réconciliée avant `tsc --noEmit` du portail.

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
- `.next/`, `*.tsbuildinfo`, `portail/.env`, and root `.env` are local artifacts; do not commit them.
- `.env.example` is tracked; `.env.prod.example` is tracked per the gitignore exception `!.env.prod.example`.

## Monorepo / workspace

- `pnpm-workspace.yaml: packages/*` only; `portail/` is outside the workspace and has its own `package-lock.json`. Use `npm` in `portail/`.
- Detector ignores `.git`, `node_modules`, `vendor`, `.next`, `dist`, `build`, etc. (`IGNORED_SEGMENTS` in detect.ts; duplicated in CLI/render walkers).
- The walk order in CLI and renderer mirrors detector’s ignored‑segment list; keep in sync when adding directories.