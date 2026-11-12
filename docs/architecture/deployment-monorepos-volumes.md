# Déploiement : monorepos et volumes persistants (#6)

État mis à jour (#6, lot G en cours). Ce document décrit ce que la plateforme fait
réellement, ce qui reste désactivé et pourquoi. Il complète
`docs/architecture/deployment-policy.md` et `docs/issues/06-file-deploiement-redis.md`.

## État de livraison (#6)

- **D1 — Compose fourni par le dépôt** : livré. Un dépôt qui fournit `docker-compose.yml`/`compose.yaml` est déployé comme application Coolify `dockercompose` (le fichier fait foi), avec validation de sécurité et routage selon les contraintes Traefik/Coolify documentées ci-dessous.
- **D2 — Multi-applications (monorepo)** : lots A–F livrés, lot G en cours. `EFLEX_MULTI_APP` est désactivé par défaut en production et activé en staging ; lorsque le drapeau est désactivé, le comportement mono-app reste inchangé.
- **Volumes persistants** : traduits du plan/artefacts, mais **création des stockages Coolify conditionnée à `EFLEX_PERSISTENT_VOLUMES` (désactivé par défaut)**. Aucun stockage n’est créé si le drapeau est inactif ; en cas d’activation, les erreurs Coolify sont bloquantes. Idempotence conservée, aucune suppression automatique de volumes.
- **Non implémenté** : sauvegardes et quotas de stockage. Les plans multi-services **générés** sans compose fourni restent refusés (voir limites).

## Contrat du plan

Le détecteur expose déjà :

- `root` : dossier de l'application (`""` pour la racine du dépôt, sinon `apps/web`) ;
- `repoRoot` : chemin de retour vers la racine (`../..`) ;
- `volumes` : répertoires persistants demandés par le plan.

Un champ optionnel `workspace` a été ajouté lorsque `root` appartient à un
workspace JavaScript (marqueur à la racine : `pnpm-workspace.yaml`, `turbo.json`,
`nx.json`, `lerna.json`, ou `workspaces` dans le `package.json` racine) :

```json
{
  "root": "apps/web",
  "repoRoot": "../..",
  "workspace": {
    "manager": "pnpm",
    "name": "@acme/web",
    "buildScript": "build"
  }
}
```

`name` n'est présent que si le `package.json` de l'application le déclare.
`buildScript` n'est présent que si la commande de build du plan correspond
exactement au script du paquet (ou à `<gestionnaire> run build`) : une commande
personnalisée n'est jamais remplacée.

Le schéma `schema/v1.json` et les fixtures du détecteur couvrent ce champ.

## Monorepo : réglages Coolify

Coolify exécute toutes les commandes Nixpacks dans
`clone du dépôt + base_directory` (vérifié dans `ApplicationDeploymentJob` de
Coolify 4.7.3). Le portail applique donc les règles suivantes
(`portail/src/lib/deploy-plan.ts`, `coolifyApplicationSettings`) :

| Cas | `base_directory` | `install` | `build` | `start` |
| --- | --- | --- | --- | --- |
| `root === ""` | non envoyé (défaut `/`) | inchangé | inchangé | inchangé |
| `root` dans un workspace | `/` (racine du dépôt) | inchangé (depuis la racine) | `<gestionnaire> --filter '<nom>'... run '<script>'` (pnpm, bun) ou `cd '<root>' && <build>` (yarn, npm) | `cd '<root>' && <start>` |
| `root` autonome (hors workspace) | `/<root>` | inchangé | inchangé | inchangé |
| framework `docker` | `/<root>` ou `/` | ignoré | ignoré | ignoré |

Pour pnpm et bun, le filtre construit l'application **et ses dépendances internes**
dans l'ordre topologique (`--filter '<nom>'...`). Les autres gestionnaires
(yarn, npm) utilisent `cd '<root>' && <build>` : ils bénéficient du
`node_modules` installé à la racine, mais pas d'un ordonnancement automatique
des dépendances internes du workspace. `coolifyApplicationSettings` n'applique
le filtre pnpm/bun que lorsque le nom du paquet et le script de build sont
connus ; sinon la commande de build reste préfixée par `cd '<root>' && ...`.

### `publish_directory`

Coolify copie le chemin depuis l'image de build (`/app` + chemin) : le champ
reste **relatif à `base_directory`** et commence par `/` pour satisfaire la
validation de Coolify.

- racine : `/dist` (avec build) ou `/` (sans build), comportement historique ;
- workspace : `/<root>/<publish>` (par défaut `/<root>/dist` avec build) ;
- sous-dossier autonome : `/dist` ou `/` (relatif à son propre dossier).

### Dockerfile dans un sous-dossier

Pour le framework `docker`, `base_directory` reste le dossier de l'application
(`/<root>`) et `dockerfile_location` vaut `/<plan.dockerfile>` (par exemple
`/docker/Dockerfile`). Le contexte de build Docker est ce même dossier : un
Dockerfile de monorepo qui attend la racine du dépôt doit donc être placé à la
racine (cas `root === ""`), ou être adapté par l'auteur du dépôt.

## Compose fourni par le dépôt (D1)

Un dépôt qui contient `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`
ou `compose.yaml` à la racine de l'application est déployé comme **Application
Coolify `docker_compose`** (`build_pack=dockercompose`). C'est la seule voie
Coolify pour un vrai multi-services avec statut, logs par service, annulation et
retour arrière.

### Précédence de détection

```text
eflex.json > compose > Dockerfile > monorepo > candidats de framework
```

- `eflex.json` reste prioritaire : c'est l'échappatoire explicite pour un
  compose réservé au développement local (base de données seule) ou pour fixer
  un autre framework.
- Le compose passe avant un `Dockerfile` présent au même endroit : il décrit
  l'application **et** ses voisins, et il référence souvent ce Dockerfile
  (`build: .`). Choisir le Dockerfile seul perdrait les workers et les sidecars.
- Un compose à la racine du dépôt passe avant la découverte de monorepo : il
  décrit la stack complète. Un compose dans un sous-dossier reste détecté
  lorsque ce dossier est choisi comme application (`discoverApps` reconnaît
  désormais un dossier qui ne contient qu'un compose).

### Contrat du plan

```json
{
  "framework": "compose",
  "runtime": "docker@1",
  "root": "apps/api",
  "port": 80,
  "compose": {
    "location": "/compose.yml",
    "services": ["app", "web", "queue"],
    "service": "web"
  }
}
```

Le plan est **descriptif** : aucun service n'est inventé, aucun fichier n'est
généré. Le détecteur ne lit que les noms de services et les ports conteneur
(`ports:`), sans dépendance YAML, pour choisir le service public probable.

### Réglages Coolify 4.7.3

| Élément | Valeur |
| --- | --- |
| `build_pack` | `dockercompose` |
| `docker_compose_location` | `plan.compose.location` (`/compose.yml`), relatif à `base_directory` |
| `base_directory` | `/<root>` (ou `/` à la racine) |
| `docker_compose_domains` | `[{ name: "<service>", domain: "https://<hôte>[,https://…]" }]` |
| `domains` | **jamais envoyé** (422 pour un compose) |
| `ports_exposes` | **jamais envoyé** (Coolify force 80) |
| commandes install/build/start | **jamais envoyées** : le compose les porte |
| `custom_labels` | **jamais envoyés** : Coolify les ignore pour un compose |
| `docker_compose_raw` | **jamais envoyé** : Coolify relit le fichier du dépôt |

Le worker relit le fichier à chaque déploiement (`fetchRepositoryFile`, API
Contents pour un dépôt privé, `raw.githubusercontent.com` pour un public) puis
applique `inspectCompose` **avant** tout appel Coolify.

### Sécurité

Le compose est refusé, avec un message explicite, s'il contient :

- `privileged: true` ;
- `network_mode: host` ;
- un montage de `/var/run/docker.sock` ;
- un montage de l'hôte en chemin absolu (`/etc`, `/home`, `~…`) ou par
  remontée `..`, en syntaxe courte ou longue.

Un bind relatif au dépôt (`./storage:/app/storage`) et les volumes nommés
restent autorisés. Coolify valide de son côté l'injection shell
(`validateDockerComposeForInjection`). Les secrets ne doivent **jamais** figurer
dans le compose : ils passent par les variables Coolify (`.env` commun à tous
les services).

### Domaines, TLS et labels

Coolify refuse `domains` pour une application compose : le domaine est attaché
au service public via `docker_compose_domains`. Le service est choisi par port
HTTP reconnu (80, 8080, 8000, 3000…), puis par nom (`web`, `nginx`, `app`…).
Sans service identifié, aucun domaine n'est attaché : le déploiement reste
possible, mais l'application n'est pas routée.

**Limite importante** : Coolify génère ses labels avec l'entrypoint `https`,
alors que le Traefik de l'hôte utilise `websecure`. Comme les `custom_labels`
ne s'appliquent pas à une application compose, le fichier du dépôt doit
déclarer lui-même les labels du routeur sur le service public, et le réseau
`proxy` externe :

```yaml
services:
  web:
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=proxy"
      - "traefik.http.routers.demo.rule=Host(`demo.eflex.app`)"
      - "traefik.http.routers.demo.entrypoints=websecure"
      - "traefik.http.routers.demo.tls.certresolver=letsencrypt"
      - "traefik.http.services.demo.loadbalancer.server.port=80"
    networks:
      - proxy
networks:
  proxy:
    external: true
```

Le worker journalise un avertissement quand `websecure` est absent. La
vérification TLS après déploiement (`waitForTls`) reste inchangée.

### Volumes, migrations et rollback

- **Volumes** : ceux du compose, jamais ceux du plan. Le worker ne crée aucun
  stockage Coolify pour un compose (`ensureApplicationStorages` est sauté) et
  ne supprime jamais un volume à la suppression de l'application.
- **Migrations** : `postDeploy` n'est pas exécuté automatiquement (le
  `post_deployment_command` d'un compose n'échoue pas le déploiement). Utilisez
  un service one-shot (`restart: "no"`, `depends_on` avec
  `condition: service_healthy`). Le worker journalise qu'il ignore les
  commandes.
- **Migrations de base** : aucune migration n'est jouée par la plateforme.
- **Rollback** : `POST /applications/{uuid}/rollback` fonctionne pour une
  Application compose ; Coolify relit toutefois le compose de la branche suivie.
  Un retour arrière ne restaure ni les volumes ni les variables d'alors.
- **Annulation / logs** : mêmes endpoints que le chemin mono-service
  (`POST /deployments/{uuid}/cancel`, logs de build) ; les logs d'exécution
  acceptent `service_name=<service>`.

## Volumes persistants

Les volumes du plan sont traduits en stockages persistants dans les artefacts
(`persistentVolumes` de `DeploymentArtifacts`, renderer) :

- chemin absolu (`VOLUME /app/data`) : monté tel quel ;
- chemin relatif (`storage`, `eflex.json`) : monté sous `/app`, le dossier de
  travail des images Nixpacks ;
- les doublons de chemin sont dédupliqués et les noms sont normalisés pour
  respecter `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`.

L'API réellement présente dans Coolify 4.7.3 (`routes/api.php`) est utilisée :

```text
GET  /applications/{uuid}/storages
POST /applications/{uuid}/storages
     { "type": "persistent", "name": "<nom>", "mount_path": "<chemin>" }
```

`ensureApplicationStorages` est idempotent : il lit les stockages existants,
crée uniquement les chemins manquants et ne modifie ni ne supprime jamais un
stockage existant. Une erreur de lecture ou de création est remontée pour que
le worker échoue explicitement.

### Activation

**Les volumes restent désactivés par défaut.** Le worker ne les crée que si
`EFLEX_PERSISTENT_VOLUMES=1` (ou `true`). Sans ce drapeau, il ajoute une ligne
`[volumes] … non montés` au journal et poursuit le déploiement : un jeton
Coolify sans droit de stockage ne doit pas casser un déploiement existant.

Pour activer :

1. vérifier que le jeton Coolify possède les droits `write` et `update` sur les
   applications ;
2. définir `EFLEX_PERSISTENT_VOLUMES=1` dans l'environnement du portail ;
3. valider sur un projet de test qu'un fichier écrit dans le volume survit à un
   redéploiement, puis généraliser.

## Validation réelle (staging)

Le 10 novembre 2026, un dépôt jetable contenant un `docker-compose.yml` (service
`web` nginx) a été déployé depuis le portail de staging :

- détection `compose`, plan `dockercompose` et application Coolify créée ;
- le contenu initial du compose est transmis à la création (`docker_compose_raw`)
  pour que Coolify accepte `docker_compose_domains` ; il relit ensuite le dépôt ;
- déploiement `live`, HTTP 200 et page nginx servie via HTTPS ;
- routeur Traefik porté par les labels du compose (`Host(...)`, `websecure`,
  `letsencrypt`).

**Conséquence pratique** : le domaine du projet (`<slug>.staging.eflex.app`)
n'est pas suffisant à lui seul. Le compose doit déclarer un routeur Traefik
`Host(...)` pour le domaine réellement utilisé, ou réutiliser le domaine du
projet. Sans labels, l'application démarre mais n'est pas routée par le Traefik
de l'hôte.

## Limites connues

- **Plans multi-services générés sans compose fourni : refusés.** Un plan Laravel (`app`, `web`, `queue`, `scheduler`) ou tout autre plan de plus d’un service généré par la plateforme est refusé tant que le dépôt ne fournit pas son propre compose. La voie supportée est D1 : ajoutez un `docker-compose.yml`/`compose.yaml` à la racine de l’application, l’application Coolify `dockercompose` déploie ce fichier tel quel. Le worker renvoie un message actionnable pointant vers cet ajout ; aucun compose n’est généré ni écrit dans le dépôt.
- **Multi-applications (D2)** : livré en lots A–F, lot G en cours. Le comportement multi-app dépend de `EFLEX_MULTI_APP` (désactivé par défaut en production, activé en staging).
- **Volumes** : traduits, mais la création de stockages Coolify ne se fait que si `EFLEX_PERSISTENT_VOLUMES` est activé (désactivé par défaut). Sans activation, aucun stockage n’est créé et le déploiement continue avec une trace `[volumes]`. Si activé, toute erreur de lecture/création Coolify est bloquante. **Sauvegardes et quotas de stockage ne sont pas implémentés.**
- Le volume Laravel est monté sur `/app/storage` (Nixpacks) pour le chemin mono-service. Un montage plus fin (`storage/app` seul) reste à décider si ce chemin mono-service évolue.
- Les volumes sont **conservés par défaut** à la suppression d'une application (`DELETE /applications/{uuid}?delete_volumes=false`). Une suppression explicitement destructive doit demander `{ deleteVolumes: true }` ; sinon les données persistent côté Coolify (choix conservateur, nettoyage manuel possible).
- Le renderer généré (`pnpm render`) reste destiné au compose/Dockerfile ; le déploiement Coolify utilise Nixpacks pour les frameworks non-Docker, et le fichier du dépôt pour `compose`. Les commandes préfixées `cd` du plan ne modifient donc pas le compose.
- **Compose** : pas de génération automatique, pas de fusion d'un `docker-compose.override.yml` (Coolify ne lit qu'un fichier), pas de migrations jouées automatiquement, et les labels `websecure` doivent être dans le fichier. Un compose avec `privileged`, `network_mode: host` ou un montage de l'hôte est refusé avant tout appel Coolify.
- L'API de stockage peut varier selon les versions de Coolify. La version minimale vérifiée est **4.7.3** ; en cas d'erreur, le drapeau `EFLEX_PERSISTENT_VOLUMES` doit être retiré avant de relancer.
