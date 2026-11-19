# Sauvegardes des bases managées des clients

> Portée : les bases **PostgreSQL** créées par E-FLEX pour les projets clients
> (`ProjectDatabase`, onglet Paramètres d'un projet). La base du portail lui-même
> est traitée dans `backups.md`. Seules les bases PostgreSQL bénéficient du
> parcours de sauvegarde/restauration intégré décrit ici ; les autres moteurs
> managés (Redis, MySQL, MariaDB, MongoDB, ClickHouse, Dragonfly, KeyDB,
> SQLite…) ne sont pas couverts par ce mécanisme et doivent être traités selon
> leurs garanties et outils propres.

## 1. Ce qui est automatique

| Étape | Qui | Détail |
|---|---|---|
| Planification | E-FLEX | À la création de chaque base PostgreSQL, et pour les bases existantes à la première passe de surveillance (au plus 2 min après le démarrage du portail, puis toutes les 6 h). Idempotent : une planification déjà créée à la main dans Coolify est reprise, pas dupliquée. |
| Exécution | Coolify | `pg_dump` au format « custom » selon `DATABASE_BACKUP_FREQUENCY` (défaut : chaque jour à 02:00 UTC). |
| Copie hors serveur | Coolify | Seulement si `COOLIFY_BACKUP_S3_STORAGE_UUID` est renseignée (voir §2). |
| Affichage | E-FLEX | Paramètres du projet → base PostgreSQL → « Sauvegardes » : état, dernière réussite, historique, « Sauvegarder maintenant », statut de copie hors serveur (S3 actif sur la planification ou non) et preuve de la dernière restauration consignée. |
| Restauration | E-FLEX + Coolify | Historique → « Restaurer » sur une sauvegarde réussie, confirmation en saisissant RESTAURER (propriétaires et administrateurs). Coolify (`POST /databases/{uuid}/imports`, version ≥ 4.7) restaure depuis le fichier resté sur le serveur, sinon depuis la copie S3, et remplace les objets existants. Suivi en direct dans le panneau ; l’issue (en cours / réussite / échec) est consignée côté E-FLEX comme preuve exploitable ; action inscrite au journal d'audit. |
| Alerte | E-FLEX | Notification `database.backup_failed` (application et e-mail) aux propriétaires et administrateurs de l'organisation quand la dernière sauvegarde a échoué, ou qu'aucune n'a réussi depuis `DATABASE_BACKUP_MAX_AGE_HOURS` (26 h par défaut). Une alerte par base et par jour au plus. |

Une sauvegarde n'est restaurable depuis E-FLEX que si son fichier existe encore :
sur le serveur (rétention locale) ou dans le stockage S3 configuré. Coolify refuse
de restaurer le fichier d'une autre base. Une restauration lancée depuis E-FLEX
et terminée est **consignée** dans le portail (preuve de restauration), mais
**cela ne remplace pas le test régulier de restauration en environnement isolé**
(§4), qui reste une opération à réaliser et à archiver.

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
