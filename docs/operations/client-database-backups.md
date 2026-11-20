# Sauvegardes des bases managées des clients

> Portée : bases managées des projets clients (`ProjectDatabase`, Paramètres du projet).
> La base du portail lui-même est traitée dans `backups.md`.
>
> **Parcours intégré EFLEX (Coolify, adaptateur générique par moteur) :** PostgreSQL, MySQL,
> MariaDB et MongoDB, **selon les capacités réelles de l’instance Coolify et les outils natifs du
> moteur**. Le support effectif (planification, exécutions, restauration/import, copie S3) doit être
> **vérifié sur l’instance** ; la restaurabilité doit être **prouvée par des tests réguliers**.
>
> **Non couverts par un parcours intégré EFLEX :** Redis, Dragonfly, KeyDB, ClickHouse, SQLite
> (et tout moteur sans adaptateur/capacité). Ils doivent être traités selon leurs garanties et
> outils propres (voir §6 et l’UI, qui affiche une dégradation explicite sans fausse promesse).

## 1. Ce qui est automatique (moteurs supportés)

| Étape | Qui | Détail |
|---|---|---|
| Planification | E-FLEX | À la création d’une base supportée, et pour les bases existantes à la passe de surveillance (au plus 2 min après démarrage, puis toutes les 6 h). Idempotent : reprend une planification Coolify existante. |
| Exécution | Coolify | Sauvegarde planifiée selon `DATABASE_BACKUP_FREQUENCY` (défaut : chaque jour à 02:00 UTC), avec l’outil natif du moteur (ex. dump). |
| Copie hors serveur | Coolify | Seulement si `COOLIFY_BACKUP_S3_STORAGE_UUID` est renseignée (voir §2). L’UI distingue la configuration/planning S3 et, par exécution réussie, la copie hors serveur confirmée quand l’information est disponible. |
| Affichage | E-FLEX | Paramètres → base → « Sauvegardes et restauration » : état, dernière sauvegarde réussie, historique (résultat, copie, taille), actions, statut de copie hors serveur, et **preuve de restauration consignée**. |
| Restauration | E-FLEX + Coolify | Historique → « Restaurer » sur une sauvegarde réussie (confirmation RESTAURER, rôles autorisés). Coolify restaure depuis le fichier serveur ou la copie S3 si disponible. Suivi en direct ; issue consignée (preuve). Action auditée. |
| Alerte | E-FLEX | Notification `database.backup_failed` (app/e-mail) aux propriétaires et administrateurs en cas d’échec ou d’absence de réussite depuis `DATABASE_BACKUP_MAX_AGE_HOURS`. Une alerte par base et par jour au plus. |

**Distinction importante :**
- **Sauvegarde réussie** = une exécution de sauvegarde a abouti.
- **Copie hors serveur** = la planification/exécution a une copie S3 effective (dépend de la config Coolify/S3 ; à vérifier).
- **Restauration consignée** = une restauration a été effectuée et son issue enregistrée dans le portail (preuve exploitable), mais cela **ne remplace pas** un **test régulier de restauration en environnement isolé** (§4).

Une sauvegarde n'est restaurable depuis E-FLEX que si son fichier existe encore (serveur ou S3 configuré).
Coolify refuse de restaurer le fichier d'une autre base.

## 2. Configurer la copie hors serveur (à faire une fois)

Sans cette étape, les sauvegardes restent **sur le même serveur que la base** :
une panne de disque emporte la base et ses sauvegardes. L'interface l'indique.

1. Créer un compartiment chez un fournisseur compatible S3 (Backblaze B2,
   Cloudflare R2, Hetzner Object Storage, Scaleway…), avec une clé d'accès
   limitée à ce compartiment.
2. Dans Coolify : **Storages → S3 Storages → Add**, renseigner point d'accès,
   région, compartiment et clés, puis **Validate Connection**.
3. Copier l'UUID du stockage (visible dans l'URL de sa page) dans `.env.prod` :
   `COOLIFY_BACKUP_S3_STORAGE_UUID=…`
4. Redéployer le portail (`bash scripts/deploy-prod.sh`).

Une fois le stockage configuré, E-FLEX tente d’**appliquer automatiquement** la
copie S3 aux planifications des bases supportées (accès/assurances et passe de
surveillance). Vérifiez dans le portail et dans Coolify que la planification est
bien à jour ; en cas d’échec, activez « Save to S3 » dans Coolify.

Le jeton `COOLIFY_API_TOKEN` doit avoir la permission **deploy** pour « Sauvegarder
maintenant » et « Restaurer », en plus de `read:sensitive` et `delete`.

