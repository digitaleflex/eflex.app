# Cartographie complète du projet (EFLEX / Axiom monorepo)

> Générée pour aider à comprendre l’architecture du dépôt.  
> **Contexte (rappel):** en production actuelle, le chemin retenu est **Portail Next.js + Prisma + BullMQ/Redis + Worker + Detector/Renderer TypeScript + Coolify**. Les services **Axiom Go** (`services/engine`, `services/agent`, `services/orchestrator`) sont **gelés** (voir ADR-0012) : conservés pour historique/tests, non utilisés par le portail pour les déploiements de production.

---

## 1) Vue d’ensemble (production aujourd’hui)

**Objectif (résumé):** plateforme de déploiement/exploitation (priorité devs indépendants, studios, agences) via un portail, avec analyse de dépôt, génération de plans/artefacts, exécution asynchrone, et runtime/déploiement assurés par **Coolify**.

**Flux haut niveau:**
1. Utilisateur connecté au **Portail** (Next.js) gère organisations/projets/abonnements.
2. Connexion d’un repo (GitHub App / PAT selon le flux) puis analyse : le portail utilise **`@eflex/detector`** sur un snapshot récupéré (API GitHub / raw selon public/privé). `POST /api/projects` **revalide côté serveur** (pas de confiance au plan client).
3. Projet enregistré (Prisma/PostgreSQL). `POST /api/projects` crée un `Deployment` en `queued` et enfile un job **BullMQ** (Redis).
4. Le **Worker** (processus portail, démarré via instrumentation Node) fait progresser la machine d’états  
   `queued → analyzing → provisioning → building → deploying → live | failed | cancelled`, utilise **`lib/deploy-plan.ts`** (s’appuie sur **`@eflex/renderer`**) pour traduire le plan, pilote **Coolify API v4.6** (`lib/coolify.ts`), gère domaines/labels Traefik côté app Coolify, vérifie TLS après mise en ligne, etc.
5. L’UI affiche statuts/logs (polling/SSE selon écrans), notifications (app/email selon config), événements temps réel (`Event` + SSE `/api/events`).

**Hors chemin prod:** Axiom Go n’orchestre pas les déploiements portail → Coolify dans le flux actuel.

---

## 2) Arborescence racine (rôles principaux)

- `AGENTS.md` — règles du repo, source de vérité (réf. `docs/architecture/eflex/*`, ADR-0012), commandes, conventions.
- `README.md` — présentation, architecture actuelle, commandes, liens documentation.
- `PROD.md`, `DEV.md` — notes déploiement dev/prod.
- `TRAEFIK_SETUP.md` — guide historique/liens Traefik (contexte Axiom) ; en prod portail, Traefik est **externe** sur le réseau `proxy`.
- `docker-compose.dev.yml` — stack dev locale (Postgres, Redis, MinIO, etc., selon fichier).
- `docker-compose.prod.yml` — stack **prod portail** : `portail`, `docs`, `postgres`, `redis`, `migrate` (profil `tools`). **Pas** Traefik (réseau externe `proxy`). Volumes `eflex_postgres_data`, `eflex_redis_data`, réseaux `proxy` + `eflex-internal`.
- `docker-compose.staging.yml`, `docker-compose.portail.yml` — variantes.
- `Dockerfile.portail` / `portail/Dockerfile` — build image portail (contexte repo important pour packages TS).
- `deploy.sh`, `scripts/deploy-prod.sh`, `scripts/*` — déploiement, sync domaines, sauvegardes, vérifications, etc.
- `config/domains.sh` — **source unique** des domaines/URLs publics (dérivés de `EFLEX_ROOT_DOMAIN`). `scripts/sync-domains.sh` régénère des fichiers statiques.
- `packages/` — packages TypeScript (detector, renderer).
- `portail/` — application principale Next.js 15 (App Router) : UI, API, auth, Prisma, queue, worker, intégrations.
- `services/` — `engine`, `agent`, `orchestrator` (Go), **gelés** côté prod portail.
- `schema/` — schéma E-FLEX produit (`eflex.json`, `schema/v1.json`) + tests.
- `schemas/` — contrats Axiom (à ne pas confondre avec `schema/`).
- `docs/` — architecture (`docs/architecture/eflex/*`, ADR), opérations, marque, etc.
- `docs-site/` — site documentation (Starlight), servi en prod via service `docs`.
- `assets/brand/` — sources de marque (non servies telles quelles depuis l’app publique sauf via `portail/public`).

