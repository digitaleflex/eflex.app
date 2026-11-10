# Déploiement multi-services : ce que Coolify 4.7.3 permet réellement (#6, #11)

État au 10 novembre 2026. Décision d'architecture pour les plans qui déclarent
plusieurs processus (Laravel `app` + `web` + `queue` + `scheduler`), plusieurs
applications dans un monorepo, ou des sidecars.

Ce document complète `docs/architecture/deployment-monorepos-volumes.md`
(volumes et monorepos, déjà livrés), `docs/adr/0011-coolify-then-axiom.md`
(Coolify reste le backend) et `docs/architecture/compose-preset.md` (preset
compose du moteur Axiom, encore incomplet côté multi-images).

**Méthode.** Étude en lecture seule. Les constats Coolify viennent du code de
l'image réellement déployée sur le VPS (`coollabsio/coolify:4.7.3`, conteneur
`coolify`, `/var/www/html`) et de son `openapi.yaml` local ; les constats EFLEX
viennent du dépôt (`portail/src/worker.ts`, `portail/src/lib/coolify.ts`,
`portail/src/lib/deploy-plan.ts`, `packages/renderer/src/*`). Aucune
application n'a été créée, modifiée ou déployée, aucun secret n'est reproduit.

> ⚠️ `portail/src/worker.ts`, `portail/src/lib/coolify.ts` et l'interface de
> déploiement sont en cours de modification par un autre chantier (retour
> arrière, #21). Les numéros de ligne ne sont donc pas cités : le plan ci-dessous
> raisonne en fonctions et en points d'insertion, et devra être rebasé après la
> fusion de ce lot.

## 1. État actuel du produit

| Élément | Comportement | Source |
| --- | --- | --- |
| Garde-fou multi-services | tout plan dont `artifacts.services.length > 1` est refusé avec un message explicite, avant tout appel Coolify | `worker.ts`, `processDeployment` |
| Laravel | le renderer produit déjà `app` (php-fpm, volume `storage`), `web` (nginx + `nginx/default.conf`), `queue`, `scheduler` et un service one-shot `migrate` | `packages/renderer/src/render.ts`, `deploy.ts` |
| Port réel | `portsExposes` vient du plan (`ports.web ?? ports.app ?? plan.port`) | `deploy-plan.ts`, `buildDeploymentArtifacts` |
| Volumes | traduits en `persistentVolumes`, créés via `POST /applications/{uuid}/storages` seulement si `EFLEX_PERSISTENT_VOLUMES=1` | `deploy-plan.ts`, `coolify.ts` |
| Commentaire du client | affirme que « Coolify 4.6 ne sait pas combiner un Dockerfile/compose généré avec la source d'un dépôt » | `deploy-plan.ts`, en-tête |

Ce dernier point est **vérifié et toujours vrai en 4.7.3**, mais pour une raison
plus précise que celle écrite dans le commentaire : ce n'est pas seulement le
champ `dockerfile` qui ne clone pas, c'est le compose qui est **rechargé depuis
le dépôt à chaque déploiement**.

## 2. Constats vérifiés sur Coolify 4.7.3

### 2.1 Deux ressources distinctes, aux capacités différentes

Coolify expose deux objets qui acceptent du compose :

| | **Application** (`build_pack=dockercompose`) | **Service** (`POST /services`) |
| --- | --- | --- |
| Source du compose | fichier **lu dans le dépôt Git** | `docker_compose_raw` stocké en base |
| Dépôt Git | obligatoire | **aucun** |
| Build du code du dépôt | oui (`build:` relatif au clone) | non (workdir vide, pas de clone) |
| Identifiant de déploiement | oui (`deployment_uuid`) | **non** |
| Statut / logs de build via API | oui | **non** |
| Annulation | `POST /deployments/{uuid}/cancel` | **non** |
| Retour arrière | `POST /applications/{uuid}/rollback` | **non** |
| Domaines | `docker_compose_domains` (le champ `domains` est refusé) | `urls[]` par service |
| Volumes | déclarés dans le compose du dépôt, ou API `storages` | déclarés dans le compose, API `storages` en lecture seule |

Routes : `routes/api.php` (`/applications/*`, `/services/*`, `/deploy`,
`/deployments/*`). Le client du portail ne connaît aujourd'hui que la colonne
« Application ».

### 2.2 Application compose : `docker_compose_raw` est écrasé à chaque déploiement

Trois faits, dans cet ordre :

1. `POST /applications/public` (et les variantes privées) accepte
   `build_pack=dockercompose`, `docker_compose_location`,
   `docker_compose_domains`, `base_directory` et **`docker_compose_raw`**
   (`ApplicationsController::create_application`, liste `allowedFields`).
2. `PATCH /applications/{uuid}` accepte `build_pack`, `docker_compose_location`
   et `docker_compose_domains`, **mais pas `docker_compose_raw`** (la liste
   `allowedFields` de `update_by_uuid` ne le contient pas).
3. `ApplicationDeploymentJob::deploy_docker_compose_buildpack()` appelle
   **systématiquement** `loadComposeFileForDeployment()` **avant** de choisir
   entre compose brut (`is_raw_compose_deployment_enabled`) et compose parsé.
   `Application::loadComposeFile($isInit = false)` clone le dépôt, lit le fichier
   dans les **objets Git** (`git ls-tree HEAD -- <base_directory><location>`),
   puis écrase `docker_compose_raw` (l'early-return n'existe que pour
   `$isInit === true`).

Conséquence : un compose généré par le portail ne peut pas être « poussé » dans
une Application. À chaque redéploiement, Coolify relit le fichier du dépôt ; s'il
est absent, le déploiement échoue avec « Docker Compose file not found » ; s'il
est présent, c'est **lui** qui est déployé, pas le nôtre.

Autres points utiles :

- `domains` est **interdit** pour `dockercompose` (422) : le routage passe par
  `docker_compose_domains` (tableau `{name, domain, redirect}`), et
  `ports_exposes` est forcé à `80`.
- `docker_compose_location` vaut `/docker-compose.yaml` par défaut en base : un
  dépôt qui utilise `docker-compose.yml` ou `compose.yaml` doit être corrigé par
  `PATCH`.
- `post_deployment_command` fonctionne pour un compose **uniquement** avec
  `post_deployment_command_container` (nom du service compose). Un échec de
  cette commande est journalisé mais **ne fait pas échouer le déploiement**
  (`run_post_deployment_command` : `catch` sans relance) — inadapté aux
  migrations Laravel.
- `GET /applications/{uuid}/logs?service_name=web` renvoie les logs **du service
  compose demandé** : la fonctionnalité « logs par service » existe déjà côté
  API.
- `base_directory` s'applique au clone : `workdir = clone + base_directory` et
  le compose est cherché sous `base_directory + docker_compose_location`.

### 2.3 Dockerfile généré : contexte vide, ou fichier du dépôt

- `POST /applications/dockerfile` stocke un Dockerfile **en ligne**
  (`applications.dockerfile`). `ApplicationDeploymentJob::deploy_simple_dockerfile()`
  l'écrit dans le workdir et construit **sans cloner le dépôt** : le contexte de
  build est vide, un `COPY . .` échoue.
- `build_pack=dockerfile` clone bien le dépôt, mais utilise le Dockerfile
  **du dépôt** (`dockerfile_location`). Il n'existe aucun champ pour fournir un
  Dockerfile généré avec le code du dépôt.
- Les « file storages » (`POST /applications/{uuid}/storages`, `type=file`) sont
  écrites **au démarrage des conteneurs** (`write_missing_content_files`), donc
  après le build ; et `loadComposeFile` lit les objets Git, pas le workdir. Elles
  ne permettent donc pas d'injecter un Dockerfile ni un compose avant le build.

### 2.4 Service : le seul compose sans dépôt, mais sans suivi de déploiement

`ServicesController::create_service` accepte `docker_compose_raw` **encodé en
base64** (vérifié par `isBase64Encoded`), `urls[]` (`{name, url}`),
`instant_deploy`, `connect_to_docker_network`. `PATCH /services/{uuid}` accepte
le compose (base64), re-parse et réapplique les `urls`.

Le déploiement, lui, ne passe pas par la file de déploiement :

- `DeployController::deploy_resource()` traite `Service::class` par
  `StartService::run($resource)` et **ne renvoie aucun `deployment_uuid`**.
- `GET /deployments/{uuid}` exige `$deployment->application` : un déploiement de
  service est introuvable (404).
- `StartService` écrit le compose dans
  `/data/coolify/services/<uuid>/docker-compose.yml` puis exécute
  `docker compose --project-name <uuid> up -d --remove-orphans --force-recreate --build`.
  Le résultat est une activité Coolify (`remote_process`, `type_uuid`), pas une
  entrée `application_deployment_queue`.
- `POST /services/{uuid}/start` répond 400 « Service is already running » si le
  service tourne : le redéploiement passe par
  `POST /services/{uuid}/restart` (`RestartService`, `?latest=1` pour `pull`).
- Le statut est un agrégat de l'état des conteneurs (`Service::getStatusAttribute`),
  consultable par `GET /services/{uuid}` (`applications[].status`), sans notion
  de « build en cours ».
- Les volumes viennent du compose (volumes nommés, préfixés par le nom de projet
  = UUID du service, conservés par `up --force-recreate`). L'API `storages` est
  en lecture seule pour ces volumes.
- Les labels Traefik sont générés par le parseur à partir des `urls`
  (`applicationParser`) : les labels du compose sont **conservés** puis fusionnés
  avec les labels générés (les générés gagnent en cas de même clé). Nos routeurs
  (`<slug>-web`, entrypoint `websecure`) et ceux de Coolify (`<uuid service>`,
  entrypoint `https`) portent des noms différents, donc coexistent ; à valider
  en staging, `GenerateExactLabels` étant un réglage **serveur**
  (`server_settings.generate_exact_labels`, `false` sur le VPS actuel).

### 2.5 Ce qui n'existe dans aucune API Coolify

- Injecter un fichier (Dockerfile, compose) dans le contexte de build avant le
  build.
- Fournir un compose à une Application sans le committer.
- Suivre (statut, logs, annulation, retour arrière) un déploiement de Service.

## 3. Modélisation des plans multi-services

### 3.1 Laravel

| Élément du plan | Artefact renderer actuel | Écart à traiter |
| --- | --- | --- |
| `app` php-fpm (9000) | service `app`, image générée, `CMD php-fpm`, volume `<slug>_storage:/var/www/html/storage` | le Dockerfile généré est `php:8.3-fpm` seul : pas de nginx, pas de queue/scheduler |
| `web` nginx (80) | `nginx:1.27-alpine` + `nginx/default.conf` (`root /var/www/html/public`, `fastcgi_pass app:9000`) | nginx ne partage pas `public/` : les fichiers statiques (`/build/*`, images) renvoient 404 ; `try_files $uri` ne peut pas fonctionner |
| `queue` / `scheduler` | services `workerService` sur la même image, volume `storage` partagé | correct, mais aucun ordre de démarrage ni healthcheck |
| migrations (`postDeploy`) | service one-shot `migrate` (`restart: no`, `depends_on: [app]`) | `depends_on` sans `condition: service_healthy` : la migration peut partir avant que la base/php-fpm soit prêt |
| volume `storage` | volume nommé partagé `app`/`queue`/`scheduler` | montage à `/var/www/html/storage` (pas `storage/app`) : à trancher |

Le renderer est donc **presque** complet ; ce qui manque est le chemin de
déploiement, pas la description. Deux corrections de modélisation sont à faire
dans tous les cas : partage de `public/` avec nginx (volume nommé ou
`nginx` dans l'image applicative) et `depends_on` avec condition de santé pour
`migrate`.

### 3.2 Monorepo multi-applications

Un monorepo multi-app n'est **pas** un problème de compose : chaque application
a son propre build, son propre port, son propre domaine. Le déploiement actuel
(une Application Coolify par projet, `base_directory=/`, build filtré
`pnpm --filter '<pkg>'...`) fonctionne déjà pour **une** application. Le besoin
est donc une relation 1 projet → N applications, et non un compose.

### 3.3 Sidecars et volumes

- Sidecar « image + config » (redis, adminer, worker sur image prébuilt) : c'est
  exactement ce qu'un **Service** Coolify sait faire, sans dépôt.
- Sidecar qui partage le code de l'application (worker Laravel, nginx) : il faut
  la même image que l'application, donc un build — impossible dans un Service.
- Ordre de démarrage : `depends_on` (+ `condition: service_healthy`), healthchecks
  déclarés dans le compose. Coolify ne les réécrit pas pour un compose applicatif.

## 4. Options

Effort = développement + tests, hors validation staging (≈ 1 j par lot).

| | Option | Ce que ça donne | Effort | Risques |
| --- | --- | --- | --- | --- |
| **A** | Application `dockercompose` avec `docker_compose_raw` généré, non commité | — | **irréalisable** | `loadComposeFile` écrase le raw à chaque déploiement (§2.2) ; `PATCH` refuse `docker_compose_raw` |
| **A′** | Application `dockercompose` avec un compose **présent dans le dépôt** (fourni par l'utilisateur ou copié depuis nos artefacts) | multi-services complet, statut/logs/annulation/rollback natifs, logs par service | 5–6 j | dépend d'une action utilisateur ; validation du compose (sécurité) ; pas de génération automatique |
| **B** | Image unique supervisor (nginx + fpm + queue + scheduler) | un seul conteneur, chemin mono-service actuel | 3–4 j **si** le dépôt a un Dockerfile, sinon impossible sans y écrire | Coolify ne peut pas injecter le Dockerfile (§2.3) ; `php artisan serve` n'est pas une option de production ; perte de l'isolation des workers |
| **B′** | Service compose **image-only** (sidecars) + Application pour le build | sidecars et bases sans dépôt | 5–7 j | pas de statut/logs/annulation/rollback pour la partie Service ; deux ressources par projet ; ordre à orchestrer nous-mêmes |
| **C** | Migration Axiom (moteur + agent) | multi-services natif, volumes, compose | 3–5 semaines | bloqué par #100/#83 (handoff multi-images) et par le planner (pas de queue/scheduler/volumes) ; ADR-0011 interdit la bascule avant parité |
| **D** | **Hybride** : mono-service inchangé, compose pour les plans multi-services | voir §5 | 6–8 j (D1+D2), D3 = C | dépend de la validation staging ; deux chemins à maintenir |
| **E** | GitOps : le portail commite le compose généré sur une branche du dépôt utilisateur | compose dans le dépôt sans action manuelle | 6–8 j | écriture dans le dépôt client (permission `contents:write`), bruit Git, conflits, revue sécurité ; rejeté pour l'instant |

## 5. Décision recommandée : D, en trois lots

**Principe directeur : le portail ne fabrique jamais un compose pour une
Application Coolify. Un compose généré ne va que là où Coolify l'accepte
réellement — aujourd'hui nulle part sans dépôt — donc la génération automatique
multi-services est repoussée à Axiom.**

### D1 — Débloquer le compose fourni par le dépôt (2 semaines)

Objectif : un utilisateur qui a un `docker-compose.yaml` (Laravel avec workers,
sidecars, stack existante) est déployé correctement, avec toutes les capacités
Coolify (statut, logs par service, annulation, retour arrière).

1. **Détecteur** : reconnaître `docker-compose.yml|yaml`, `compose.yml|yaml` à la
   racine et sous `root`, ainsi que les fichiers `*.override`. Nouveau framework
   `compose` (ou champ `BuildPlan.compose: { location }`) ; mise à jour de
   `packages/detector/src/types.ts`, `schema/v1.json`, fixtures (`allFixtures()`).
   Le plan reste **descriptif** : aucun service n'est inventé.
2. **Renderer** : pour `compose`, ne rien générer (le compose fait foi) ;
   `buildPack = 'dockercompose'` ; exposer les artefacts existants
   (compose + Dockerfile + `nginx/default.conf`) au téléchargement.
3. **Client Coolify** (`lib/coolify.ts`) : `buildPack` accepte `dockercompose` ;
   nouveau paramètre `dockerComposeLocation` ; `domains` **omis** pour compose ;
   `dockerComposeDomains` (tableau `{name, domain, redirect}`) à la place ;
   `postDeploymentCommandContainer` ; `getApplicationLogs(appId, lines, serviceName)`.
4. **Worker** : remplacer le refus sec par un aiguillage :
   - plan mono-service → chemin actuel, inchangé ;
   - plan compose avec fichier détecté → Application `dockercompose`, `PATCH`
     de `docker_compose_location` si le fichier n'est pas
     `/docker-compose.yaml`, vérification TLS inchangée ;
   - plan multi-services **sans** compose dans le dépôt → refus explicite, avec
     les artefacts téléchargeables et la consigne « ajoutez ce compose (et son
     Dockerfile) au dépôt, puis relancez ». Aucun faux espoir, aucune écriture
     dans le dépôt.
5. **Volumes** : sauter `ensureApplicationStorages` pour `dockercompose` (les
   volumes sont dans le compose) et l'indiquer dans les logs.
6. **UI** : message du refus + bouton « Télécharger les artefacts » ; onglet logs
   avec sélecteur de service (`service_name`).

Coût : détecteur + schéma 1,5 j ; client + worker 2 j ; UI/artefacts 1 j ; tests
1 j ; staging 1 j.

### D2 — Monorepo multi-applications (2 semaines)

Sans compose : `ProjectApp` (nom, `root`, plan, port, domaine, `coolifyAppId`,
statut TLS), N applications Coolify par projet, domaine principal sur l'app
désignée, sous-domaines `<app>.<slug>.<PORTAL_DOMAIN>` pour les autres.
`Deployment` reste au niveau projet, avec un statut par application. Quotas de
plan comptés par application (impact tarifaire explicite).

Ne pas confondre avec les plans multi-services : c'est ici que la valeur est la
plus immédiate, et le risque le plus faible.

### D3 — Multi-services généré : Axiom (trimestre)

C'est la seule voie qui livre Laravel `app+web+queue+scheduler` **sans** imposer
un fichier au dépôt. Prérequis déjà identifiés : handoff multi-images
(#100/#83), planner `Services`/`DependencyOrder`/volumes, preset PHP en un
conteneur nginx+fpm+supervisor (existant mais non prouvé hors tests,
`services/engine/internal/runtime/presets/php`), agent qui monte les services
dans l'ordre. La bascule reste encadrée par `DeployBackend` (ADR-0011) et les
critères de sortie de #11.

**Ce que l'on refuse explicitement**

- **A** : impossible en 4.7.3 (§2.2) — ne pas réessayer sans nouvelle preuve sur
  une version ultérieure.
- **B** comme fonctionnalité plateforme : impossible sans Dockerfile dans le
  dépôt. Reste un **patron documenté** (« ajoutez ce Dockerfile ») et le chemin
  d'Axiom.
- **B′** seul : ne donne ni statut, ni logs, ni annulation, ni rollback pour la
  partie Service ; ne pas l'utiliser pour l'application elle-même.
- **E** : écriture dans le dépôt client, refusée pour raisons de sécurité et de
  propriété des données.

## 6. Contrat de données et points d'insertion

### 6.1 `BuildPlan` (détecteur / schéma)

```jsonc
{
  "framework": "compose",          // nouveau
  "runtime": "docker@1",
  "root": "",
  "port": 80,
  "compose": {                      // nouveau, uniquement framework compose
    "location": "/docker-compose.yaml",
    "services": ["app", "web", "queue", "scheduler"]
  }
}
```

`services` reste la liste des services **exposés** (port/healthcheck) ; il ne
décrit pas les workers. `schema/v1.json` et `schema/test.ts` doivent accepter ce
plan ; les fixtures compose existantes doivent rester valides.

### 6.2 Prisma

D2 uniquement :

```prisma
model ProjectApp {
  id            String  @id @default(cuid())
  projectId     String
  name          String        // "web", "api", "admin"
  root          String        // chemin de l'application dans le dépôt
  plan          Json?
  port          Int
  domain        String?
  coolifyAppId  String?
  tlsValid      Boolean?
  @@unique([projectId, name])
}
```

Aucune migration n'est nécessaire pour D1 (le plan compose tient dans
`Project.plan`).

### 6.3 Fichiers touchés (D1)

| Fichier | Changement |
| --- | --- |
| `packages/detector/src/detectors/compose.ts` (nouveau), `detect.ts` | détection + candidat |
| `packages/detector/src/types.ts`, `schema/v1.json` | `framework: compose`, champ `compose` |
| `packages/detector/test/fixtures.ts` | fixtures compose (+ monorepo, sans compose) |
| `packages/renderer/src/deploy.ts` | `buildPack = 'dockercompose'` pour compose, pas de génération |
| `portail/src/lib/deploy-plan.ts` | `dockerComposeLocation`, `dockerComposeDomains`, pas de `domains` |
| `portail/src/lib/coolify.ts` | `createApplication`/`updateApplication` compose, `serviceName` dans les logs |
| `portail/src/worker.ts` | aiguillage mono/compose/refus, volumes, logs par service |
| UI déploiement | artefact téléchargeable, message de refus, sélecteur de logs |
| `portail/src/lib/coolify.test.ts`, tests worker | tests des charges utiles |

> Rebaser ce lot après la fusion du chantier retour arrière (#21), qui réécrit
> `worker.ts`, `coolify.ts` et l'UI.

## 7. Tests et validation staging

Tests unitaires (sans infrastructure) :

- détection : `docker-compose.yml`, `compose.yaml`, `compose.override.yml`,
  monorepo avec compose dans `apps/api`, monorepo sans compose (refus attendu) ;
- `schema/test.ts` : nouveaux plans valides, plans multi-services sans compose
  invalides si `framework=compose` sans `location` ;
- `deploy-plan.ts` : `dockerComposeDomains` bien formé, `domains` absent,
  `dockerComposeLocation` normalisé avec `/` initial ;
- `coolify.ts` : payload de création compose (pas de `domains`, `build_pack`,
  `docker_compose_location`), payload PATCH, logs avec `service_name` ;
- worker : refus explicite pour multi-services sans compose, aucun appel
  Coolify avant le refus.

Matrice staging (projet jetable, **jamais** sur `eflex.app`) :

| # | Cas | Attendu |
| --- | --- | --- |
| 1 | dépôt avec `docker-compose.yaml` (Laravel app+web+queue) | déploiement `live`, `/` répond, worker consomme une tâche |
| 2 | même dépôt, compose dans `apps/api` | `base_directory` + `docker_compose_location` corrects |
| 3 | compose nommé `compose.yml` | `PATCH` de `docker_compose_location` appliqué |
| 4 | migration en service one-shot | ordre de démarrage respecté, échec visible dans les logs |
| 5 | `storage` (fichier écrit) + redéploiement | fichier conservé, partagé entre `app` et `queue` |
| 6 | logs par service (`service_name=queue`) | logs du bon conteneur |
| 7 | annulation en cours de build | `cancelled`, conteneurs arrêtés |
| 8 | retour arrière vers un déploiement `live` | compose du commit précédent redéployé |
| 9 | certificat TLS | `[SSL]` valide, y compris domaine personnalisé |
| 10 | multi-services sans compose | refus explicite, zéro application créée |

Pré-requis staging : serveur avec `generate_exact_labels` **activé** et
certificat résolveur `letsencrypt`, réseau `proxy` externe, jeton Coolify avec
`read:sensitive` (logs) et `deploy`.

## 8. Risques

| Risque | Détail | Mitigation |
| --- | --- | --- |
| Sécurité du compose | un compose peut demander `privileged`, `network_mode: host`, un bind de `/var/run/docker.sock`, un port < 1024 | rejeter ces clauses **avant** l'envoi (mêmes règles que `docs/architecture/compose-preset.md`), Coolify validant déjà l'injection shell |
| Secrets | le compose est stocké en clair dans Coolify et visible dans l'UI ; Coolify injecte un `.env` commun à tous les services | jamais de secret dans le compose ; variables via `setEnvironmentVariable` ; noter le rayon d'exposition (tous les services voient toutes les variables) |
| Volumes | suppression d'application ne supprime pas les volumes ; un montage trop large masque l'image | documenter, monter `storage/app` plutôt que `storage`, ne jamais supprimer automatiquement |
| Rollback | natif pour une Application, inexistant pour un Service | D1 uniquement (Application) ; ne pas exposer le rollback sur un Service |
| Logs | logs de build d'un Service invisibles par API | D1 uniquement ; ne pas promettre le direct pour un Service |
| Migrations | `post_deployment_command` d'un compose n'échoue pas le déploiement | service one-shot `migrate` (`restart: no` + `condition: service_healthy`), jamais `post_deployment_command` seul |
| Réseau/TLS | labels générés par Coolify (`entryPoint https`) ≠ Traefik de l'hôte (`websecure`) | labels explicites dans le compose, `networks.proxy.external`, test staging #9 |
| Coût / quotas | N applications ou N conteneurs par projet | quotas par application (D2), documenter l'impact tarifaire |
| Exploitation | deux chemins de déploiement (mono/compose) | un seul `DeployBackend` (ADR-0011), tests de contrat communs |

## 9. Critères de sortie

- [ ] un dépôt avec un compose se déploie `live` avec `queue`/`scheduler` visibles
      dans les logs, sans modification du dépôt par la plateforme ;
- [ ] un plan multi-services **sans** compose est refusé avant tout appel
      Coolify, avec les artefacts téléchargeables et un message actionnable ;
- [ ] volumes `storage` partagés et persistants après redéploiement (staging) ;
- [ ] logs par service exposés dans l'UI, sans secret ;
- [ ] annulation et retour arrière fonctionnent sur le chemin compose ;
- [ ] `pnpm test`, `pnpm typecheck:all`, `next build` verts ;
- [ ] aucun chemin n'écrit de secret dans un compose, un log ou une réponse API.

Effort cumulé : **D1 ≈ 6–8 jours**, **D2 ≈ 8–10 jours**, **D3 = Axiom** (déjà
estimé 3–5 semaines par #11, conditionné par #100/#83).

## 10. Références

- Coolify 4.7.3 (image locale) : `routes/api.php`,
  `app/Http/Controllers/Api/ApplicationsController.php`
  (`create_application`, `update_by_uuid`, `create_storage`, `logs_by_uuid`),
  `app/Http/Controllers/Api/ServicesController.php`
  (`create_service`, `update_by_uuid`, `action_deploy`, `action_restart`),
  `app/Http/Controllers/Api/DeployController.php` (`deploy_resource`,
  `deployment_by_uuid`), `app/Jobs/ApplicationDeploymentJob.php`
  (`deploy_docker_compose_buildpack`, `deploy_dockerfile_buildpack`,
  `deploy_simple_dockerfile`, `loadComposeFileForDeployment`,
  `run_post_deployment_command`), `app/Models/Application.php`
  (`loadComposeFile`, `composeFileReadCommands`), `app/Actions/Service/StartService.php`,
  `bootstrap/helpers/parsers.php` (`applicationParser`, `addTraefikDockerNetworkLabel`),
  `app/Enums/BuildPackTypes.php`, `openapi.yaml`.
- EFLEX : `portail/src/worker.ts`, `portail/src/lib/coolify.ts`,
  `portail/src/lib/deploy-plan.ts`, `packages/renderer/src/{render,deploy,dockerfile,nginx,compose,routing}.ts`,
  `packages/detector/src/{types,detect}.ts`, `schema/v1.json`,
  `docs/adr/0011-coolify-then-axiom.md`, `docs/architecture/compose-preset.md`,
  `docs/architecture/deployment-monorepos-volumes.md`.
