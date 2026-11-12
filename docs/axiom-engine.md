# Axiom

> **Transform a GitHub repository into a live application.**

Axiom is an automated application deployment and hosting platform designed to connect the developer experience of Git-based platforms with infrastructure and runtime management.

The core workflow is simple:

```text
GitHub
  ↓
Repository
  ↓
Repository Analyzer
  ↓
Stack Detection
  ↓
Application Profile
  ↓
Deployment Plan
  ↓
Build
  ↓
Runtime
  ↓
Traefik / Networking
  ↓
Domain + SSL
  ↓
Health Check
  ↓
LIVE
```

## Product vision

Axiom combines three layers:

- **Developer Experience** — GitHub integration, repositories, deployments, logs, domains and a cloud console.
- **Application Platform** — automatic build, runtime, container and deployment management.
- **Infrastructure Platform** — servers, networking, reverse proxy, SSL and infrastructure-aware execution.

The objective is to make deployment infrastructure progressively transparent to the developer while keeping execution observable and controllable.

### What Axiom is not

Axiom is **not primarily a generic AI software factory**.

AI agents and expert services can be used internally for repository analysis, stack detection, deployment planning, security and infrastructure decisions. They support the deployment engine rather than replacing the core deployment workflow.

## Current architecture

```text
                         AXIOM
                           │
                  ┌────────▼────────┐
                  │ Deployment      │
                  │ Engine          │
                  └────────┬────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      Analyzer          Planner          Executor
          │                │                │
          └────────────────┼────────────────┘
                           │
                    Expert Services
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
       Security          DevOps       Infrastructure
                           │
                    ┌──────▼──────┐
                    │ Application │
                    │ Runtime     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Server / VPS│
                    └─────────────┘
```

## Core deployment flow

Axiom's target V0.1 workflow is:

1. Connect a GitHub account.
2. List repositories accessible to the user.
3. Select a repository.
4. Analyze the repository.
5. Detect language, framework, package manager, build/start commands, port and runtime requirements.
6. Generate an application profile.
7. Generate a deployment plan.
8. Select a target server.
9. Build and package the application.
10. Deploy it to the selected runtime.
11. Configure networking, domain and SSL.
12. Run health checks.
13. Expose the application as live.

Example:

```text
Connect GitHub
      ↓
Select Repository
      ↓
"Next.js · TypeScript · pnpm · port 3000"
      ↓
Select VPS
      ↓
Deploy
      ↓
Build
      ↓
Container
      ↓
Traefik
      ↓
SSL
      ↓
Health Check
      ↓
https://app.example.com
```

## Architecture status

Verified on **2026-11-07** against `main`, with PostgreSQL 16 and a real Docker daemon (`go test ./... -count=1 -p 1` with `AXIOM_TEST_DATABASE_URL`, `AXIOM_TEST_DOCKER=1` and `AXIOM_TEST_E2E=1`):

- `engine`: **693 tests pass, 0 fail, 0 skipped** (43 packages with tests, 11 without), including the real Docker build and the end-to-end test.
- `agent`: **270 tests pass** — 269, plus `TestIntegrationLifecycle`, whose fixture omitted the now mandatory `ApplicationID` (fixed). That test is skipped in the agent CI job, which sets no `AXIOM_TEST_DOCKER`; this is how it went stale.
- `orchestrator`: 11 tests pass.
- Cloud Console: **not re-verified**. Last measured: `vitest run` 31 passed / 9 failed (`471bebf`); no CI workflow runs the frontend.

The deployment path is wired end to end in code: analysis → profile → plan → build → agent → health → `LIVE`. The two "breakpoints" described by earlier versions of this document are closed.

### Wired in production

Constructed by the Engine composition root (`services/engine/internal/bootstrap/bootstrap.go`) and reachable over the HTTP API:

- Repository analysis and stack detection (`internal/analysis`, `internal/analyzer`)
- Application profile and runtime presets (`internal/profile`, `internal/runtime/presets`)
- Deployment plan generation (`internal/planner`)
- Deployment state, event bus and logs (`internal/deployment`, `internal/logs`)
- Image build and execution: `build.Engine` and the background `executor.Runner` (`internal/build`, `internal/executor`); a deployment created through the API is executed asynchronously
- Engine → Agent transport: `agentclient.Client` (direct HTTP) or `agentclient.NewNATAgent` (the agent long-polls `internal/agentpoll`); every operation is signed per agent (`internal/agentkey`, ADR-0008). With no secret key configured, runtime steps fail closed with `AGENT_NO_CREDENTIAL`
- Servers, domains, GitHub connection, user authentication, authorization, audit, secrets (`internal/server`, `internal/domains`, `internal/github`, `internal/auth`, `internal/authz`, `internal/audit`, `internal/security/secrets`)
- Agent credentials on the Engine side (`internal/agentauth`)
- Deployment diagnostics API (`internal/diagnostics`, `GET /api/v1/deployments/{id}/diagnostics[/logs]`)
- Metrics registry and SSE deployment event stream (`internal/observability/metrics`, `internal/api/sse`)
- PostgreSQL migrations 001-015 (`services/engine/migrations`)