---

## 3) `portail/` (cœur applicatif actuel)

**Stack (indicatif):** Next.js 15 (App Router), TypeScript, Prisma, Better Auth, Tailwind, BullMQ/ioredis, intégrations (Coolify, GitHub, Resend, paiements selon config), etc. (détails fins dans `portail/package.json` et le code).

### Auth & identité
- Better Auth (`src/lib/auth.ts`, `auth-client.ts`, `session.ts`). Modèles Better Auth étendus via Prisma. Plugins : `organization`, `admin`, `twoFactor`, `emailOTP`, `lastLoginMethod`, passkeys (`@better-auth/passkey`), `nextCookies`. Rate limiting DB + Redis pour certaines routes (`lib/rate-limit.ts`). Captcha Turnstile optionnel. En-têtes sécurité via `security-headers.mjs` + `next.config.mjs`.

### Multi-tenant / organisations
- Accès projets via organisation active (`resolveOrganization(session)`, `lib/organizations.ts`). Droits via rôles (`canManageProjects`, etc.). Admin plateforme : plugin `admin`, garde `api/admin/**`, audit.

### Données (Prisma)
- Schéma de référence : **`portail/prisma/schema.prisma`** (modèles Better Auth + `Project`, `EnvVar`, `Deployment`, `Subscription`, etc.). Commandes depuis `portail/` (`prisma generate|migrate|validate`).
- Secrets projet : `EnvVar.value` chiffré AES-256-GCM (`lib/crypto.ts`), AAD `projectId:key`, `ENV_ENCRYPTION_KEY` (+ `ENV_ENCRYPTION_KEY_PREVIOUS`), validation au démarrage (instrumentation), scripts de migration/chiffrement dédiés.

### Projets, détection, plan
- Analyse : routes API (`POST /api/projects/analyze`, `POST /api/projects`). `lib/repo-analysis.ts` récupère arbre/fichiers (GitHub API / raw selon public/privé + jeton). `lib/github-url.ts`. **Détection refaite côté serveur** à la création. Alias TS vers packages (`tsconfig` paths, `experimental.externalDir`, `extensionAlias`).
- Plans : `lib/deploy-plan.ts` utilise `@eflex/renderer` pour paramètres/artefacts envoyés à Coolify (règles : mono/multi-services, compose fourni vs généré, etc., selon doc).
- Env : éditeur `components/env/env-editor.tsx`, parsing `lib/env-parse.ts`, bulk `POST .../env-vars/bulk`.

### Déploiements asynchrones
- File **BullMQ** `lib/queue.ts` (`jobId = deploymentId`, `REDIS_URL`). Worker `src/worker.ts` lancé via `src/instrumentation.ts` / `instrumentation-node.ts` (code Node isolé pour éviter les soucis de bundling edge).
- États `lib/deployment-state.ts`. Création → `202` + `Deployment queued`. Suivi API, polling UI, annulation, watchdog (`lib/deployment-watchdog.ts`, `DEPLOYMENT_TIMEOUT_MINUTES`).
- **Coolify** `lib/coolify.ts` (API v4.6) : projet/env, création app (dockerfile/nixpacks selon cas), déploiements, réapplication labels Traefik si besoin, vérification TLS post-live, domaines personnalisés (`ProjectDomain`, vérifs DNS/CNAME/A/AAAA), etc.
- Points importants (résumé) : certains cas multi-services refusés selon contraintes Coolify documentées ; compose fourni traité comme stack Compose Coolify (selon doc) ; un déploiement actif par projet (`lib/project-deployments.ts`) ; multi-app derrière `EFLEX_MULTI_APP` (voir `AGENTS.md`).

