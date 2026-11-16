# Layer 08 — Runtime & Deployment Layer

## Rôle

Exécuter les applications clientes, orchestrer leurs conteneurs/services et appliquer les changements de version.

## État actuel

**En place :** Coolify est le moteur de déploiement utilisé par le portail via `portail/src/lib/coolify.ts`. Le produit pilote applications Dockerfile/Nixpacks/Compose, domaines, variables chiffrées, logs et certaines opérations runtime.

## Frontière

E-FLEX détient le contexte produit : organisation, projet, commit, plan, permissions et historique.
Coolify détient l'exécution technique actuelle : création/paramétrage des ressources, build lorsque le chemin le demande, conteneurs, runtime et opérations exposées par son API.

Ne pas exposer les identifiants Coolify aux développeurs.

## Modèle de déploiement réel

- Un BuildPlan généré simple correspond à un service applicatif.
- Un Compose fourni par le dépôt peut décrire plusieurs services.
- Les plans multi-services générés sans Compose fourni sont actuellement refusés par le worker.
- Les volumes persistants générés par le plan sont conditionnés par `EFLEX_PERSISTENT_VOLUMES`, désactivé par défaut en production selon les documents opérationnels.
- Les opérations de runtime doivent rester limitées aux actions autorisées.

## Rollback

Le rollback applicatif doit restaurer une version d'application admissible et vérifiée. Il ne restaure pas automatiquement :
- les données de base ;
- les volumes ;
- les variables d'environnement historiques ;
- une ancienne version d'un Compose relu depuis la branche.

Un rollback de code et une restauration des données sont deux opérations distinctes. Les migrations de base doivent être compatibles avec le retour arrière ou disposer d'une procédure dédiée.

## Travaux

- Construire des contrats et tests pour le runtime actuel.
- Préserver l'ancienne version saine jusqu'au health check de la nouvelle.
- Relier image, commit, configuration et résultat.
- Documenter les comportements destructifs de suppression.
- N'envisager un autre backend qu'avec une preuve de parité et un ADR.

## Critères d'acceptation

- Une version LIVE passe un contrôle de santé.
- Un échec ne détruit pas silencieusement la version précédente.
- Les actions runtime sont autorisées par tenant/projet et auditées.
- Les effets sur les volumes et les données sont explicités avant suppression.
