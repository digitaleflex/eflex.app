# Déploiements : compose fourni et retour arrière

Ce document décrit le déploiement d'un compose fourni par le dépôt et le
comportement du retour arrière (« redéployer cette version »), avec ses limites.
Il complète `AGENTS.md` et le code du worker (`portail/src/worker.ts`).

## Déploiement normal

`POST /api/projects` (création), `POST /api/projects/[id]/redeploy` et le
webhook GitHub (`push`) créent un `Deployment` `queued`, mis en file BullMQ.
Le worker appelle `POST /deploy` de Coolify **sans commit** : Coolify déploie
la tête de la branche suivie (`Project.branch`) au moment du build. Le SHA
affiché dans l'historique est celui connu au moment de la demande (webhook ou
analyse), pas nécessairement celui construit si un autre push arrive entre
les deux.

## Compose fourni par le dépôt

Un dépôt avec `docker-compose.yml` / `docker-compose.yaml` / `compose.yml` /
`compose.yaml` à la racine de l'application est déployé comme **Application
Coolify `dockercompose`**. Le fichier est lu par Coolify dans le dépôt à chaque
déploiement : le portail ne l'envoie pas et ne le réécrit pas.

### Prérequis

- Le compose doit être **commité** et présent à la racine de l'application (ou
  du sous-dossier choisi dans un monorepo).
- Il doit contenir une section `services:` non vide.
- Pour être accessible, le service public doit déclarer ses propres labels
  Traefik avec l'entrypoint `websecure` et le réseau `proxy` externe : les
  labels générés par Coolify utilisent `https`, absent du Traefik de l'hôte, et
  les `custom_labels` ne s'appliquent pas aux applications compose.
- Les migrations ne sont pas exécutées par la plateforme. Utilisez un service
  one-shot (`restart: "no"`, `depends_on` avec `condition: service_healthy`).
- Les secrets restent dans les variables du projet (Coolify écrit un `.env`
  commun à tous les services du compose) ; jamais dans le fichier.

### Refus de sécurité

Le worker relit le compose avant tout appel Coolify et refuse :

| Clause | Message |
| --- | --- |
| `privileged: true` | `privileged: true` |
| `network_mode: host` | `network_mode: host` |
| `/var/run/docker.sock` monté | « le montage de la socket Docker… est interdit » |
| montage absolu ou remontée `..` de l'hôte (`/etc`, `/home`, `~…`) | « le montage de l'hôte … est interdit » |

Un bind relatif au dépôt (`./storage:/app/storage`) est accepté.

### Domaines et TLS

Le domaine principal et les domaines personnalisés vérifiés sont attachés au
service public via `docker_compose_domains`. Le service est choisi d'après les
ports conteneur (80, 8080, 8000, 3000…) puis son nom (`web`, `nginx`, `app`…).
Sans service reconnu, aucun domaine n'est attaché et le journal le signale.
La vérification TLS après déploiement (`waitForTls`) reste la même.

### Logs par service

L'onglet **Logs** propose un sélecteur quand le plan est un compose. Il appelle
`GET /applications/{uuid}/logs?service_name=<service>` (Coolify 4.7.3) ; le
service doit figurer dans le plan. Les secrets connus sont masqués côté serveur.

### Volumes, annulation, retour arrière

- Les volumes du compose sont conservés par Docker Compose sous le projet de
  l'application. La plateforme ne crée aucun stockage Coolify et ne supprime
  jamais ces volumes.
- L'annulation (`POST /deployments/{uuid}/cancel`) et les logs de build suivent
  le chemin commun.
- Le retour arrière (`POST /applications/{uuid}/rollback`) fonctionne, mais
  Coolify relit le compose de la branche suivie : un retour arrière ne restaure
  ni les volumes, ni les variables, ni une ancienne version du compose.
- Un plan multi-services **sans** compose reste refusé avant tout appel Coolify.
- La validation de sécurité lit la tête de branche au début du job ; un push
  concurrent peut modifier le compose avant le clone de Coolify. Pour une
  sécurité stricte, protégez la branche de production et relancez le
  déploiement après revue.

## Retour arrière

### Endpoint Coolify retenu

Coolify 4.7.3 n'accepte pas de commit sur `POST /deploy`. Le seul endpoint
non destructif est :

```
POST {COOLIFY_API_URL}/applications/{uuid}/rollback
Content-Type: application/json

{ "commit": "<sha de 40 caractères hexadécimaux>" }
```

Il renvoie `{ deployment_uuid }`. Il est implémenté par
`deployApplicationCommit()` dans `portail/src/lib/coolify.ts`.

Contraintes imposées par Coolify (contrôle `GetRollbackImages::allows`) :

