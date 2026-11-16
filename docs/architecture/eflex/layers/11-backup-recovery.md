# Layer 11 — Backup & Recovery

## Rôle

Protéger la capacité de récupérer les données E-FLEX et les données des clients après erreur humaine, défaillance logicielle, perte de volume ou perte de serveur.

## État actuel — ne pas confondre deux périmètres

### Sauvegarde du portail E-FLEX

Le dépôt contient `scripts/backup-db.sh`, `scripts/restore-test.sh` et `scripts/healthcheck.sh`, documentés dans [docs/operations/backups.md](../../operations/backups.md). Ils concernent principalement le PostgreSQL du portail. Les archives sont actuellement décrites comme stockées sur le même disque de production ; une copie hors site reste nécessaire. Le test de restauration local existe.

### Sauvegarde des données clientes

La sauvegarde/restauration des bases managées et des volumes clients n'est pas un parcours E-FLEX complet intégré. L'issue existante **[#130 — OPS-3](https://github.com/digitaleflex/eflex.app/issues/130)** couvre ce chantier. Ne pas annoncer de sauvegardes clientes garanties tant que la destination, le chiffrement, la rétention et la restauration n'ont pas été testés.

Coolify propose des sauvegardes planifiées pour plusieurs moteurs relationnels/documentaires vers des destinations distantes ; Redis et les fichiers/volumes demandent des stratégies adaptées. Vérifier la compatibilité avec la version installée et compléter les lacunes.

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

Identifier la ressource → produire un dump/snapshot cohérent → chiffrer → envoyer hors site → vérifier l'intégrité → enregistrer le résultat → appliquer la rétention → alerter en cas d'échec.

## Flux de restauration

Sélectionner la sauvegarde → vérifier sa compatibilité/intégrité → restaurer en environnement isolé → valider les données et l'application → obtenir l'approbation opérateur/client → restaurer en production → contrôler le service → consigner le résultat.

Une tâche réussie ou un fichier présent ne constitue pas une preuve de restauration.

## Priorités

1. Vérifier et externaliser la sauvegarde du PostgreSQL du portail.
2. Couvrir les bases clientes via #130.
3. Définir une stratégie pour les volumes/fichiers.
4. Ajouter la restauration isolée et les preuves de tests.
5. Protéger les suppressions de projets/volumes par garde-fous.

## Critères d'acceptation

- Copies hors site indépendantes du serveur source.
- Aucun secret de sauvegarde dans les logs.
- Tests de restauration documentés et réguliers.
- Le rapport distingue « sauvegarde réussie » et « restauration testée ».
- Une panne ou un échec produit une alerte exploitable.
- Les RPO/RTO publiés sont cohérents avec la fréquence et les tests mesurés.