## 3. Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `COOLIFY_BACKUP_S3_STORAGE_UUID` | vide | Stockage S3 Coolify pour la copie hors serveur |
| `DATABASE_BACKUP_FREQUENCY` | `0 2 * * *` | Cron (5 champs) ou `hourly`/`daily`/`weekly`/`monthly`/`yearly`. Toute autre valeur revient au défaut. |
| `DATABASE_BACKUP_RETENTION_LOCAL` | `3` | Sauvegardes gardées sur le serveur (1 à 90) |
| `DATABASE_BACKUP_RETENTION_S3` | `14` | Sauvegardes gardées dans S3 (1 à 365) |
| `DATABASE_BACKUP_MAX_AGE_HOURS` | `26` | Âge maximal de la dernière réussite avant alerte |

Ces réglages s'appliquent aux **nouvelles** planifications.

## 4. Vérifier qu'une sauvegarde se restaure (régulièrement)

Une sauvegarde jamais restaurée n'est pas une garantie. Le portail consigne les
restaurations assistées (preuve), mais la **vérification de restaurabilité**
recommandée reste un **test hors production** (base jetable, réseau isolé si
possible), à réaliser **régulièrement** (au moins mensuel) et à **archiver**
(date, base/moteur, version, fichier/copie testée, résultat).

Pour PostgreSQL, `scripts/verify-db-backup.sh` restaure un dump dans un conteneur
jetable sans réseau :

```bash
bash scripts/verify-db-backup.sh /chemin/vers/sauvegarde.dmp 16
```

Pour MySQL/MariaDB/MongoDB (ou tout moteur), utilisez les outils natifs
correspondants dans un environnement jetable de même version majeure. Ne restaurez
jamais un test dans la base de production.

**Preuve de restauration régulière :** conservez une trace exploitable (journal,
ticket, note d’exploitation, ou statut versionné hors secrets) distinguant « sauvegarde
réussie », « copie hors site vérifiée » et « restauration testée ». Une restauration
assistée en production consignée est une preuve ponctuelle, pas un substitut au test isolé.

## 5. Restaurer en cas d'incident

1. **Ne rien supprimer.** Arrêter l'application cliente si elle écrit des données incohérentes.
2. Lancer « Sauvegarder maintenant » si possible : l'état actuel, même abîmé, reste récupérable.
3. Dans l'historique, choisir la sauvegarde et cliquer sur « Restaurer » (saisir RESTAURER).
   En cas de doute, vérifier d’abord le fichier dans un environnement isolé (§4). La base doit être démarrée.
4. Redémarrer l'application, vérifier ses pages principales, prévenir le client
   en indiquant l'heure de la sauvegarde utilisée (données perdues depuis).

Si E-FLEX est indisponible : utiliser Coolify (Import Backups) selon le moteur.

## 6. Moteurs sans parcours intégré et stratégie Redis/volumes

- **Redis / Dragonfly / KeyDB :** aucune sauvegarde/restauration intégrée EFLEX (Coolify ne
  sauvegarde pas Redis). Traiter comme cache/file éphémère par défaut. Si des données durables
  sont stockées, activer la persistance du moteur (AOF/RDB, etc.), définir une stratégie de
  sauvegarde dédiée (snapshots/fichiers de persistance, réplication) et **tester la restauration**.
  EFLEX n’offre aucune garantie de restauration automatique dans ce cas.
- **ClickHouse / SQLite / autres :** pas de parcours intégré ; utiliser les outils natifs
  (BACKUP/RESTORE, snapshots, export/copie du fichier SQLite, etc.) et tester la restauration.
- **Volumes et fichiers clients :** pas de sauvegarde automatisée EFLEX. Inventorier les volumes
  persistants, définir une politique (fréquence, destination hors site, rétention, chiffrement,
  RPO/RTO) et automatiser/valider les copies et restaurations. Voir `docs/operations/volumes.md`
  et [Layer 11](../architecture/eflex/layers/11-backup-recovery.md).

## 7. Limites connues

- Pas de restauration à la seconde (pas d’archivage WAL/PITR) pour le parcours intégré : perte
  possible des données écrites depuis la dernière sauvegarde réussie.
- La restauration assistée vise la base elle-même (pas de restauration « à côté » dans l’UI).
- Copie hors serveur effective seulement avec S3 correctement configuré et vérifié.
- Support multi-moteurs dépendant de Coolify et des outils natifs : la capacité affichée reflète
  le registre/adaptateur, mais la restaurabilité doit être validée par moteur/instance.
- Supprimer une base/projet peut impacter la ressource et ses sauvegardes côté hébergement :
  vérifier la rétention/conservation externe avant suppression.

## 2. Configurer la copie hors serveur (à faire une fois)