The Agent binary (`services/agent/cmd/agent/main.go`) builds its composition root `bootstrap.New`: identity, credentials, state, capabilities, the Docker, Traefik and health adapters, dispatcher, restart recovery, the inbound operation listener and `/metrics`.

### Execution path: what is and is not proven

**Proven** by `internal/e2e` `TestGitHubToLive` (it runs in the CI engine job): a Dockerfile fixture (a busybox static page) → analysis → profile → plan → real `docker build` → real container → real health probe → `LIVE` in about 2 seconds, with progress visible through persisted events and the SSE stream.

**Not proven** — do not report these as done:

- The test records `https://e2e-test.local` as the application URL. No Traefik, DNS record or certificate is involved.
- Its agent transport is in-process. The real handshake listener → protocol → HMAC verification → bridge, and the registration of a real agent, are not exercised end to end.
- The source is a fixture. The GitHub connection (OAuth application, repository and archive download) has never been run end to end.
- Supported stacks in V0.1: Node (Next.js, Nuxt, Remix, SolidStart, RedwoodJS, Astro, SvelteKit, Vite, generic), Go, Python (FastAPI, Flask, Django with a `requirements.txt`, see below), PHP and Laravel (Composer, see below), Dockerfile and compose. Rails (Ruby) and Spring Boot (Java) are detected but rejected (`internal/analyzer/evidence/decide.go`).
- Docker-gated tests only run where `AXIOM_TEST_DOCKER` is set. The CI engine job sets it for `./internal/e2e/` and `./internal/build/` only; the agent job does not.

A run of the Engine and a real Agent on a real server, with Traefik, a domain and a repository reached through GitHub, is the missing proof.

### Python preset (V1)

Added on 2026-11-07. A repository with a `requirements.txt` and a detected FastAPI, Flask or Django application resolves to the `python` preset (container strategy `source`):

- **Entrypoint from the code.** The analyzer reads `app = FastAPI(...)`, `application = Flask(...)`, `app = create_app()` (Flask factory) and Django's `wsgi.py` (`get_wsgi_application`), skipping tests and virtualenv directories. Several candidates make the profile `needs_review`; the user picks one with the `entrypoint` override of the profile review (`axiom.yaml` has no such key).
- **Commands.** Build: `pip install --no-cache-dir -r requirements.txt`, then `pip install --no-cache-dir uvicorn` (FastAPI) or `gunicorn` (Flask, Django); pip leaves an already satisfied requirement untouched, so a pinned server keeps its version. Start: `uvicorn <module>:<app> --host 0.0.0.0 --port 8000` or `gunicorn --bind 0.0.0.0:8000 <module>:<app>`. The runtime does not inject `PORT`: the port is part of the command.
- **Image.** `python:3.12-slim-bookworm`, dependencies installed in their own layer, non-root user, no bytecode, unbuffered output (`internal/runtime/presets/python`, golden files in `testdata/golden`).

Limits — do not report these as supported:

- `requirements.txt` only. Poetry, uv, Pipenv and `pyproject.toml`-only projects are rejected with an actionable message. Files included with `-r` are not followed: the framework is read from `requirements.txt` itself, and the image copies only that file before installing.
- The interpreter is always Python 3.12. A `.python-version` or `runtime.txt` declaring another minor version produces a warning, not another image.
- `slim` images have no compiler: packages without a wheel (for example `psycopg2` instead of `psycopg2-binary`) fail to build.
- Django: no `collectstatic`, no migrations; the health probe requests `/` on the loopback address.
- A repository that ships its own Dockerfile keeps using it (Dockerfile precedence).

Verified: unit tests, golden profiles and Dockerfiles, and `internal/e2e` `TestPythonToLive` — a minimal FastAPI, Flask and Django application each go through analysis, plan, a real `pip install` and image build, a real container and a real health probe to `LIVE` (the CI engine job runs it; it needs PyPI and Docker Hub). A static analysis of two real repositories: Microblog ships its own Dockerfile, which is used; Flasky is refused because its requirements use `-r` includes. Not done: building and running third-party repositories.

