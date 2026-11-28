# E-FLEX App

> **Déployez et exploitez vos applications sans porter seuls toute la complexité DevOps.**

E-FLEX App est une plateforme de déploiement et d'exploitation managée destinée en priorité aux développeurs indépendants, studios et agences numériques. Elle regroupe le déploiement, l'hébergement, la surveillance, la protection des données et l'assistance opérationnelle.

## Architecture de production actuelle

Le chemin de production est le **portail Next.js + Prisma + BullMQ + Coolify**. Le moteur Axiom Go n'est pas utilisé par le portail pour les déploiements de production.

```text
Développeur / Agence
        │
        ▼
Portail E-FLEX (Next.js)
        │
        ├── PostgreSQL (données plateforme)
        ├── Redis / BullMQ (tâches asynchrones)
        ├── Detector + Renderer (analyse et plan)
        │
        ▼
Worker portail
        │
        ▼
Coolify API
        │
        ├── Docker / Compose
        ├── Domaines / TLS / runtime
        └── Applications clientes
```

Les sauvegardes, l'observabilité, le Build Plane séparé et l'expérience agence sont décrits selon leur état réel dans le référentiel [EAOA v1.0](docs/architecture/eflex/README.md).

## Décisions actuelles

- Le portail Next.js reste le Control Plane produit.
- Coolify reste l'unique backend de déploiement/runtime actuellement utilisé par le portail.
- `packages/detector` et `packages/renderer` restent le chemin d'analyse TypeScript.
- BullMQ/Redis traite les tâches de déploiement asynchrones.
- Les builds doivent être progressivement séparés des serveurs runtime.
- Axiom (Go) est conservé mais mis en pause ; il ne doit pas être présenté comme le moteur de production ni recevoir de nouveaux travaux courants.
- Pas de réécriture globale en Go/Rust, pas de Kubernetes ou multi-cloud dans la roadmap immédiate.

Décision détaillée : [ADR-0012](docs/adr/0012-eflex-production-coolify-axiom-paused.md). Historique : [ADR-0011](docs/adr/0011-coolify-then-axiom.md).

## Référentiel d'architecture

**Commencer ici : [docs/architecture/eflex/README.md](docs/architecture/eflex/README.md)**

Ce dossier contient :
- la vision produit et le périmètre ;
- les 13 couches fonctionnelles ;
- les fondations Sécurité & Gouvernance et Gestion des ressources ;
- la topologie d'infrastructure ;
- les flux critiques ;
- la roadmap ordonnée ;
- la matrice des capacités réellement livrées.

## Organisation du dépôt

| Chemin | Rôle | Statut dans le chemin produit actuel |
|---|---|---|
| `portail/` | Portail Next.js, API, worker, Prisma, intégrations | **Production** |
| `packages/detector/` | Analyse déterministe des dépôts et BuildPlan | **Production** |
| `packages/renderer/` | Plans et artefacts de déploiement | **Production** |
| `schema/` | Schéma E-FLEX `eflex.json` et contrats de plan | **Actif** |
| `docs/architecture/eflex/` | Référentiel E-FLEX courant | **Source de vérité produit** |
| `docs/operations/` | Runbooks : déploiements, volumes, backups, analytics | **Actif** |
| `docs/adr/` | Décisions d'architecture | **Actif** |
| `services/engine/` | Moteur Axiom Go | **Gelé / hors chemin portail actuel** |
| `services/agent/` | Agent distant Axiom Go | **Gelé / hors chemin portail actuel** |
| `services/orchestrator/` | Ancien cadre d'orchestration Axiom | **Gelé / hors chemin portail actuel** |
| `schemas/` | Contrats du sous-système Axiom | **Conservé avec Axiom** |

Les sous-systèmes Axiom ne sont pas supprimés : ils conservent leur historique, leurs tests et leurs contrats. Toute reprise exige un nouvel ADR et des preuves de production.

## Pipeline de déploiement actuel

1. Le dépôt est connecté et analysé en lecture seule par le détecteur.
2. Le BuildPlan et les résultats de détection sont enregistrés sur le projet.
3. Le renderer et le portail déterminent les réglages à transmettre à Coolify.
4. `POST /api/projects` enregistre un déploiement et place un job BullMQ.
5. Le worker traite les étapes et pilote Coolify via `portail/src/lib/coolify.ts`.
6. L'application est vérifiée ; les logs, états et notifications sont exposés au portail.

Limites importantes :
- Un plan multi-services généré sans Compose fourni est refusé.
- Un Compose fourni par le dépôt est déployé comme stack Compose Coolify.
- La persistance des volumes reste conditionnée par le flag documenté ; un volume n'est pas une sauvegarde.
- Un rollback d'image ne restaure pas les bases, volumes ou anciennes variables.
- La détection d'une technologie ne constitue pas une certification de compatibilité production.

Détails : [deployment operations](docs/operations/deployments.md), [monorepos et volumes](docs/architecture/deployment-monorepos-volumes.md), [volumes](docs/operations/volumes.md).

## Documentation opérationnelle

- [Développement](DEV.md)
- [Production](PROD.md)
- [Détecteur](packages/detector/README.md)
- [Contrat de schéma](schema/README.md)
- [Déploiement continu (CD)](docs/operations/cd-deploy.md) — déploiement automatique du portail sur `push` vers `main` via GitHub Actions.
- [Sauvegardes et restauration du portail](docs/operations/backups.md) — ne couvre pas automatiquement les données des applications clientes.
- [Mesure d'audience](docs/operations/analytics.md) — analytics agrégées intégrées, avec limites de collecte documentées.
- [Décisions d'architecture](docs/adr/README.md)

## Commandes

À la racine :

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm typecheck:all
pnpm detect ./mon-repo
pnpm render ./mon-repo
```

Portail :

```bash
cd portail
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Axiom (uniquement si un travail Axiom est explicitement réouvert et approuvé) :

```bash
cd services/engine && go test ./...
cd services/agent && go test ./...
```

## Règles de contribution

1. Lire le référentiel E-FLEX avant de modifier une frontière ou un flux.
2. Vérifier l'état du code et des flags avant d'affirmer qu'une capacité est livrée.
3. Toute modification de backend, persistance, contrat ou frontière de sécurité exige une décision ADR.
4. Toute nouvelle route doit appliquer l'isolation tenant et avoir des tests associés.
5. Ne jamais ajouter de secret, donnée client ou backup dans Git.
6. Mettre à jour la matrice des capacités après chaque livraison vérifiée.