Sans cette étape, les sauvegardes restent **sur le même serveur que la base** :
une panne de disque emporte la base et ses sauvegardes. L'interface l'indique
(« copies sur le serveur de la base uniquement »).

1. Créer un compartiment chez un fournisseur compatible S3 (Backblaze B2,
   Cloudflare R2, Hetzner Object Storage, Scaleway…), avec une clé d'accès
   limitée à ce compartiment.
2. Dans Coolify : **Storages → S3 Storages → Add**, renseigner point d'accès,
   région, compartiment et clés, puis **Validate Connection**.
3. Copier l'UUID du stockage (visible dans l'URL de sa page) dans `.env.prod` :
   `COOLIFY_BACKUP_S3_STORAGE_UUID=…`
4. Redéployer le portail (`bash scripts/deploy-prod.sh`).

Une fois le stockage configuré, E-FLEX tente d’**appliquer automatiquement** la
copie S3 aux planifications PostgreSQL existantes (lors des accès/assurances de
planification et à chaque passe de surveillance). Vérifiez dans le portail
(statut « copie hors serveur ») ou dans Coolify que la planification est bien à
jour ; en cas d’échec d’application automatique, activez « Save to S3 » dans
Coolify (base → Backups → la planification).

Le jeton `COOLIFY_API_TOKEN` doit avoir la permission **deploy** pour les boutons
« Sauvegarder maintenant » (`backup_now`) et « Restaurer » (`imports`), en plus de `read:sensitive` et
`delete` déjà requises par les bases managées.

## 3. Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `COOLIFY_BACKUP_S3_STORAGE_UUID` | vide | Stockage S3 Coolify pour la copie hors serveur |
| `DATABASE_BACKUP_FREQUENCY` | `0 2 * * *` | Cron (5 champs) ou `hourly`/`daily`/`weekly`/`monthly`/`yearly`. Toute autre valeur revient au défaut. |
| `DATABASE_BACKUP_RETENTION_LOCAL` | `3` | Sauvegardes gardées sur le serveur (1 à 90) |
| `DATABASE_BACKUP_RETENTION_S3` | `14` | Sauvegardes gardées dans S3 (1 à 365) |
| `DATABASE_BACKUP_MAX_AGE_HOURS` | `26` | Âge maximal de la dernière réussite avant alerte |

Ces réglages s'appliquent aux **nouvelles** planifications.

## 4. Vérifier qu'une sauvegarde se restaure (au moins une fois par mois)

Une sauvegarde jamais restaurée n'est pas une garantie. Le portail consigne les
restaurations effectuées via l'assistant (preuve), mais la **vérification de
restaurabilité** recommandée reste un test hors production (base jetable). Sur
le serveur de la base (ou après avoir téléchargé le fichier depuis S3) :

```bash
ls -t /data/coolify/backups/databases/*/*/ | head      # trouver le fichier le plus récent
bash scripts/verify-db-backup.sh /data/coolify/backups/databases/<équipe>/<base>/<fichier>.dmp 16
```

Le script démarre un PostgreSQL **jetable et sans réseau**, y restaure le
fichier, compte les tables et les lignes, puis supprime le conteneur. Il ne
touche jamais la base de production. Code de sortie 0 = restaurable. Indiquer
la même version majeure que la base d'origine (16 par défaut).

Vérifié le 2026-11-16 sur une copie de la base de test du portail
(34 tables restaurées, fichier « custom » et fichier SQL texte) ; un fichier
corrompu est bien refusé (code 1).

## 5. Restaurer en cas d'incident

1. **Ne rien supprimer.** Arrêter l'application cliente si elle écrit des
   données incohérentes (Paramètres → Disponibilité → Arrêter).
2. Lancer « Sauvegarder maintenant » : l'état actuel, même abîmé, reste récupérable.
3. Dans l'historique, choisir la sauvegarde et cliquer sur « Restaurer »
   (saisir RESTAURER). En cas de doute sur le fichier, le vérifier d'abord avec
   `verify-db-backup.sh` (§4). La base doit être démarrée.
4. Redémarrer l'application, vérifier ses pages principales, prévenir le client
   en indiquant l'heure de la sauvegarde utilisée (données perdues depuis).

Si E-FLEX est indisponible : dans Coolify, base → **Import Backups**.

## 6. Limites connues

- Pas de restauration à la seconde (pas d'archivage WAL) : on perd au plus les
  données écrites depuis la dernière sauvegarde réussie.
- La restauration vise la base elle-même : il n'y a pas encore de restauration
  dans une base de test à côté de la production.
- Supprimer une base dans E-FLEX supprime la base dans Coolify ; vérifier dans
  le stockage S3 si des copies doivent être conservées avant de supprimer.
