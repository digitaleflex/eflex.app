# Déploiement : monorepos et volumes persistants (#6)

État au 10 novembre 2026. Ce document décrit ce que la plateforme fait
réellement, ce qui reste désactivé et pourquoi. Il complète
`docs/architecture/deployment-policy.md` et `docs/issues/06-file-deploiement-redis.md`.

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
| `root` dans un workspace | `/` (racine du dépôt) | inchangé (depuis la racine) | `pnpm --filter '<nom>'... run '<script>'` | `cd '<root>' && <start>` |
| `root` autonome (hors workspace) | `/<root>` | inchangé | inchangé | inchangé |
| framework `docker` | `/<root>` ou `/` | ignoré | ignoré | ignoré |

Pour pnpm, le filtre construit l'application **et ses dépendances internes**
dans l'ordre topologique. Les autres gestionnaires (yarn, npm, bun) utilisent
`cd '<root>' && <build>` : ils bénéficient du `node_modules` installé à la
racine, mais pas de l'ordonnancement des dépendances du workspace.

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

## Limites connues

- **Laravel multi-services reste refusé.** Un plan Laravel déclare `app`, `web`,
  `queue` et `scheduler` ; le worker refuse tout plan de plus d'un service. Le
  volume `storage` est donc correctement décrit dans les artefacts, mais aucun
  déploiement Laravel complet n'est encore possible. La persistance réelle
  (fichier conservé après redéploiement) n'a pas été validée sur un Coolify de
  production.
- Le volume Laravel est monté sur `/app/storage` (Nixpacks). Un montage plus
  fin (`storage/app` seul) sera à décider lors de l'implémentation du
  multi-services.
- Les volumes ne sont jamais supprimés automatiquement : la suppression d'une
  application laisse ses volumes côté Coolify (choix conservateur).
- Le renderer généré (`pnpm render`) reste destiné au compose/Dockerfile ; le
  déploiement Coolify utilise Nixpacks pour les frameworks non-Docker. Les
  commandes préfixées `cd` du plan ne modifient donc pas le compose.
- L'API de stockage peut varier selon les versions de Coolify. La version
  minimale vérifiée est **4.7.3** ; en cas d'erreur, le drapeau
  `EFLEX_PERSISTENT_VOLUMES` doit être retiré avant de relancer.
