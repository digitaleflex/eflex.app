# [P0] Déployer à partir du BuildPlan (renderer) au lieu de Nixpacks par défaut

## Contexte

Aujourd'hui, `createApplication()` dans `portail/src/lib/coolify.ts` envoie le dépôt à Coolify avec :

```ts
build_pack: params.buildPack || 'nixpacks',
ports_exposes: params.portsExposes || '3000',
```

et `portail/src/app/api/projects/route.ts` ne passe aucun de ces deux paramètres. Conséquences :
- c'est **Nixpacks** qui détecte et construit, pas Eflex ;
- tout ce que produisent le détecteur et le renderer est ignoré : services Laravel (`php-fpm` + `nginx` + `queue` + `scheduler`), volumes, `postDeploy` (migrations, caches), healthchecks, port réel ;
- une application Laravel, Python (port 8000) ou statique (port 80) est exposée sur le mauvais port.

La question stratégique derrière : **si Coolify fait la détection et le build, qu'est-ce qui est propre à Eflex ?** Le `BuildPlan` doit devenir la source de vérité du déploiement.

## Objectif

Le déploiement d'un projet utilise le `BuildPlan` enregistré (voir #01) et la sortie de `renderStack()` (`packages/renderer`).

## Proposition technique

Deux approches, qui peuvent coexister :

### Option A — Coolify en mode `dockercompose` (recommandée pour aller vite)
1. Générer pour le projet : un `Dockerfile` par runtime (node / php / python / static) à partir du plan, **plus** le `docker-compose.yml` de `renderStack()`, `nginx/default.conf` et le modèle `.env`.
2. Créer l'application Coolify avec `build_pack: 'dockercompose'` et le contenu du compose (endpoint à confirmer selon la version de l'API Coolify).
3. Exécuter les `postDeploy` après la mise en ligne (commande Coolify « execute command » ou service one-shot dans le compose).

### Option B — Build par Eflex, Coolify uniquement comme runtime
1. Construire l'image côté Eflex (BuildKit/buildx) à partir des Dockerfiles générés depuis le plan, puis la pousser dans un registre.
2. Déployer le compose de `renderStack()` avec `ctx.image` pointant sur cette image.

### Dans tous les cas
- Nouveau module `packages/builder` (ou `renderer/src/dockerfile.ts`) : `BuildPlan → Dockerfile`, déterministe et testé sur les fixtures de `test/fixtures.ts`.
- `createApplication()` reçoit le plan et transmet le **vrai** port (`plan.port`) et le bon build pack.
- `framework === 'docker'` : garder le build pack `dockerfile` de Coolify (c'est le dépôt qui contrôle le build).
- Les secrets ne passent **jamais** par le plan ni par le compose généré : uniquement par les variables d'environnement Coolify.

## Critères d'acceptation
- [ ] Un projet Laravel déployé lance bien `app`, `web`, `queue` et `scheduler`, et exécute `php artisan migrate --force`.
- [ ] Un projet Python est exposé sur le port 8000, un site statique sur le port 80.
- [ ] Plus aucun appel à Coolify avec `nixpacks` par défaut.
- [ ] Tests unitaires `BuildPlan → Dockerfile` pour chaque framework des fixtures.
- [ ] `README.md` et `PROD.md` décrivent le pipeline : détection → plan → rendu → déploiement.

## Dépendances
- Dépend de : #01 « Intégrer le détecteur dans le flux Nouveau projet ».
- Dépend de : #03 « Renderer : couvrir tous les frameworks détectés ».
