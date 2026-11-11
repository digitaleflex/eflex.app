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
| `schemas/` | Contrats Axiom (`axiom.yaml`, schémas JSON) — distinct de `schema/` | Axiom |
| `portail/` | Console et portail Next.js EFLEX (branché sur Coolify, à rebrancher sur le moteur) | Eflex |
| `packages/detector/` | Détecteur TypeScript déterministe (Laravel, PHP, Python, monorepos…), à porter dans le moteur | Eflex |
| `packages/renderer/` | Plan → docker-compose / nginx | Eflex |
| `schema/` | Schéma `eflex.json` v1 (produit EFLEX) — distinct de `schemas/` | Eflex |
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
Artefacts déterministes (Dockerfile/compose/nginx/.env.example) + réglages Coolify
   │  portail → POST /api/projects (202) → worker BullMQ → Coolify
   ▼
build_pack explicite : dockercompose (compose fourni D1) | dockerfile (Dockerfile du dépôt) | nixpacks (commandes du plan)
+ ports_exposes = port réel du plan + variables d'environnement chiffrées
+ domaine https://<slug>.<PORTAL_DOMAIN> + labels Traefik websecure
```

Points clés :

- **Port réel** : Python 8000, statique 80, Node 3000… ce n'est plus `3000` par défaut.
- **`build_pack` explicite** : `dockercompose` si le dépôt fournit un `docker-compose.yml`/`compose.yaml` (voie D1, fichier déployé tel quel), `dockerfile` si le dépôt fournit son propre Dockerfile, sinon `nixpacks` avec les commandes du plan. Aucun choix implicite laissé à Coolify.
- **Plans multi-services générés sans compose fourni** : refusés avec un message explicite orientant vers l’ajout d’un `docker-compose.yml`/`compose.yaml` à la racine de l’application (voie D1). La plateforme ne génère pas de compose multi-services ; les plans Laravel/PHP multi-services du renderer restent descriptifs tant qu’aucun compose fourni n’est présent.
- **Volumes** : les volumes du plan sont traduits, mais la création des stockages Coolify n’est effectuée que si `EFLEX_PERSISTENT_VOLUMES` est activé (désactivé par défaut) ; aucun volume n’est supprimé automatiquement, et sauvegardes/quotas de stockage ne sont pas implémentés.
- **Monorepo / multi-applications (D2)** : lots A–F livrés, lot G en cours. `EFLEX_MULTI_APP` est désactivé par défaut en production et activé en staging.
- **Domaine public** : chaque projet reçoit `<slug>.<PORTAL_DOMAIN>` (défaut `eflex.app`, DNS wildcard). Les labels Traefik (`websecure`, réseau `proxy`, `letsencrypt`) sont gérés selon les contraintes du mode (réappliqués par `PATCH` pour les applications non compose ; pour un compose fourni, les labels `websecure` doivent être déclarés dans le fichier).
- **Secrets** : jamais dans le plan, le Dockerfile ou le compose ; uniquement via les variables d'environnement Coolify, chiffrées au repos dans PostgreSQL (AES-256-GCM).
- `framework === 'docker'` : le Dockerfile du dépôt fait foi, Eflex n'en génère pas. `framework === 'compose'` : le compose du dépôt fait foi (D1).

## Feuille de route de l'unification

1. **Un seul moteur** : porter les règles du détecteur Eflex (Laravel, PHP, Python, Svelte, Remix, SolidStart, RedwoodJS, monorepos) dans l'analyseur Go (`services/engine/internal/analyzer`), puis ajouter les presets d'exécution correspondants (Laravel : php-fpm + nginx + queue + scheduler). **Python (FastAPI, Flask, Django avec `requirements.txt`) est fait et testé de bout en bout** ; restent Laravel/PHP et le reste de la liste (voir `docs/axiom-engine.md`, « Python preset »).
2. **Un seul manifeste** : converger `eflex.json` et `axiom.yaml`.
3. **Une seule console** : la console client EFLEX (`portail/`, charte EFLEX, en français) construite sur l'API du moteur ; retrait de Coolify. Les anciennes consoles Axiom (`apps/cloud`, `apps/client-dashboard`) ont été supprimées (#16).
4. Ensuite seulement, retrait de `packages/detector`, `packages/renderer` et `schema/`.

État vérifié du moteur Axiom (tests exécutés, ce qui est prouvé et ce qui ne l'est pas encore) : [`docs/roadmap/parallel-plan.md`](./docs/roadmap/parallel-plan.md), section « Verified status ».

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
