# Layer 11 — Backup & Recovery

## Rôle

Protéger la capacité de récupérer les données E-FLEX et les données des clients après erreur humaine, défaillance logicielle, perte de volume ou perte de serveur.

## État actuel — ne pas confondre deux périmètres

### Sauvegarde du portail E-FLEX

Le dépôt contient `scripts/backup-db.sh`, `scripts/restore-test.sh` et `scripts/healthcheck.sh`, documentés dans [docs/operations/backups.md](../../operations/backups.md). Ils concernent principalement le PostgreSQL du portail.

- `backup.status` distingue **sauvegarde locale réussie** (horodatage/fichier) et **copie hors site** (`skipped`/`ok`/`error`, horodatage) ; un succès global n’est consigné que si la copie requise a réussi (ou n’est pas configurée). En cas d’échec de copie hors site, la preuve locale est conservée et le script échoue (alerte/action requise).
- `restore-test.status` consigne une **preuve de restauration testée en environnement isolé** (horodatage, fichier, compteurs).
- `healthcheck.sh` peut vérifier la fraîcheur/présence de ces preuves (`EFLEX_BACKUP_HEALTHCHECK`, seuils) pour rendre l’absence de preuve actionnable.
- Copie hors site effective (`EFLEX_BACKUP_OFFSITE_CMD`) et exécution régulière des tests de restauration restent **à configurer/assurer** opérationnellement.

### Sauvegarde des données clientes

**Bases managées supportées** (`ProjectDatabase`, parcours intégré Coolify/adaptateur générique) : PostgreSQL, MySQL, MariaDB et MongoDB **selon les capacités réelles de l’instance Coolify et les outils natifs du moteur**. Fonctionnalités (quand supportées) : planification/rattrapage idempotent, UI de suivi (état, dernière sauvegarde réussie, historique avec résultat et statut de copie hors serveur par exécution quand disponible), sauvegarde manuelle, restauration assistée avec suivi, **preuve de restauration consignée** (tentative/réussite), alertes `database.backup_failed`. Détail : [client-database-backups.md](../../operations/client-database-backups.md).

**Dégradation explicite (sans fausse promesse)** : Redis/Dragonfly/KeyDB/ClickHouse/SQLite et moteurs sans adaptateur/capacité n’ont pas de parcours intégré EFLEX ; l’UI expose la stratégie/limites réelles (Redis traité comme cache/file, pas de dump Coolify). Volumes/fichiers clients n’ont pas de sauvegarde automatisée intégrée ; une politique/inventaire opérationnel et des garde-fous de suppression sont documentés/exposés, sans mécanisme de restauration garanti.

Limites actuelles à ne pas masquer :
- **Copie hors site** : optionnelle, uniquement si `COOLIFY_BACKUP_S3_STORAGE_UUID` est configuré et effectif côté Coolify/S3 ; doit être vérifiée.
- **Redis / magasins en mémoire** : pas de sauvegarde/restauration intégrée ; données durables éventuelles hors garantie EFLEX sans stratégie dédiée testée.
- **Volumes/fichiers clients** : pas de sauvegarde/restauration automatisée intégrée ; procédure/politique à mettre en œuvre et tester.
- **Preuve de restauration régulière** : les restaurations assistées sont consignées, mais le **test régulier en environnement isolé** (ex. mensuel, archivé) reste indispensable.
- **RPO** : pas d'archivage WAL/PITR ; perte possible des données écrites depuis la dernière sauvegarde réussie.
- **Multi-moteurs** : le support dépend de l’instance Coolify/outillage ; la restaurabilité doit être validée par moteur.

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

1. Vérifier et externaliser la sauvegarde du PostgreSQL du portail (copie hors site effective, contrôle des preuves, tests de restauration réguliers archivés) ; vérifier les clés et la procédure de reconstruction.
2. Généraliser la copie hors site vérifiée et la preuve de restauration régulière en environnement isolé pour les bases clientes supportées.
3. Mettre en œuvre des mécanismes de sauvegarde/restauration pour volumes/fichiers (et données Redis durables si concernées) là où l’infrastructure le permet ; sinon maintenir une stratégie opérationnelle explicite, testée et traçable.
4. Renforcer les garde-fous de suppression de projets/volumes/bases (vérifications, confirmations, procédures de sauvegarde préalable).

## Critères d'acceptation

- Copies hors site indépendantes du serveur source pour les données promises.
- Aucun secret de sauvegarde dans les logs.
- Tests de restauration documentés et réguliers.
- Le rapport distingue « sauvegarde réussie » et « restauration testée ».
- Une panne ou un échec produit une alerte exploitable.
- Les RPO/RTO publiés sont cohérents avec la fréquence et les tests mesurés.
