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

## Feuille de route de l'unification

1. **Un seul moteur** : porter les règles du détecteur Eflex (Laravel, PHP, Python, Svelte, Remix, SolidStart, RedwoodJS, monorepos) dans l'analyseur Go (`services/engine/internal/analyzer`), puis ajouter les presets d'exécution correspondants (Laravel : php-fpm + nginx + queue + scheduler). **Python (FastAPI, Flask, Django avec `requirements.txt`) est fait et testé de bout en bout** ; restent Laravel/PHP et le reste de la liste (voir `docs/axiom-engine.md`, « Python preset »).
2. **Un seul manifeste** : converger `eflex.json` et `axiom.yaml`.
3. **Une seule console** : la console client EFLEX (charte EFLEX, en français) construite sur l'API du moteur ; retrait de Coolify, de `apps/cloud` et de `apps/client-dashboard`.
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

# Portail EFLEX (npm)
cd portail && npm install && npm run dev
```
