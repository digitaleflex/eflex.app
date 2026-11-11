# [P0] Déployer à partir du BuildPlan (renderer) au lieu de Nixpacks par défaut

> **État (mis à jour, #6 lot G)** : le principe est réalisé. Le `BuildPlan` est la source de vérité transmise à Coolify (`build_pack`, port réel, commandes, dossier de travail). `packages/renderer` génère Dockerfile/artefacts quand nécessaire, mais le portail ne s'appuie pas sur un compose généré envoyé à Coolify.
>
> - **Compose fourni par le dépôt (D1)** : livré. Un `docker-compose.yml`/`compose.yaml` détecté est déployé comme application Coolify `dockercompose` (le fichier du dépôt fait foi).
> - **Build pack effectif** : `dockerfile` si le dépôt fournit son Dockerfile, `dockercompose` si le dépôt fournit un compose, sinon `nixpacks` avec les commandes et le port issus du plan (valeur explicite, jamais implicite).
> - **Plans multi-services générés sans compose fourni** : refusés avec un message explicite qui oriente vers l’ajout d’un `docker-compose.yml`/`compose.yaml` (voie D1). La plateforme ne génère pas de compose multi-services.
> - **Monorepo / multi-app (D2)** : A–F livrés (`EFLEX_MULTI_APP` prod 0, staging 1), lot G en cours.
> - **Volumes** : traduits du plan/artefacts, mais création des stockages Coolify conditionnée à `EFLEX_PERSISTENT_VOLUMES` (désactivé par défaut) ; pas de suppression automatique, sauvegardes/quotas non implémentés.
> - **Reste (#6)** : activation/validation réelle des volumes derrière drapeau, fin du lot G, sauvegardes/quotas.

## Contexte (historique)

Au départ, `createApplication()` envoyait le dépôt à Coolify sans `build_pack`/`ports_exposes` explicites issus du plan : Coolify détectait et construisait via Nixpacks, ignorant le plan (services Laravel, volumes, `postDeploy`, port réel).

## Objectif

Le déploiement d'un projet utilise le `BuildPlan` enregistré et les artefacts dérivés.

## État technique actuel

- `portail/src/lib/deploy-plan.ts` : traduction plan → réglages Coolify (port, commandes, `base_directory`, `publish_directory`, compose fourni, volumes persistants traduits) et aiguillage `deploymentKind` (`compose` / `single` / `multiple-without-compose` / `invalid-compose`).
- `portail/src/worker.ts` : file BullMQ, machine à états, déploiement idempotent, refus explicite des plans multi-services générés sans compose avec guidage D1, création de stockages Coolify uniquement si `EFLEX_PERSISTENT_VOLUMES` est actif.
- `portail/src/lib/coolify.ts` : API Coolify 4.7.x (applications `dockerfile`/`nixpacks`/`dockercompose`, domaines, variables, storages, annulation, logs).
- `packages/renderer` : Dockerfile et artefacts déterministes depuis le plan (tests sur fixtures) ; le compose généré n'est pas poussé brut à Coolify.

## Critères d'acceptation (reformulés selon la réalité)

- [x] Le port réel du plan est transmis (Python 8000, statique 80, Node 3000, etc.).
- [x] `build_pack` et `ports_exposes` sont explicitement dérivés du plan/contexte (pas de valeur implicite laissée à Coolify).
- [x] Dépôts avec Dockerfile : `dockerfile`. Dépôts avec compose fourni : `dockercompose`. Sinon : `nixpacks` avec commandes du plan.
- [x] Les plans multi-services générés sans compose fourni sont refusés avec un message actionnable (ajout d’un `docker-compose.yml`/`compose.yaml`).
- [x] Compose fourni (D1) déployé tel quel ; domaines et labels gérés selon les contraintes Coolify/Traefik documentées.
- [x] Volumes traduits ; création Coolify derrière `EFLEX_PERSISTENT_VOLUMES` (désactivé par défaut), idempotente, sans suppression automatique.
- [x] Tests unitaires `BuildPlan → Dockerfile`/artefacts sur les fixtures ; tests portail sur la traduction plan → déploiement.
- [ ] Validation réelle « Laravel complet multi-services » en production sans compose fourni : **non applicable** tant que les plans générés multi-services sont refusés. La voie supportée est un compose fourni (D1) dans le dépôt.

## Dépendances
- Dépend de : #01 « Intégrer le détecteur dans le flux Nouveau projet ».
- Dépend de : #03 « Renderer : couvrir tous les frameworks détectés ».
- Suite : #6 (volumes, monorepos/multi-app, compose fourni D1).
