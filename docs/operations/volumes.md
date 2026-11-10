# Volumes persistants Coolify — validation et activation

> État au **10 novembre 2026**. Validation réelle effectuée sur le staging
> (`https://staging.eflex.app`, projet Coolify `Eflex Staging`, Coolify 4.7.3).
> Aucune application de production n'a été touchée et aucun volume de
> production n'a été lu, monté ou supprimé.
>
> Code concerné : `portail/src/lib/coolify.ts` (`ensureApplicationStorages`),
> `portail/src/worker.ts` (bloc `[volumes]`), `packages/renderer/src/deploy.ts`
> (`persistentVolumesForPlan`). Script de validation :
> `scripts/validate-persistent-volume.sh`.

## 1. Ce que fait la plateforme

| Étape | Détail |
| --- | --- |
| Origine des volumes | `BuildPlan.volumes` : `VOLUME /chemin` d'un Dockerfile, `volumes: []` d'un `eflex.json`, `storage` du plan Laravel. Un plan `compose` n'en produit **aucun** (le fichier du dépôt fait foi). |
| Normalisation | chemin relatif (`storage`) → `/app/<chemin>` ; chemin absolu conservé ; doublons de chemin dédupliqués ; nom normalisé (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`). |
| Création | `POST /applications/{uuid}/storages` avec `{"type":"persistent","name":"<nom>","mount_path":"<chemin>"}`. Coolify nomme le volume Docker `<uuid-application>-<nom>`. |
| Idempotence | `ensureApplicationStorages` lit `GET /applications/{uuid}/storages`, ne crée que les chemins manquants, ne modifie ni ne supprime un stockage existant. Un chemin retiré du plan laisse donc son stockage en place. |
| Activation | uniquement si `EFLEX_PERSISTENT_VOLUMES=1` (ou `true`). Sinon le journal du déploiement affiche `[volumes] … non montés` et le déploiement continue. |
| Échec | si le drapeau est actif, une erreur de lecture ou de création **fait échouer** le déploiement (pas de fausse promesse de persistance). |

## 2. Validation réelle (staging, 10 novembre 2026)

Dépôt jetable public : `digitaleflex/eflex-volume-smoke` (Node sans dépendance :
`/write` écrit `/data/eflex-volume-test.txt`, `/read` le relit, `/` répond `ok`).

### 2.1 Première passe (manuelle, API Coolify)

| Élément | Valeur |
| --- | --- |
| Projet / environnement | `Eflex Staging` (`bbzl0ggxbsr7nfznybvigzns`) / `production` (`ruqrfic62trvfazizit3ra88`) |
| Application | `volume-smoke-20261110T221339` → `atobdpogu5ewbtutcppdults` |
| Stockage | `eflex-volume-test` → `/data` (`efcjjf2tiqj6yxwalc3ofzz9`) |
| Déploiement 1 | `vfttg3v51v8twzxajrikdukc` → **failed** (voir §3.1) |
| Déploiement 2 | `lqoukgtd2do23vsiugsx7k9t` → **finished** à 22:17:22 |
| Conteneur 2 | `atobdpogu5ewbtutcppdults-20261110T221418` (`5ebd708f96e9`) |
| Écriture | 22:17:29, `GET /write` → `ecrit=2026-11-10T22:17:29.553Z`, `host=5ebd708f96e9` |
| Déploiement 3 (redéploiement) | `4q9fbmsi56b1sbdstvvzzyos` → **finished** à 22:19:02 |
| Conteneur 3 | `atobdpogu5ewbtutcppdults-20261110T221732` (`0a0b722ce1fd`) |
| Lecture après redéploiement | `ecrit=2026-11-10T22:17:29.553Z` / `host=5ebd708f96e9`, renvoyé par `host=0a0b722ce1fd` |
| Montage constaté | `docker inspect` → volume `atobdpogu5ewbtutcppdults-eflex-volume-test` monté sur `/data` (`rw`) |
| Stockages listés après 3 déploiements | **1** (idempotence confirmée) |

Le fichier relu par le **nouveau** conteneur porte le nom d'hôte de l'**ancien** :
la donnée vient bien du volume, pas de l'image.

### 2.2 Deuxième passe (script `scripts/validate-persistent-volume.sh`)

| Élément | Valeur |
| --- | --- |
| Application | `volume-smoke-20261110T222151` → `jsda4myq8qsxm2f864axp0at` |
| Stockage | `guntz8g3rtgoebo7u2qvazfe` (`eflex-volume-test` → `/data`) |
| Déploiement 1 | `eqttgr7ekxrxwnldbxndmnmb` → **finished** à 22:22:35 |
| Conteneur 1 | `…-20261110T222152` (`1fb96b69f125`) — écrit `ecrit=2026-11-10T22:22:35.685Z` |
| Déploiement 2 | `dl2vfccf3cppa7ekl6wewo8t` → **finished** à 22:23:25 |
| Conteneur 2 | `…-20261110T222236` (`dfb2610b174b`) — relit `ecrit=2026-11-10T22:22:35.685Z`, `host=1fb96b69f125` |
| Nettoyage | `DELETE /applications/{uuid}?delete_volumes=true` → application 404, conteneur et volume absents à 22:24:08 |

Le script réutilise exactement le même contrat que le worker (création du
stockage via `POST /storages`, redéploiement par `POST /deploy`), puis supprime
l'application qu'il a créée.

## 3. Constats à retenir

### 3.1 Coolify 4.7.3 exige des labels ou un mode « readonly »

Une application créée avec `is_container_label_readonly_enabled: false` **et
sans** `custom_labels` fait échouer le build :

```text
Deployment failed: Undefined variable $labels
Location: /var/www/html/app/Jobs/ApplicationDeploymentJob.php:4756
```

Cause (`ApplicationDeploymentJob::generateLabels`) : `$labels` n'est défini que
dans deux branches — `custom_labels` non vide, ou
`is_container_label_readonly_enabled = true`. Le portail envoie
`is_container_label_readonly_enabled: false` et ne fournit `custom_labels` que
si le projet a au moins un domaine (`portail/src/worker.ts`, `hosts.length > 0`).
Les projets normaux sont donc épargnés (ils ont toujours
`<slug>.<PORTAL_DOMAIN>`), mais un projet **sans domaine** échouerait au build.
Correctif de validation : `PATCH /applications/{uuid}
{"is_container_label_readonly_enabled":true}`. Côté portail, la correction
consisterait à envoyer des labels même sans hôte (ou à laisser Coolify générer
ses labels dans ce cas) — hors périmètre de ce document.

### 3.2 La suppression d'une application supprime son volume

Contrairement à ce qu'indiquait la première version de
`docs/architecture/deployment-monorepos-volumes.md`, `DELETE
/applications/{uuid}` détruit les volumes : `delete_volumes` vaut **`true` par
défaut** (`ApplicationsController::delete_by_uuid`) et
`DeleteResourceJob` appelle `Application::deleteVolumes()` →
`docker volume rm -f <nom>`, sauf si le volume est partagé avec une autre
ressource. `deleteApplication` dans le portail n'envoie aucun paramètre : un
projet supprimé depuis la console **efface donc ses données persistantes**.
C'est confirmé empiriquement (§2.1 : conteneur et volume avaient disparu après
l'appel). Conséquence : la suppression d'un projet est destructive pour ses
volumes, à traiter comme telle (sauvegarde avant suppression, §6).

### 3.3 Le drapeau doit être transmis par le fichier Compose

`docker-compose.prod.yml` et `docker-compose.staging.yml` énumèrent
explicitement les variables du portail. `EFLEX_PERSISTENT_VOLUMES` n'y figure
pas : la définir dans `.env.prod` **seule** n'a aucun effet tant que la ligne
correspondante n'est pas ajoutée au fichier Compose.

### 3.4 Nom de l'environnement staging

`COOLIFY_ENVIRONMENT=staging` mais le projet `Eflex Staging` ne contient qu'un
environnement nommé `production` (le portail retombe alors sur `environments[0]`,
voir `fetchEnvironmentName`). Fonctionnel, mais trompeur : soit renommer
l'environnement Coolify en `staging`, soit fixer
`COOLIFY_ENVIRONMENT=production` **dans le fichier de staging uniquement**.

## 4. Activation en production

La persistance est **prouvée** en staging : un fichier écrit dans `/data`
survit à un redéploiement complet (nouveau conteneur, même volume). Recommandation :
activer, avec la procédure ci-dessous.

1. **Vérifier les droits du jeton** `COOLIFY_API_TOKEN` : `read` et `write` sur
   les applications (création de stockage) — déjà nécessaires au déploiement —
   et `delete` si l'on souhaite retirer un stockage. Le staging a créé, lu et
   supprimé des stockages avec le même type de jeton.
2. **Transmettre le drapeau** dans `docker-compose.prod.yml`, service `portail`,
   à côté des variables Coolify :
   ```yaml
   - EFLEX_PERSISTENT_VOLUMES=${EFLEX_PERSISTENT_VOLUMES:-}
   ```
3. **Définir la variable** dans `.env.prod` (jamais commité) :
   ```dotenv
   EFLEX_PERSISTENT_VOLUMES=1
   ```
4. **Redémarrer le portail** (`bash deploy.sh` ou
   `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d portail`).
   Le worker reprend les jobs en attente.
5. **Valider sur un projet de test** de production, puis vérifier le journal du
   premier redéploiement d'un vrai projet : `[volumes] 1 stockage(s)
   persistant(s) créé(s) : /app/storage`. L'activation est **rétroactive** : les
   projets existants reçoivent leur stockage au redéploiement suivant.
6. **Surveiller** : `GET /applications/{uuid}/storages` doit rester stable
   (idempotence) et l'espace disque doit être suivi (§6).

Aucune migration de données n'est nécessaire : un volume créé au premier
déploiement est initialisé par Docker avec le contenu de l'image à ce
chemin (l'arborescence n'est pas masquée), puis conservé.

## 5. Rollback

Sans perte de données :

1. retirer `EFLEX_PERSISTENT_VOLUMES` de `.env.prod` (ou la passer à `0`) ;
2. redémarrer le portail ;
3. redéployer les projets concernés.

Effets : les déploiements reprennent comme avant (journal `[volumes] … non
montés`) ; les stockages déjà créés restent attachés aux applications et
continuent de fonctionner, ils ne sont simplement plus créés pour les nouveaux
chemins. Pour retirer un stockage devenu inutile, le supprimer explicitement
(`DELETE /applications/{uuid}/storages/{storage_uuid}`) puis, si le volume
Docker subsiste, `docker volume rm <uuid-application>-<nom>` — opération
destructive, à faire après sauvegarde.

En cas d'échec de déploiement attribué aux volumes (« Volumes persistants non
configurés »), retirer le drapeau et redéployer : c'est le comportement prévu.

## 6. Limites connues

- **Suppression destructive** : supprimer l'application (ou le projet depuis la
  console) supprime le volume (§3.2). Sauvegarder avant.
- **Aucune sauvegarde automatique** : le portail ne programme pas de sauvegarde
  de volume. Coolify 4.7.3 expose `PUT
  /applications/{uuid}/storages/{storage_uuid}/backups` et `POST …/backups/run`
  (cible S3/MinIO), non utilisés par le portail. Sauvegarde manuelle possible :
  ```bash
  docker run --rm -v <uuid-application>-<nom>:/data:ro -v /home/fantome/backups:/backup \
    alpine tar czf /backup/<nom>-$(date +%Y%m%d).tar.gz -C /data .
  ```
  À intégrer dans `scripts/backup-db.sh` ou une unité systemd dédiée si
  l'activation est généralisée.
- **Pas de quota** : aucune taille maximale par volume ; l'espace est celui du
  disque du VPS (`/` : 96 Go, 81 % utilisés lors de la validation). Les limites
  `limits_memory`/`limits_cpus` de Coolify ne concernent pas le disque. Prévoir
  un seuil d'alerte et `docker system prune` pour les images, jamais pour les
  volumes.
- **Pas de redimensionnement** : agrandir le volume revient à créer un nouveau
  stockage et migrer les données à la main.
- **Un stockage par chemin** : `ensureApplicationStorages` ne touche jamais un
  stockage existant ; renommer un chemin dans le plan crée un second volume et
  laisse l'ancien (et ses données) en place.
- **Propriétaire `root`** : le volume est monté en `rw` pour l'utilisateur de
  l'image ; une application non-root qui écrit dans `/data` doit pouvoir y
  accéder (sinon `EACCES`). Tester l'écriture réelle, pas seulement le montage.
- **Plans `compose` exclus** : aucun stockage Coolify n'est créé pour une
  application `dockercompose` ; les volumes sont ceux du fichier du dépôt.
- **Volume partagé** : si le même volume Docker est partagé entre ressources,
  Coolify ne le supprime pas (`isSharedWithAnotherResource`). Comportement non
  utilisé par le portail.
- **Version de Coolify** : contrat validé sur **4.7.3**. Une mise à jour doit
  être revalidée avec le script (§7) avant de conserver le drapeau.

## 7. Rejouer la validation

```bash
# staging (défaut) : crée, déploie, redéploie, vérifie puis nettoie
bash scripts/validate-persistent-volume.sh

# garder l'application pour inspection (penser au nettoyage manuel)
bash scripts/validate-persistent-volume.sh --keep

# simulation sans appel API
bash scripts/validate-persistent-volume.sh --dry-run
```

Garde-fous du script : refuse un fichier `*.env.prod`, refuse le projet Coolify
`Eflex` (production), impose un nom d'application `volume-smoke-*`, n'exécute
`docker exec` que dans le conteneur de l'application qu'il vient de créer, et
bloque explicitement `eflex-portail`, `eflex-postgres`, `eflex-redis`,
`eflex-staging-*` et `coolify*`. Le jeton n'est jamais affiché ni écrit sur
disque. Le script supprime l'application (volume compris) à la sortie, sauf
`--keep`.

## 8. Références

- `docs/architecture/deployment-monorepos-volumes.md` — monorepos, compose, volumes.
- `portail/src/lib/coolify.ts` — `ensureApplicationStorages`, `deleteApplication`.
- `portail/src/worker.ts` — bloc `[volumes]`, drapeau `EFLEX_PERSISTENT_VOLUMES`.
- `packages/renderer/src/deploy.ts` — `persistentVolumesForPlan`.
- `docs/operations/deployments.md`, `docs/operations/backups.md`.
