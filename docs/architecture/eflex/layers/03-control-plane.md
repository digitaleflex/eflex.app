# Layer 03 — Control Plane

## Rôle

Être le cerveau administratif et transactionnel de la plateforme : identité, tenants, projets, configuration, permissions, état des opérations et accès aux systèmes externes.

## État actuel

**En place :**
- Portail Next.js App Router.
- Prisma et PostgreSQL pour les données E-FLEX.
- Better Auth et organisations.
- BullMQ/Redis pour les tâches asynchrones.
- Notifications, événements/SSE et audit.
- Client Coolify dans `portail/src/lib/coolify.ts`.
- Chiffrement AES-256-GCM des variables d'environnement.

Le Control Plane actuel est le portail et son worker, pas le Go Engine Axiom.

## Responsabilités

- Authentifier et autoriser.
- Résoudre l'organisation et le projet.
- Valider une demande utilisateur.
- Enregistrer une opération durable.
- Mettre un job en file d'attente.
- Exposer l'état et les diagnostics.
- Appeler les connecteurs internes (GitHub, Coolify, stockage, notifications).
- Auditer les actions sensibles.

## Ce qu'il ne fait pas

- Il ne compile pas directement les applications dans le processus HTTP.
- Il ne donne pas l'accès Docker au navigateur.
- Il n'expose pas les secrets Coolify au client.
- Il n'exécute pas de commandes shell arbitraires demandées par un utilisateur.

## Flux de déploiement

Le portail valide le tenant/projet → crée l'enregistrement Deployment → met un job BullMQ en file → répond sans attendre le build → le worker traite le job → l'état persiste en PostgreSQL → le portail diffuse événements et notifications.

## Évolutions

- Renforcer les frontières entre API HTTP et worker.
- Persister les étapes et diagnostics de manière corrélée.
- Définir des délais, reprises et politiques de concurrence par type de tâche.
- Maintenir les opérations idempotentes.
- Extraire des connecteurs derrière interfaces seulement quand cela réduit un couplage réel. Ne pas introduire une abstraction multi-backend uniquement pour une éventuelle migration Axiom.

## Critères d'acceptation

- Les requêtes longues retournent un identifiant de tâche et un état initial.
- Une fermeture du navigateur ne perd pas le traitement.
- Les tâches peuvent reprendre après redémarrage selon une politique sûre.
- Les erreurs sont traçables sans exposer secrets ou tokens.
- Seul le Control Plane autorisé est propriétaire de l'état métier des déploiements.
