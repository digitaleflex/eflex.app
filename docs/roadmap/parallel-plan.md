# Parallel Execution Plan — Remaining V0.1 Work

> Goal: finish V0.1 with maximum parallel agent throughput and zero file-ownership collisions.
> Rule: one path has one active owner. Lanes below are collision-free by construction.
> Sizes: S < 1h, M = 1–3h, L = 3–6h of agent work. Estimates assume the fixer profile.

## 0. Done (close-out only, owner: maintainer)

M0 (#25–#27), M1 (#28–#33), M2 (#34–#39), M3 engine (#57–#68), design (#131–#142).
Action: close issues with a status comment each; keep epics (#13–#17) open until their last child lands.

## Status

- **Wave 1 — DONE** (A #76/#77 `977b0b1`, B #89/#79 `d13f3e4`, C #83 `87061f3`, D #124/#121 `0a11717`, E #119 `ffefc1d`, F #104/#129-draft `7f786d5`)
- **Wave 2 — DONE** (G #78/#80 `5cf22ab`, H #84/#85/#86 `529244c`, I #122/#120 `36e99b9`, J #101 `220ea66`; follow-up correlation IDs `7b232de`)
- **Wave 3 — DELIVERED** (K #81/#82 agent state + recovery, L #87/#103 metrics, M #125 auth, N #126 secrets)
- **Wave 4 — DELIVERED** (O #88 agent network security, P #123 compose preset, Q #127/#128 authz + audit, R #102 diagnostics API: `services/engine/internal/diagnostics/`, `GET /api/v1/deployments/{id}/diagnostics[/logs]`)

Verified on 2026-11-07: the two wiring breakpoints that used to block these waves are closed in code. See "Verified status" below before concluding anything about operational state.

## Wave 1 — launch now (5 lanes, no inter-dependencies)

| Lane | Issues | Owned paths (exclusive) | Size | Notes |
|---|---|---|---|---|
| A — Agent identity & auth | #76, #77 (sequential) | `services/agent/internal/identity/`, `services/agent/internal/security/auth/`, `services/engine/internal/agentauth/` (new), `services/engine/migrations/009_agent_credentials.sql` (new) | L | Engine side included in-lane (registration endpoint, credential verify/rotate/revoke). Bootstrap wiring of new endpoints by lane owner. No other lane touches these paths. |
| B — Agent ownership + capabilities | #89 then #79 (sequential) | `services/agent/internal/security/ownership/`, `services/agent/internal/capabilities/` | M | #89 first (label scheme + naming constraints that #83/#84 will consume). No Docker/exec yet. |
| C — Docker adapter | #83 | `services/agent/internal/runtime/docker/` | L | Biggest single task. Constraint: stdlib only (agent `go.mod` has no deps) → Docker CLI via bounded argv (same pattern as engine `ExecBuilder`), never shell. Reads `ownership` (#89, Wave-1 output) and `protocol` (done). |
| D — axiom.yaml parser + Node presets | #124 (axiom.yaml parser, `internal/manifest/`) then #121 (Node/Next presets, `internal/runtime/presets/node/`) (sequential) | `services/engine/internal/manifest/` (new), `services/engine/internal/runtime/presets/` (new), `services/engine/internal/build/dockerfile.go` (templates only) | M | Manifest parser vs JSON schema (#31, frozen); precedence Override › manifest › detected › default. Wiring into `analysis.Service` = small, in-lane touch of `internal/analysis/service.go` (declare it). |
| E — Console shell | #119 | `portail/**` (shell, routing, API client, auth boundary, tokens→CSS) | L | Replaces the removed `apps/cloud` console (#16). Zero collision with Go work. Uses interim `AXIOM_API_TOKEN` until #125. |
| F — Docs (runbook + threat draft) | #104, #129-draft | `docs/operations/`, `docs/security/` | S | Zero code collision. #129 finalized after #88/#89. |

## Wave 2 — starts when Wave 1 lanes land (dependencies in brackets)

| Lane | Issues | Owned paths | Size | Needs |
|---|---|---|---|---|
| G — Heartbeat & dispatcher | #78 then #80 | `services/agent/internal/heartbeat/`, `services/agent/internal/dispatcher/` (+ engine liveness query: `internal/server/` read-side only) | L | #76 (identity), #77 (auth), #79 (caps) |
| H — Traefik + health + logs | #84, #85, #86 (one agent, sequential) | `services/agent/internal/runtime/traefik/`, `services/agent/internal/health/`, `services/agent/internal/logs/` | L | #89 labels, #80 interface (read protocol doc if #80 late; program to `protocol.Operation`) |
| I — Docker preset + console workflow | #122, #120 | `services/engine/internal/runtime/presets/docker/`, `portail/src/app/dashboard/new/` | M | #83 (build semantics), #119 (shell) |
| J — Structured logging | #101 | `services/engine/internal/observability/logging/`, logging convention doc | S | none (engine-only; agent adopts later) |

## Wave 3

| Lane | Issues | Owned paths | Size | Needs |
|---|---|---|---|---|
| K — Agent state + recovery | #81, #82 | `services/agent/internal/state/`, `services/agent/internal/recovery/` | M | #80, #83 |
| L — Metrics (agent + engine endpoint) | #87, #103 | `services/agent/internal/metrics/`, `services/engine/internal/observability/metrics/`, `/metrics` wiring in `httpserver` (declare) | M | #78 |
| M — User auth | #125 | `services/engine/internal/auth/`, `internal/api` auth middleware (declare exclusive during lane) | L | #71 (done) |
| N — Secrets store | #126 | `services/engine/internal/security/secrets/` (extend), `migrations/012_secrets.sql` | M | #77 |

## Wave 4

| Lane | Issues | Owned paths | Size | Needs |
|---|---|---|---|---|
| O — Network security | #88 | `services/agent/internal/security/transport/` + engine TLS posture | M | #75 (done), #77 |
| P — Compose preset | #123 | `services/engine/internal/runtime/presets/compose/`, build+executor compose path (declare both during lane) | M | #83, #89 |
| Q — Authz + audit | #127 then #128 | `services/engine/internal/authz/`, `services/engine/internal/audit/`, `migrations/013_audit.sql`, `internal/api` enforcement (declare exclusive during lane) | L | #125, #126 |
| R — Diagnostics API | #102 | `services/engine/internal/observability/diagnostics/`, additive API routes | M | #66 (done), #86 |

## Wave 5 — release

- #90 agent integration tests (after G/H/K), #105–#106 CLI (anytime, new dir, P1-post-V0.1 — deprioritize).
- #107 reference app: maintainer decision (docs).
- #108/#109 reference VPS + dry run: **human-gated** (real server, DNS, agent install).
- #110/#111 release gates, #112 evidence docs (parallelizable late), #113 tagging (human).
- #69/#71 verify-and-close; close epics #13–#18.

## Verified status (2026-11-07)

This section replaces the former "Known production gap". Both breakpoints it described are **closed in code**:

- **Engine** — `bootstrap.newRunner` constructs `build.Engine`, the agent transport and `executor.Runner` (`services/engine/internal/bootstrap/bootstrap.go`). A deployment created through the API is executed in the background and reaches `LIVE` or `FAILED`.
- **Agent** — `services/agent/cmd/agent/main.go` builds the composition root `bootstrap.New` (identity, credentials, state, capabilities, Docker/Traefik/health adapters, dispatcher, recovery, inbound listener, `/metrics`).
- **Engine → Agent** — `agentclient.Client` (direct HTTP) and `agentclient.NewNATAgent` (the agent long-polls), with per-agent operation signing (`agentkey`, ADR-0008). Without a secret key every runtime step fails closed with `AGENT_NO_CREDENTIAL`.
- **#102** — the diagnostics API is delivered.

Measured with PostgreSQL 16 and a real Docker daemon (`AXIOM_TEST_DATABASE_URL`, `AXIOM_TEST_DOCKER=1`, `AXIOM_TEST_E2E=1`, `go test ./... -count=1 -p 1`):

| Module | Result |
| --- | --- |
| engine | 693 pass, 0 fail, 0 skipped (43 packages with tests) |
| agent | 270 pass (269, plus `TestIntegrationLifecycle`, fixed: its fixture lacked `ApplicationID`) |
| orchestrator | 11 pass |

`internal/e2e` `TestGitHubToLive` passes: Dockerfile fixture → analysis → profile → plan → real `docker build` → real container → real health probe → `LIVE` (about 2 s).

### Still not proven (do not report as done)

- The e2e test records `https://e2e-test.local`: no Traefik, DNS or certificate is involved.
- Its agent transport is in-process: the real listener → protocol → HMAC → bridge handshake is not exercised end to end.
- The source is a fixture: the GitHub connection (OAuth application, archive download) was never run end to end.
- The agent CI job sets no `AXIOM_TEST_DOCKER`, so the agent's Docker integration tests never run in CI. That is how `TestIntegrationLifecycle` went stale.
- V0.1 stack coverage: Node (Next.js, Nuxt, Remix, SolidStart, RedwoodJS, Astro, SvelteKit, Vite, generic), Go, Python (FastAPI, Flask, Django with a `requirements.txt`), PHP and Laravel (Composer, single php-fpm+nginx container), Dockerfile, compose. Rails (Ruby) and Spring Boot (Java) are detected but rejected (`analyzer/evidence/decide.go`); queue/scheduler workers and persistent volumes are not modelled by the planner.
- **Issue #12 (Traefik/DNS/certificats réels)** : aucune URL HTTPS publique servie par Axiom avec certificat valide n'a été observée ; redéploiement sans interruption perceptible, rollback sur échec de santé réel et renouvellement de certificat ne sont pas prouvés. Des runbooks/scripts gabarits ont été préparés côté dépôt (voir `docs/operations/axiom-traefik-dns-tls-proof.md`, `scripts/axiom-proof/`) mais **aucune exécution réelle n'a été réalisée**.
- **Issue #13 (agent distant réel)** : aucun enrôlement, heartbeat/poll, déploiement complet, coupure réseau 60 s, rotation ni révocation n'ont été observés entre un moteur et un agent sur machines distinctes (NAT/réseau réel). Des runbooks/scripts gabarits ont été préparés (`docs/operations/axiom-agent-remote-proof.md`, `scripts/axiom-proof/`) mais **aucune exécution réelle n'a été réalisée**.

### Livrables code-side préparés pour #12/#13 (2026-11-12, non exécutés sur infra réelle)

- Runbooks : `docs/operations/axiom-traefik-dns-tls-proof.md`, `docs/operations/axiom-agent-remote-proof.md`.
- Gabarits opérateur : `scripts/axiom-proof/` (pré-vol, provisionnement, vérification TLS, déploiement Node/Python, sondes redéploiement/rollback, enrôlement agent, drills de coupure 60 s, collecte de preuves, exemples systemd/env agent).
- Mises à jour documentaires : `docs/security/threat-model.md` et `docs/architecture/agent-failure-matrix.md` complétés avec des sections « À valider sur infrastructure réelle » sans résultats observés.

Ces éléments facilitent la clôture mais **ne remplacent pas** les preuves demandées par #12/#13.

### What that means for the roadmap

- Wave 5 is no longer blocked by wiring. What blocks `#109` (reference dry run), `#110` (end-to-end gate on a real server), et la clôture de **#12/#13** est l'exécution réelle sur serveur(s), domaine/DNS, certificats et réseau distant, avec collecte de preuves.
- Nothing should be reported as "deployments go LIVE on a real server" on the basis of the in-process e2e test alone. Nothing should be reported as "agent distant prouvé" on the basis of tests in-process/fakes alone.

## Human-gated (cannot be delegated)

VPS provisioning (#108/#109, #12, #13), domaine/DNS/certificats réels (#12), exécution d'un agent distant réel et scénarios de panne réseau (#13), GitHub OAuth App credentials (real connect test), production `AXIOM_API_TOKEN`/`AXIOM_SECRET_KEY`, release tag (#113), closing design epic #130 (needs visual validation).

## Launch protocol per lane

Each lane gets: exclusive OWNED paths, READ list, FORBIDDEN list, `gh issue view` numbers, DB env (`AXIOM_TEST_DATABASE_URL`), `gofmt` + `go test -race` verification, no-commit rule (maintainer reviews, wires, commits). API-surface changes (`internal/api`, `migrations/*` numbering, contract docs) are declared in the lane and applied by the lane owner only.
