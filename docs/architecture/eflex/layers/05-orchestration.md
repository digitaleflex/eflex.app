# Layer 05 — Orchestration Layer

## Rôle

Coordonner les tâches de déploiement, de build, de vérification, de sauvegarde et de restauration. Cette couche décide de l'ordre des étapes et suit leur progression.

## État actuel

**En place :** BullMQ, worker portail, machine à états de déploiement, un déploiement actif par projet, annulation conditionnelle, watchdog et notifications d'état. L'issue #128 sur la fiabilité du pipeline est fermée ; les garanties doivent rester couvertes par tests.

## Machine à états de déploiement

L'état actuel du portail utilise notamment :
`queued → analyzing → provisioning → building → deploying → live | failed | cancelled`.

Toute extension de cette machine doit rester compatible avec les données historiques, les événements, l'interface et les tests.

## Responsabilités

- Vérifier l'éligibilité du job et son tenant.
- Éviter les doublons causés par un webhook répété.
- Appliquer un verrou par projet/application.
- Affecter les tâches au worker approprié.
- Persister chaque transition.
- Gérer timeout, annulation, reprises et erreurs partielles.
- Déclencher health checks et notifications.
- Conserver un lien entre Deployment, commit, artefact, runtime et incident.

## Extension à d'autres tâches

Les sauvegardes et restaurations peuvent utiliser des files ou types de jobs dédiés, mais doivent réutiliser les principes : identité de tâche, idempotence, progression, audit, timeout, résultat vérifiable.

Ne pas mélanger la machine d'état d'un déploiement avec celle d'une sauvegarde ; leurs étapes et effets destructifs sont différents.

## Travaux

- Définir les contrats de job versionnés.
- Définir les politiques de retry par opération.
- Prévoir une dead-letter/revue des jobs irrécupérables lorsque nécessaire.
- Empêcher les traitements concurrents non sûrs sur une même ressource.
- Corréler les logs et événements par requestId/jobId/deploymentId.
- Ajouter une vue opérateur pour les tâches bloquées.

## Critères d'acceptation

- Webhook dupliqué ne provoque pas de double déploiement.
- Un worker redémarré ne laisse pas une opération silencieusement bloquée.
- Les états sont monotones ou les transitions inverses sont des actions explicites (rollback, reprise).
- Chaque job possède une limite temporelle et un diagnostic.
- Les tâches destructrices nécessitent une autorisation explicite.