### Temps réel, notifications, logs
- Bus `lib/event-bus.ts` (table `Event`, polling) → SSE `/api/events` (filtré par org). Hooks côté client (`EventsProvider`, etc.).
- Logs déploiement/exécution avec masquage secrets (routes dédiées).
- Notifications `lib/notifications.ts` (app + email Resend si configuré, préférences, anti-doublon).

### Autres briques (aperçu)
- GitHub App / webhooks (`lib/github-app.ts`), billing/abonnements (`lib/plans.ts`, `lib/billing*.ts`, paiements), bases managées Coolify et backups (`lib/database-backups.ts`), admin (`/admin/*`), sécurité (headers, CSP report en place selon config), docs ops, etc.

### Repères `portail/src`
- `app/` — App Router (pages + `app/api/...`).
- `components/` — UI.
- `lib/` — logique métier et intégrations.
- `worker.ts`, `instrumentation.ts`, `instrumentation-node.ts`.

---

## 4) Packages TypeScript (`packages/`)

### `packages/detector`
- Entrée `src/detect.ts` (`detect`), CLI `src/cli.ts`.
- Parcours via `src/walk.ts` (`walkRepository`, `IGNORED_SEGMENTS`) — source unique.
- Règles (résumé `AGENTS.md`) : `eflex.json` valide prioritaire (sinon `plan: null` si invalide), compose fourni peut primer selon logique, puis Dockerfile, puis monorepo/candidats, etc. Déterministe, pas de réseau/fs hors snapshot par conception, messages en français.

### `packages/renderer`
- Entrée `src/render.ts`, YAML (`yaml`). Génère Dockerfile, artefacts de déploiement (`src/dockerfile.ts`, `src/deploy.ts`), templates nginx/env selon frameworks mappés (détails dans `AGENTS.md`). Utilisé par le portail via alias et par CLI/tests.

### `schema/` (racine)
- `schema/v1.json` (JSON Schema du plan E-FLEX), tests Ajv sur fixtures (`schema/test.ts`). Toute évolution du `BuildPlan` doit rester alignée (types TS + schema + fixtures).

---

## 5) Infrastructure & déploiement

- **Dev:** `docker-compose.dev.yml`.
- **Prod portail:** `docker-compose.prod.yml` (portail, docs, Postgres, Redis, migrate). Traefik externe sur `proxy`.
- **Domaines:** `config/domains.sh` source unique ; `deploy.sh` le source ; `scripts/sync-domains.sh` pour fichiers statiques.
- **Déploiement:** `deploy.sh` (vérifs, migrations, build/up, healthcheck). `scripts/deploy-prod.sh` ajoute garde-fous git et vérifications post-déploiement.
- **Ops:** `scripts/*` (backup, restore test, healthcheck, etc.) et `docs/operations/*`.

---

## 6) Axiom (Go) — gelé
- `services/engine`, `services/agent`, `services/orchestrator` (Go, chacun son `go.mod`). Docs/contrats historiques dans `docs/product/*`, `docs/architecture/overview.md`, `docs/architecture/api-contract.md`, `schemas/*`. Décision **ADR-0012** : hors chemin prod portail ; reprise uniquement avec nouvel ADR et preuves.

---

## 7) Contrats à ne pas confondre
- `schema/` (racine) : **E-FLEX** (`eflex.json`, plan v1).
- `schemas/` : contrats **Axiom**.

---

## 8) Commandes (rappel)
- Racine : `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm typecheck:all`, `pnpm detect <dir>`, `pnpm render <dir>`.
- Portail (`portail/`) : `npm install`, `npm run dev|build|start|lint|typecheck`, Prisma via `npx prisma ...`.
- Prod : `bash deploy.sh` ou `bash scripts/deploy-prod.sh ...` (avec `.env.prod` et `config/domains.sh`).

---

## 9) Pour aller plus loin (docs dans le repo)
- `docs/architecture/eflex/README.md` (source de vérité produit)
- `docs/adr/0012-eflex-production-coolify-axiom-paused.md`
- `PROD.md`, `DEV.md`, `docs/operations/*`
