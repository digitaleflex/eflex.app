# Layer 11 — Backup & Recovery

## Rôle

Protéger la capacité de récupérer les données E-FLEX et les données des clients après erreur humaine, défaillance logicielle, perte de volume ou perte de serveur.

## État actuel — ne pas confondre deux périmètres

### Sauvegarde du portail E-FLEX

Le dépôt contient `scripts/backup-db.sh`, `scripts/restore-test.sh` et `scripts/healthcheck.sh`, documentés dans [docs/operations/backups.md](../../operations/backups.md). Ils concernent principalement le PostgreSQL du portail. Les scripts produisent des statuts/preuves locaux (`backup.status`, `restore-test.status`) et supportent un hook de copie hors site (`EFLEX_BACKUP_OFFSITE_CMD`) ; la copie hors site effective et la vérification régulière restent à configurer/assurer. Le test de restauration local existe.

### Sauvegarde des données clientes

**Bases PostgreSQL managées** (`ProjectDatabase`) : un parcours intégré existe (planification automatique via Coolify à la création et rattrapage idempotent, UI de suivi avec statut de copie hors serveur sur la planification, sauvegarde manuelle, restauration assistée via `POST /databases/{uuid}/imports` avec suivi, **preuve de restauration consignée** dans le portail — dernière tentative et dernière réussite —, alertes `database.backup_failed`, script de vérification hors production `scripts/verify-db-backup.sh`). Détail opérationnel : [client-database-backups.md](../../operations/client-database-backups.md).

Limites actuelles à ne pas masquer :
- **Copie hors site** : optionnelle, uniquement si `COOLIFY_BACKUP_S3_STORAGE_UUID` est configuré ; E-FLEX tente d’appliquer la copie S3 aux planifications existantes, mais l’effectivité dépend de Coolify/du stockage et doit être vérifiée (sinon les copies restent sur le serveur de la base).
- **Redis** : non sauvegardé (Coolify ne le permet pas ; Redis est traité comme cache/file).
- **Volumes/fichiers clients** : pas de stratégie ni de parcours intégré.
- **Preuve de restauration** : les restaurations assistées sont consignées, mais le **test régulier de restauration en environnement isolé** (ex. mensuel) reste une opération manuelle à réaliser et archiver.
- **RPO** : pas d'archivage WAL ; perte possible des données écrites depuis la dernière sauvegarde réussie.

Ne pas annoncer de sauvegardes clientes garanties au-delà de ce périmètre et sans copie hors site/test de restauration effectif.

## Architecture cible

- Scheduler : crée les jobs selon la politique du projet.
- Backup Adapter : utilise un mécanisme adapté au moteur.
- Snapshot / Dump : produit un artefact cohérent.
- Encryption : protège l'archive et les clés.
- Off-site Storage : stocke hors du serveur source.
- Integrity Check : valide présence, taille, checksum et lecture.
- Restore Runner : restaure dans un environnement isolé.
- Recovery Report : garde le résultat et les horodatages.

## Politiques par ressource

Chaque base, volume ou service doit avoir une politique explicite :
- fréquence ;
- rétention ;
- destination ;
- chiffrement ;
- RPO visé ;
- procédure de restauration ;
- dernier backup réussi ;
- dernier restore test réussi.

## Flux de sauvegarde

Identifier la ressource → produire un dump/snapshot cohérent → (chiffrer/copier hors site si configuré) → vérifier l'intégrité → enregistrer le résultat → appliquer la rétention → alerter en cas d'échec.

## Flux de restauration

Sélectionner la sauvegarde → vérifier sa compatibilité/intégrité → restaurer (assisté en production via Coolify, ou en environnement isolé pour vérification) → valider les données et l'application → obtenir l'approbation opérateur/client si nécessaire → contrôler le service → consigner le résultat.

Une tâche réussie ou un fichier présent ne constitue pas une preuve de restauration.

## Priorités

1. Vérifier et externaliser la sauvegarde du PostgreSQL du portail.
2. Généraliser la copie hors site et la preuve de restauration régulière pour les bases clientes PostgreSQL.
3. Définir une stratégie pour Redis (données durables le cas échéant) et les volumes/fichiers.
4. Protéger les suppressions de projets/volumes/bases par garde-fous et sauvegarde préalable.

## Critères d'acceptation

- Copies hors site indépendantes du serveur source pour les données promises.
- Aucun secret de sauvegarde dans les logs.
- Tests de restauration documentés et réguliers.
- Le rapport distingue « sauvegarde réussie » et « restauration testée ».
- Une panne ou un échec produit une alerte exploitable.
- Les RPO/RTO publiés sont cohérents avec la fréquence et les tests mesurés.
