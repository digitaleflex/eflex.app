# Layer 01 — Experience Layer

## Rôle

Fournir une interface simple aux développeurs, agences, clients finaux et opérateurs E-FLEX. La complexité opérationnelle doit être accessible sans être imposée à chaque utilisateur.

## État actuel

**En place :** portail Next.js, authentification, organisations, projets, déploiements, logs, événements temps réel, notifications, paramètres, support utilisateur et page d'administration du support.

**Partiel :** le parcours principal de déploiement existe ; la vue portefeuille « tous mes clients » et le rapport mensuel personnalisable par site ne constituent pas encore le parcours agence complet.

## Surfaces fonctionnelles

1. Developer Dashboard : projets, déploiements, état, logs, métriques et actions.
2. Agency Workspace : portefeuille des clients finaux et leurs projets.
3. Client View : consultation en lecture seule des rapports et de l'état.
4. Support Center : création et suivi des demandes.
5. Operator Console : incidents, interventions et opérations administratives.

## Flux

L'utilisateur agit dans le portail → l'API vérifie session, organisation et permissions → l'opération est enregistrée → l'orchestrateur la traite → l'interface reçoit l'état via événements/notifications → l'utilisateur voit le résultat.

Les actions longues ne doivent jamais dépendre du maintien d'une page ouverte.

## À construire

- Une vue transversale des clients et projets d'un développeur/agence.
- Un résumé par application : état, dernier déploiement, disponibilité observée, dernière sauvegarde réellement réussie et dernier test de restauration.
- Des rapports par site exportables et partageables.
- Les vues client final en lecture seule, avec périmètre explicite.
- Des états d'erreur actionnables et des liens vers les logs/tickets.

## Critères d'acceptation

- Un développeur retrouve tous ses projets sans changer manuellement d'organisation.
- Un client final ne voit que les ressources auxquelles il a été invité.
- Chaque état affiché provient d'une donnée réelle et horodatée.
- Les fonctions non livrées sont clairement indiquées et ne sont pas présentées comme actives.
