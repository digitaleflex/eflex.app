# Layer 02 — Tenant & Organization Layer

## Rôle

Définir la propriété des ressources et garantir l'isolation entre agences, développeurs, clients finaux et projets.

## État actuel

**En place :** Better Auth, organisations, membres, rôles, organisation personnelle, changement d'organisation, contrôles d'accès aux projets et administration.

**Limite :** le modèle actuel rattache les projets à une organisation. Il n'existe pas encore de modèle métier complet `Client` enfant d'une organisation avec facturation consolidée agence. L'abonnement est actuellement rattaché à l'organisation.

## Modèle logique cible

```text
Organization (agence / développeur)
  ├── Members & Roles
  ├── Clients (clients finaux)
  │    └── Projects
  │         ├── Environments
  │         └── Resources
  └── Subscription / Billing
```

## Stratégie de transition

Pour le démarrage, réutiliser les organisations existantes comme frontières d'isolation lorsque cela correspond au modèle actuel : une organisation peut représenter un client final distinct auquel le développeur est invité. Ajouter une vue d'agrégation des organisations accessibles.

Ne pas créer un modèle `Client` avant d'avoir défini les règles de propriété, transfert, visibilité, facturation et migration. Une migration future devra préserver les identifiants et l'isolation existants.

## Règles d'autorisation

- Chaque lecture/écriture vérifie l'organisation active.
- Toute ressource enfant est vérifiée par son appartenance au tenant ; ne jamais se fier uniquement à un ID fourni par le navigateur.
- Les clients finaux sont en lecture seule par défaut.
- Seuls les rôles autorisés peuvent déployer, supprimer, modifier des secrets ou restaurer.
- Les actions opérateur sont auditées et séparées des actions client.
- Les réponses inter-tenant doivent éviter de révéler l'existence d'une ressource.

## Travaux à prévoir

1. Cartographier les modèles Prisma et routes existants.
2. Définir le modèle transitoire multi-organisations.
3. Définir plus tard l'entité Client (si l'agrégation seule ne suffit plus).
4. Concevoir la facturation au niveau agence sans casser les abonnements actuels.
5. Étendre les tests d'isolation à toutes les nouvelles ressources : sauvegardes, incidents, analytics, rapports et interventions.

## Critères d'acceptation

- Aucun test cross-tenant ne retourne une ressource d'un autre tenant.
- Les permissions sont testées côté serveur pour chaque route sensible.
- Les membres en lecture seule ne peuvent pas contourner les restrictions par API.
- Les transferts/suppressions ont des conséquences documentées et auditées.
