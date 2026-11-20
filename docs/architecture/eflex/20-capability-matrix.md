# 20 — Matrice des capacités et niveau de maturité

Cette matrice empêche de confondre présence de code, capacité activée, preuve de staging et disponibilité réelle pour les clients.

| Domaine | État documenté | Détail / prochaine preuve |
|---|---|---|
| Portail / authentification | En place | Next.js, Better Auth, sessions |
| Organisations / rôles | En place | Modèle organisationnel actuel ; vue portefeuille à étendre |
| Support | En place, à structurer | Tickets user/admin présents ; quota/temps d'intervention absent |
| Détecteur / renderer | En place | Tests et limites décrits dans leurs READMEs ; qualification de dépôts clients à poursuivre |
| File et machine de déploiement | En place | BullMQ, worker et états ; maintenir les tests de reprise/idempotence |
| Coolify runtime | En place | Backend du portail via `lib/coolify.ts` |
| GitHub / webhooks | En place, vérifier parcours | Vérifier les scénarios dépôts privés et push réels |
| Déploiement multi-services | Partiel | Compose fourni pris en charge ; diagnostics prescriptifs ; plans multi-services générés sans Compose refusés |
| Volumes persistants | Partiel / flag | Testé sur staging ; `EFLEX_PERSISTENT_VOLUMES` documenté OFF par défaut prod |
| Bases clientes | En place / partiel | Provisionnement multi-moteurs (selon instance) ; sauvegarde/restauration intégrée via Coolify/adaptateur générique pour PostgreSQL, MySQL, MariaDB, MongoDB quand les capacités de l’instance le permettent (UI, statut copie hors serveur par exécution quand disponible, preuve de restauration consignée, alertes). Redis/magasins en mémoire sans parcours intégré (dégradation explicite). Copie hors site et restaurabilité à vérifier par moteur. |
| Backup PostgreSQL du portail | Partiel | Scripts avec statuts distincts local/hors site/restauration testée (`backup.status`, `restore-test.status`), hook hors site (`EFLEX_BACKUP_OFFSITE_CMD`) et contrôle optionnel dans `healthcheck.sh` ; copie hors site effective et exécution régulière/archivage des tests de restauration restent à configurer/assurer |
| Backup bases clientes (moteurs supportés) | Partiel | Planification/exécution/suivi et restauration assistée intégrés avec preuves consignées ; copie S3 effective et tests réguliers de restauration en environnement isolé restent opérationnels à assurer et valider par moteur/instance (voir `docs/operations/client-database-backups.md`) |
| Backup fichiers / volumes clients et Redis durable | Partiel / à construire | Politique/inventaire et garde-fous exposés (UI/docs) sans fausse promesse ; pas de sauvegarde/restauration automatisée EFLEX intégrée. Mécanismes à mettre en œuvre et tester selon l’infrastructure (volumes/exports, persistance Redis dédiée). |
| Monitoring plateforme | En place / partiel | Healthcheck et statut plateforme |
| Monitoring continu des sites clients | À construire / à compléter | Probes et incidents par projet |
| Logs runtime et métriques app | Partiel | Coolify et disponibilité API/configuration |
| Analytics audience | En place | Agrégats privacy-first : pages vues, visiteurs uniques quotidiens (somme sur période), dimensions opt-in (référent, appareil/navigateur/OS, pays local, UTM) et événements nommés ; sans sessions/durée/rebond ni déduplication inter-jours (voir `docs/operations/analytics.md`) |
| Build Plane dédié | À construire | Pas de serveur/registre dédié intégré dans le chemin actuel du portail |
| Registry immuable | À construire dans le pipeline E-FLEX | Réutiliser un registre existant |
| Quotas CPU/RAM | À construire / partiel | Issue #131 |
| Usage billing | En cours de cadrage | Issue #143 ouverte |
| Rapport mensuel par site | À construire | Sources : monitoring, déploiements, backups, incidents |
| Client entity / marque blanche | À construire | Modèle et facturation à décider |
| Multi-cloud / multi-region | Différé | Pas de besoin validé pour la V1 |
| Axiom Go en production | Gelé / non utilisé par le portail | Voir ADR-0012 |

## États normalisés

- **En place** : intégré et utilisé dans le parcours courant.
- **Partiel** : composant présent, mais couverture ou activation limitée.
- **À construire** : absence de parcours complet prouvé.
- **Différé / gelé** : décision explicite de ne pas travailler dessus maintenant.

## Mise à jour

Toute issue qui livre une capacité modifie cette matrice avec une preuve : test, staging, activation production, runbook ou mesure. Une fonctionnalité ne passe pas à « en place » sur la seule base d'un composant détecteur ou d'une maquette UI.