### Node.js framework parity (V1)

Added on 2026-11-10. The analyzer already detected Remix, Nuxt, Astro, SvelteKit, SolidStart and RedwoodJS, but `profile/presets` only resolved Next.js and Vite explicitly; the others fell back to the generic Node preset (or were rejected for a missing `start` script). They now have explicit presets, commands and runtime modes.

| Framework | Runtime | Build (no script) | Start (no script) | Port |
| --- | --- | --- | --- | --- |
| Next.js | node | `next build` | `next start` | 3000 |
| Nuxt | node | `nuxt build` | `node .output/server/index.mjs` | 3000 |
| Remix | node | `remix build` | `remix-serve ./build/server/index.js` | 3000 |
| SolidStart | node | `vinxi build` | package.json `start` (required) | 3000 |
| RedwoodJS | node | package.json `build` (required) | package.json `start` (required) | 8910 |
| Astro | static, or node with `@astrojs/node` | `astro build` | `node ./dist/server/entry.mjs` (node adapter) | 8080 static / 3000 node |
| SvelteKit | static with `@sveltejs/adapter-static`, or node with `@sveltejs/adapter-node` | `vite build` | `node build/index.js` (node adapter) | 8080 static / 3000 node |
| Vite | static | `vite build` | — | 8080 |
| generic Node | node | package.json `build` when present | package.json `start` | 3000 |

- A package.json `start` script always wins and the whole project (not only the build output) is kept in the runtime stage, because the script may read files outside it.
- Without a `start` script the framework's canonical command is used; `HasBuildScript`/`HasStartScript` still come from `package.json`.
- SolidStart and RedwoodJS require explicit `build` and `start` scripts: their CLI changed between majors (`vinxi`/`solid-start`, `rw serve` ports), so Axiom does not guess.
- SvelteKit without `adapter-node`, `adapter-static` or a `start` script is refused (`SVELTEKIT_ADAPTER_MISSING`).
- Static presets are served by nginx on port 8080. The generated nginx configuration and `EXPOSE` now use the plan port (previously the image exposed 80 while the plan said 8080).
- Image safety is the #121 contract: pinned `node:20-alpine`/`nginx:1.27-alpine`, lockfile-aware installs, production-only `node_modules`, non-root `node` user, `PORT` exported, no `HEALTHCHECK` (Axiom probes externally). pnpm and yarn are enabled through Corepack and bun is installed with npm, because the pinned Node image only ships npm; `pnpm fetch` was replaced by `pnpm install --frozen-lockfile` so the deps stage really produces `node_modules`.

Limits — do not report these as supported:

