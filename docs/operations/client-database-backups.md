# Sauvegardes des bases managées des clients

> Portée : les bases **PostgreSQL** créées par E-FLEX pour les projets clients
> (`ProjectDatabase`, onglet Paramètres d'un projet). La base du portail lui-même
> est traitée dans `backups.md`. Redis n'est pas sauvegardé : Coolify ne le
> permet pas, et Redis sert de cache ou de file, pas de stockage principal.

## 1. Ce qui est automatique

| Étape | Qui | Détail |
|---|---|---|
| Planification | E-FLEX | À la création de chaque base PostgreSQL, et pour les bases existantes à la première passe de surveillance (au plus 2 min après le démarrage du portail, puis toutes les 6 h). Idempotent : une planification déjà créée à la main dans Coolify est reprise, pas dupliquée. |
| Exécution | Coolify | `pg_dump` au format « custom » selon `DATABASE_BACKUP_FREQUENCY` (défaut : chaque jour à 02:00 UTC). |
| Copie hors serveur | Coolify | Seulement si `COOLIFY_BACKUP_S3_STORAGE_UUID` est renseignée (voir §2). |
| Affichage | E-FLEX | Paramètres du projet → base PostgreSQL → « Sauvegardes » : état, dernière réussite, historique, « Sauvegarder maintenant ». |
| Alerte | E-FLEX | Notification `database.backup_failed` (application et e-mail) aux propriétaires et administrateurs de l'organisation quand la dernière sauvegarde a échoué, ou qu'aucune n'a réussi depuis `DATABASE_BACKUP_MAX_AGE_HOURS` (26 h par défaut). Une alerte par base et par jour au plus. |

**Ce qui n'est pas automatique : la restauration** (Coolify n'expose pas
d'API pour la lancer). Voir §4 et §5.

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

Les bases **déjà planifiées** gardent leur réglage : pour y ajouter la copie
S3, l'activer dans Coolify (base → Backups → la planification → « Save to S3 »).

Le jeton `COOLIFY_API_TOKEN` doit avoir la permission **deploy** pour le bouton
« Sauvegarder maintenant » (`backup_now`), en plus de `read:sensitive` et
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

Une sauvegarde jamais restaurée n'est pas une garantie. Sur le serveur de la
base (ou après avoir téléchargé le fichier depuis S3) :

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
2. Choisir la sauvegarde (historique dans E-FLEX, fichiers dans Coolify ou S3)
   et la vérifier avec `verify-db-backup.sh` (§4).
3. Dans Coolify : base → **Import Backups** → téléverser le fichier, ou
   restaurer depuis S3. Coolify exécute `pg_restore` dans le conteneur de la base.
4. Redémarrer l'application, vérifier ses pages principales, prévenir le client
   en indiquant l'heure de la sauvegarde utilisée (données perdues depuis).

## 6. Limites connues

- Pas de restauration à la seconde (pas d'archivage WAL) : on perd au plus les
  données écrites depuis la dernière sauvegarde réussie.
- La restauration reste manuelle (§5).
- Supprimer une base dans E-FLEX supprime la base dans Coolify ; vérifier dans
  le stockage S3 si des copies doivent être conservées avant de supprimer.
