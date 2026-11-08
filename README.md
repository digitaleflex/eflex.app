# EFLEX

> **Poussez un dépôt GitHub, EFLEX le met en ligne.**

EFLEX est une plateforme de déploiement : on connecte GitHub, on choisit un dépôt, EFLEX comprend la stack, construit l'application et la publie sur vos serveurs avec domaine, SSL et health checks.

- **eflex.app** est le produit : la marque, le site et la console client, en français.
- **Axiom** est le moteur interne : analyse, plan de déploiement, build et exécution sur les VPS via un agent.

Ce dépôt réunit les deux projets, avec l'historique complet de chacun (fusion de `digitaleflex/axiom` dans `digitaleflex/eflex.app`).

```text
Clients ──► Console EFLEX (eflex.app)
                 │  API REST + SSE
                 ▼
            Moteur Axiom (Go) : analyse → profil → plan → build → déploiement
                 │
                 ▼
            Agent Axiom sur chaque VPS : Docker + Traefik + SSL + health checks
```

## Organisation du dépôt

| Chemin | Rôle | Origine |
|---|---|---|
| `services/engine/` | Moteur Go : API, analyse, planification, build, déploiements, GitHub, secrets, auth, migrations PostgreSQL | Axiom |
| `services/agent/` | Agent installé sur les serveurs : Docker, Traefik, health, logs | Axiom |
| `services/orchestrator/` | Cadre d'orchestration (voir ADR-0010) | Axiom |
| `schemas/` | Contrats (`axiom.yaml`, schémas JSON) | Axiom |
| `apps/cloud/` | Console React + Vite (à remplacer par la console EFLEX) | Axiom |
| `apps/client-dashboard/` | Ébauche de tableau de bord Next.js 16 | Axiom |
| `portail/` | Portail Next.js EFLEX actuel (branché sur Coolify, à rebrancher sur le moteur) | Eflex |
| `packages/detector/` | Détecteur TypeScript déterministe (Laravel, PHP, Python, monorepos…), à porter dans le moteur | Eflex |
| `packages/renderer/` | Plan → docker-compose / nginx | Eflex |
| `schema/` | Schéma `eflex.json` v1 | Eflex |
| `docs/` | ADR, architecture, produit, sécurité (Axiom) + `docs/issues/` (feuille de route Eflex) | Les deux |
| `tests/` | Contrats, scénarios d'orchestrateur | Axiom |

Documentation détaillée :
- moteur Axiom : [`docs/axiom-engine.md`](./docs/axiom-engine.md), puis `docs/product/` et `docs/architecture/` ;
- détecteur Eflex : [`packages/detector/README.md`](./packages/detector/README.md) ;
- infrastructure : [`DEV.md`](./DEV.md), [`PROD.md`](./PROD.md), [`TRAEFIK_SETUP.md`](./TRAEFIK_SETUP.md).

## Pipeline de déploiement d'un projet

Le portail ne laisse **jamais** l'orchestrateur deviner la stack : le `BuildPlan` issu du détecteur est la source de vérité.

```text
Dépôt GitHub (snapshot)
   │  packages/detector → detect()
   ▼
BuildPlan (framework, runtime, install, build, start, port, services, postDeploy)
   │  packages/renderer → buildDeploymentArtifacts()
   ▼
Dockerfile + docker-compose.yml + nginx/default.conf + .env.example
   │  portail → POST /api/projects (202) → worker BullMQ → Coolify
   ▼
build_pack dockerfile (Dockerfile du dépôt) ou nixpacks (commandes du plan)
+ ports_exposes = port réel du plan + variables d'environnement chiffrées
+ domaine https://<slug>.<PORTAL_DOMAIN> + labels Traefik websecure
```

Points clés :

- **Port réel** : Python 8000, statique 80, Node 3000… ce n'est plus `3000` par défaut.
- **Laravel** : le compose décrit `app` (php-fpm), `web` (nginx), `queue`, `scheduler`, plus un service one-shot `migrate` qui exécute les `postDeploy` (`php artisan migrate --force`, caches…).
- **Aucun `nixpacks` implicite** : `build_pack` est toujours explicite. Coolify 4.6 ne déployant pas un compose brut sans `docker-compose.yaml` dans le dépôt, les plans multi-services sont refusés avec un message explicite : seuls les dépôts avec leur propre Dockerfile (`dockerfile`) ou les frameworks mono-service (`nixpacks`) sont déployés.
- **Domaine public** : chaque projet reçoit `<slug>.<PORTAL_DOMAIN>` (défaut `eflex.app`, DNS wildcard). Les labels Traefik (`websecure`, réseau `proxy`, `letsencrypt`) sont réappliqués par `PATCH` après création, car Coolify écrase les `custom_labels` avec ses propres entrypoints `http`/`https`.
- **Secrets** : jamais dans le plan, le Dockerfile ou le compose ; uniquement via les variables d'environnement Coolify, chiffrées au repos dans PostgreSQL (AES-256-GCM).
- `framework === 'docker'` : le Dockerfile du dépôt fait foi, Eflex n'en génère pas.

## Feuille de route de l'unification

1. **Un seul moteur** : porter les règles du détecteur Eflex (Laravel, PHP, Python, Svelte, Remix, SolidStart, RedwoodJS, monorepos) dans l'analyseur Go (`services/engine/internal/analyzer`), puis ajouter les presets d'exécution correspondants (Laravel : php-fpm + nginx + queue + scheduler).
2. **Un seul manifeste** : converger `eflex.json` et `axiom.yaml`.
3. **Une seule console** : la console client EFLEX (charte EFLEX, en français) construite sur l'API du moteur ; retrait de Coolify, de `apps/cloud` et de `apps/client-dashboard`.
4. Ensuite seulement, retrait de `packages/detector`, `packages/renderer` et `schema/`.

## Commandes

```bash
# Moteur et agent (Go)
cd services/engine && go test ./...
cd services/agent && go test ./...

# Packages TypeScript Eflex (pnpm, Node >= 24)
pnpm install
pnpm test
pnpm typecheck
pnpm typecheck:all   # détecteur + renderer + portail (avec prisma generate)

# Portail EFLEX (npm)
cd portail && npm install && npm run dev
```
