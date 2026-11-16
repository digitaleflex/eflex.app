# Layer 10 — Data & Persistence Layer

## Rôle

Gérer séparément les données propres à E-FLEX et les données détenues par les applications clientes.

## Deux domaines de données

### Platform Data

Utilisateurs, sessions, organisations, projets, déploiements, abonnements, tickets, paramètres, audit et configuration du portail. Cette donnée est stockée dans le PostgreSQL E-FLEX et gérée par Prisma.

### Customer Data

Bases de données managées, fichiers, médias, volumes Docker, données applicatives, files et caches des applications clientes. Ces données sont sous la responsabilité opérationnelle définie au contrat de service.

## État actuel

- PostgreSQL et Redis managés sont proposés dans le portail.
- Les volumes persistants Coolify sont traduits depuis le plan et activés derrière `EFLEX_PERSISTENT_VOLUMES`.
- La validation des volumes a été réalisée sur staging ; le drapeau reste documenté comme désactivé par défaut en production.
- L'existence d'un volume persistant ne constitue pas une sauvegarde.
- **Bases clientes (PostgreSQL)** : planification de sauvegardes, suivi, restauration assistée et alertes sont intégrés (voir [Layer 11](11-backup-recovery.md) et [client-database-backups.md](../../operations/client-database-backups.md)). La copie hors site dépend de `COOLIFY_BACKUP_S3_STORAGE_UUID` et Redis n'est pas sauvegardé.
- **Volumes/fichiers clients** : pas de stratégie de sauvegarde intégrée.

## Règles de persistance

- Chaque volume doit être rattaché à une ressource et un projet.
- Les chemins hôtes dangereux et les montages non autorisés doivent être refusés.
- Un déploiement ne doit pas supprimer les données persistantes.
- La suppression d'une application Coolify peut supprimer ses volumes par défaut : toute suppression doit être traitée comme destructive, précédée d'un contrôle/sauvegarde et d'une confirmation explicite.
- Les ressources de plateforme et les ressources clientes doivent rester isolées.

## Upload de gros fichiers

Pour les fichiers volumineux, éviter de faire transiter le contenu par l'API Next.js. Préférer un upload direct vers un stockage objet via URL temporaire signée, avec multipart, reprise et vérification d'intégrité lorsque le besoin est implémenté.

## Critères d'acceptation

- Inventaire des bases, volumes et chemins persistants par projet.
- Aucun partage accidentel de stockage entre tenants.
- Une suppression affiche clairement ses conséquences et exige confirmation.
- Les limites de taille et d'utilisation sont appliquées réellement.
- Le processus de sauvegarde couvre les données qui sont promises dans l'offre.