- le commit doit être **le commit d'un déploiement réussi** de cette
  application (`status = finished`, hors pull request et hors rollback), ou
  une image de retour encore présente sur le serveur ;
- sinon la réponse est `422 Validation failed` et le worker échoue avec un
  message explicite (« L'hébergement refuse ce retour arrière… ») ;
- une file pleine renvoie `400`.

L'alternative — `PATCH /applications/{uuid}` avec `git_commit_sha`, puis
`POST /deploy`, puis restauration de la valeur — n'est **pas** utilisée :
entre les deux appels l'application resterait épinglée sur l'ancien commit, et
un redémarrage du portail laisserait cet épinglage en place. L'endpoint
`/rollback` ne modifie ni `git_branch` ni `git_commit_sha`.

### Flux dans Eflex

1. `POST /api/projects/[id]/deployments/[deploymentId]/rollback`
   - session + `resolveOrganization` + `canManageProjects` (owner/admin) ;
   - le déploiement cible doit appartenir au projet **et** à l'organisation
     active (sinon `404`) ;
   - `commitSha` doit respecter `/^[0-9a-f]{40}$/` (sinon `400`) ;
   - le déploiement cible doit être `live` (sinon `409`) ;
   - un seul déploiement actif par projet (sinon `409`) ;
   - limite de débit : 10 demandes par minute et par utilisateur ;
   - crée un `Deployment` `queued` avec le SHA cible, enfile le job avec
     `{ rollback: true }` et écrit l'audit `deployment.rollback`
     (cible + version en ligne au moment de la demande).
2. Le worker reconnaît l'option `rollback` portée par le job (BullMQ conserve
   les données du job lors des reprises) :
   - il valide à nouveau le SHA avant toute transition ;
   - il appelle `deployApplicationCommit()` au lieu de `deployApplication()` ;
   - le reste du pipeline est identique (statuts, journaux, annulation,
     vérification TLS).
3. Les déploiements normaux (webhook, redéploiement, création) n'ont pas
   l'option : ils continuent de déployer la tête de branche.
4. L'interface propose « Redéployer cette version » sur chaque déploiement
   `live` dont le SHA est complet, avec confirmation et toast.

## Limites connues

- **Variables d'environnement** : le retour arrière réutilise les variables
  **actuelles** du projet (celles de la base, déchiffrées au moment du build).
  Les valeurs d'alors ne sont pas conservées : un retour arrière n'est pas un
  instantané complet de configuration.
- **Migrations de base de données** : aucune migration n'est annulée. Si une
  version plus récente a modifié le schéma, l'ancienne version peut ne pas
  démarrer. Restaurer la base est une opération séparée (voir
  `docs/operations/backups.md`).
- **Branche** : la branche suivie n'est pas modifiée. Le déploiement suivant
  (webhook ou « Redéployer ») repart de la tête de branche, pas du commit
  restauré. Pour figer durablement une version, il faut créer un tag/branche
  dans le dépôt et changer la branche de production du projet.
- **Cible obligatoirement réussie** : on ne peut revenir qu'à un déploiement
  `live`. Un déploiement `failed` ou `cancelled` n'est pas proposé (Coolify
  refuserait le commit, faute d'image ou de build réussi).
- **Fidélité du SHA** : le SHA enregistré par Eflex est celui demandé au
  moment du déploiement. Si la branche a avancé entre le webhook et le build,
  Coolify a construit un autre commit ; le retour arrière peut alors être
  refusé en `422`. Dans ce cas, relancer un déploiement normal (tête de
  branche) puis revenir à une version dont le SHA correspond au build réel.
- **Historique Coolify** : l'éligibilité est vérifiée par Coolify dans son
  propre historique. Une purge de cet historique (ou une application
  recréée) peut rendre un ancien déploiement non restaurable.
- **Un seul déploiement à la fois** : comme pour tout redéploiement, un
  déploiement actif bloque la demande (`409`).
- **Pas de retour arrière de l'infrastructure** : domaines, volumes,
  bases managées et réglages Coolify restent ceux du projet actuel.

## Diagnostic

- `422` côté Coolify : le commit n'est pas reconnu comme un déploiement
  réussi. Vérifier l'historique Coolify (`GET /deployments/applications/{uuid}`)
  et le SHA stocké dans `Deployment.commitSha`.
- Audit : l'action `deployment.rollback` contient `sourceDeploymentId`,
  `sourceCommitSha`, `currentDeploymentId` et `currentCommitSha`.
- Journaux : le build de retour arrière apparaît comme un déploiement normal
  dans l'onglet « Déploiements » (journaux en direct Coolify).