- Monorepos are still refused at the root level (`AMBIGUOUS_APPLICATION_ROOT`); there is no workspace-aware build.
- Nuxt is assumed to be SSR: `ssr: false` / `nuxt generate` static output is not detected. An explicit `start` script is honoured, otherwise the Nitro server entry is used.
- Astro's mode is read from the `@astrojs/node` dependency only.
- RedwoodJS is served from its `start` script and keeps the build-stage `node_modules` (its serve CLI is usually a devDependency), so its image is larger. Its default `rw serve` exposes an API port and a web port; that multi-port topology was not validated. Use a Dockerfile when both ports are needed.
- No Docker end-to-end test was added for these frameworks: coverage is unit tests, profile goldens and Dockerfile goldens.
- The plan carries resolved commands, not lockfile presence: generated Node images assume a lockfile (#121 limit). A repository without a lockfile or with a workspace layout should ship its own Dockerfile.

### PHP / Laravel preset (V1)

Added on 2026-11-10 (hardened for #11).

- **Analysis.** `composer.json` now produces `language: PHP` and `package_manager: composer`; `require.php` gives the interpreter minor (a constraint other than 8.3 produces a warning, never a different image); `laravel/framework` produces `framework: Laravel`. `artisan`, `public/index.php`, `ext-*` requirements, Composer scripts and npm/Vite assets are recorded as tokens in the new multi-valued `php` finding (`analyzer/evidence/php.go`). A new `adapters` finding records `@sveltejs/adapter-node`/`adapter-static` and `@astrojs/node`. The analyzer version is now `evidence/1.1.0`.
- **Contract impact (additive).** The profile `preset` enum (`schemas/artifact.schema.json`) and the `axiom.yaml` strategy/language/packageManager enums (`schemas/axiom.schema.json`, `internal/manifest`) gain the new values. `RepositoryAnalysis` gains two finding kinds (`adapters`, `php`). No existing value, field or state changed; consumers that ignore unknown presets/kinds keep working.
- **Presets.** `php` requires a `composer.json` and either `public/index.php` or an explicit `start.command`; `laravel` is chosen when `laravel/framework` is detected. Both are source builds on port 8080 and use `StartCommand = sh /usr/local/bin/axiom-start`.
- **Build command.** `composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist --no-scripts`. `--no-scripts` is mandatory: Composer scripts such as Laravel's `post-autoload-dump` call `artisan`, which is not copied yet at dependency-install time. Laravel rediscovers its packages at runtime (the `bootstrap/cache` directory is writable).
- **Image.** One container: `php:8.3-fpm-bookworm` + nginx + Supervisor (`internal/runtime/presets/php`). Extensions `bcmath`, `pdo_mysql`, `pdo_pgsql`, `zip`, `opcache` are compiled in; nginx forwards `*.php` to `127.0.0.1:9000`; Supervisor runs `php-fpm -F` and `nginx -g 'daemon off;'`. For Laravel, Supervisor also runs in-container workers `php artisan queue:work --sleep=3 --tries=3 --max-time=3600` and `php artisan schedule:work` (as `www-data`), because the planner has no multi-service model; they stop with the container on redeploy. The entrypoint runs `php artisan config:cache` then `php artisan migrate --force` for Laravel, and exits non-zero if either fails, so migrations can fail a deployment. `storage` and `bootstrap/cache` are owned by `www-data`. When a `public/index.php` document root and an npm build script exist, a `node:20-alpine` stage runs `npm ci`/`npm install` then `npm run build`, and the built `public/` directory is copied (Laravel's `public/build` included).
- **Limits — do not report these as done:**
  - **No separate `queue`/`scheduler` services.** The planner has no multi-service model (`planner.Plan` has one runtime), so workers run inside the app container under Supervisor rather than as distinct services with independent scaling/health.
  - **No persistent `storage` volume.** The planner has no volume model; `storage/` lives in the container and is lost on redeploy. There is no `VOLUME` instruction pretending otherwise.
  - No nginx sidecar, no PHP-FPM pool tuning, no OPcache preload configuration.
  - Frontend assets are built only with **npm**, and only when `public/index.php` exists. pnpm/yarn/bun lockfiles skip the asset stage instead of downloading a package manager inside the build.
  - The extension set is fixed. A repository requiring another `ext-*` fails at `composer install` (loud failure), it is not silently ignored.
  - The php-fpm and nginx masters run as root; FPM workers drop to `www-data`. The Composer binary stays in the image.
  - No database provisioning: `DATABASE_URL`/`DB_*` must be configured; a Laravel app whose migrations fail at start does not reach LIVE.
  - A `start.command` override replaces the generated entrypoint entirely: Laravel migrations and the nginx/php-fpm pair are then not started unless the override does it.
  - No `TestLaravelToLive` e2e: building a real Laravel image needs apt, Composer, network access and a database/runtime configuration not provided by the in-process e2e harness; Docker-gated coverage is not added. Coverage is analysis, profile goldens and Dockerfile goldens.
  - A repository that ships its own Dockerfile still uses it (Dockerfile precedence).

Two packages are delivered and tested but **not adopted by production code**:

- `internal/observability/logging` — the correlation and redaction helpers have **zero production imports**. The Engine logs through plain `internal/logger` (bare `slog`), so no correlation ID reaches the application logs.
- `services/engine/internal/runtime/presets/docker` — the generic Docker preset is never invoked by analysis, profile or build. A project shipping a valid `Dockerfile` does not get the intended preset validation.

### Not present in the repository

- Axiom CLI (#105, #106): `services/engine/cmd/cli` exists; its completeness was not reviewed
- Security/failure release gate (#111) and release evidence documentation (#112): not verified
- Reference deployment on a real server (#109): not done (see "Execution path" above)

### Persistence model currently implemented

```text
User
 └── GitHubConnection
      └── Repository
           └── Application
                └── Deployment
                     └── Server
```

Migrations 001-015 add sessions, secrets, audit and deployment logs/correlation on top of that chain. The deployment domain still lacks additional entities such as environments and deployment steps.

## Repository structure

```text
axiom/
├── apps/
│   └── cloud/                  # React + Vite console (src/, vite.config.ts)
│
├── docs/
│   ├── adr/
│   ├── agents/
│   ├── architecture/
│   ├── design/
│   ├── operations/
│   ├── orchestrator/
│   ├── product/
│   ├── roadmap/
│   └── security/
│
├── schemas/
│   ├── examples/
│   ├── experts/
│   ├── axiom.yaml
│   ├── agent.yaml
│   ├── artifact.yaml
│   ├── task.yaml
│   └── *.schema.json
│
├── services/
│   ├── engine/                 # cmd/engine, internal/*, migrations/, docker-compose.dev.yml
│   ├── agent/                  # cmd/agent, internal/*, tests/
│   └── orchestrator/           # cmd/orchestrator, internal/* (framework, see ADR-0010)
│
├── tests/
│   ├── agents/
│   ├── contracts/
│   ├── e2e/
│   ├── integration/
│   └── orchestrator/
│
└── .github/workflows/          # Go tests, schema contracts, agent readiness
```

## Technology direction

### Engine

- **Go**
- HTTP API
- PostgreSQL
- `database/sql`
- **pgx v5** PostgreSQL driver
- Structured logging with `log/slog`

### Platform

The planned platform includes:

- GitHub integration
- Repository analysis
- Stack detection
- Deployment planning
- Build execution
- Runtime management
- Docker/container support
- Server management
- Traefik networking
- Domain and SSL management
- Health checks
- Deployment logs and events
- Cloud console
- WebSocket-based realtime updates
- CLI

## Development

### Prerequisites

- Go 1.25+
- Docker / Docker Compose
- PostgreSQL for integration tests

### Start PostgreSQL locally

From the repository root:

```bash
docker compose -f services/engine/docker-compose.dev.yml up -d postgres
```

The development database is exposed locally on port `5432`.

### Configure the Engine

Copy the development environment example:

```bash
cp .env.example .env
```

The Engine uses `DATABASE_URL` for its runtime PostgreSQL connection.

For integration tests, configure:

```bash
export AXIOM_TEST_DATABASE_URL="postgres://axiom:axiom@localhost:5432/axiom?sslmode=disable"
```

Then run:

```bash
cd services/engine
go test ./...
```

If `AXIOM_TEST_DATABASE_URL` is not defined, PostgreSQL integration tests are skipped rather than silently using another database.

## Engineering principles

Axiom is being developed around several principles:

- **Deployment first** — the primary product workflow is GitHub → application → infrastructure → live.
- **Automation without opacity** — automation should expose the decisions it makes.
- **Infrastructure as a product** — servers, runtime, networking and deployment state are first-class platform concepts.
- **Deterministic execution** — deployment plans should be reproducible and inspectable.
- **Security by boundary** — repository, build, runtime and infrastructure permissions must remain separated.
- **Observable operations** — deployments need explicit states, logs, events and health checks.
- **Incremental architecture** — implement the smallest reliable platform slice before expanding the system.
- **AI as an expert layer** — AI assists analysis and decisions where useful; it does not replace deterministic platform primitives.

## Roadmap

The high-level path toward the first usable release is:

```text
M0  Product Definition
 ↓
M1  Architecture & Contracts
 ↓
M2  Expert Framework
 ↓
M3  Deployment Engine
 ↓
M4  Base Platform
 ↓
M5  Runtime Agent
 ↓
M6  Deployment Templates & Runtime Presets
 ↓
M7  Security & Governance
 ↓
M8  Observability & Operations
 ↓
M9  CLI
 ↓
M10 First Reference Deployment
 ↓
M11 GitHub → LIVE
```

The immediate engineering sequence inside the current platform phase is:

```text
M4.1 Go Engine Foundation
        ↓
M4.2 PostgreSQL Data Model & Persistence
        ↓
M4.3 REST API + WebSocket
        ↓
GitHub Integration
        ↓
Repository Analyzer
        ↓
Stack Detection
        ↓
Deployment Plan
        ↓
Build / Runtime
        ↓
Deployment Executor
        ↓
Traefik / Domain / SSL
        ↓
Health Checks
        ↓
GitHub → LIVE
```

## Project status

**Current phase:** the code path from a repository to a running container is wired and tested; what is missing is proof on a real server.

**Current focus:** a real run (Engine + Agent + Traefik + a domain + a repository reached through GitHub), then the remaining stacks that V0.1 rejects (Rails, Spring Boot) and the multi-service/volume model that would make Laravel queue/scheduler workers and a persistent `storage` volume possible. The Go suites are green; the Cloud Console tests were not re-verified.

Axiom's first meaningful milestone is not a generic AI demonstration. It is a reliable deployment path:

> **GitHub repository → detected application → deployment plan → running application.**

## Documentation

Architecture and product decisions live under `docs/`.

Start with:

- `docs/product/vision.md`
- `docs/product/v0.1-scope.md`
- `docs/product/glossary.md`
- `docs/architecture/overview.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/contracts.md`
- `docs/adr/README.md`

## License

License information will be added when the project licensing decision is finalized.
