# Foundation — Security & Governance

## Principe

La sécurité n'est pas une couche optionnelle : elle traverse toutes les couches. Toute nouvelle opération doit être authentifiée, autorisée, limitée et auditée selon son risque.

## État actuel

Le portail utilise Better Auth, organisations et rôles, MFA/passkeys selon les options activées, rate limiting, audit et chiffrement AES-256-GCM des secrets de projet. Plusieurs contrôles d'isolation et tests cross-tenant existent. Consulter le threat model et les tests présents avant de considérer une surface comme couverte.

## Contrôles obligatoires

### Identité et autorisation
- Authentification et sessions sécurisées.
- RBAC au niveau organisation/projet.
- Vérification côté serveur sur chaque route.
- Isolation tenant testée, sans fuite d'existence.

### Secrets
- Chiffrement au repos et séparation des clés.
- Saisie write-only.
- Masquage dans logs, erreurs, exports et événements.
- Rotation des jetons GitHub, Coolify, stockage et webhooks.
- Pas de secrets dans les BuildPlans, Dockerfiles ou images.

### Build
- Le dépôt client est non fiable.
- Analyse sans exécution.
- Workspace isolé.
- Environnement minimal transmis au processus de build.
- Pas de secrets de production transmis au build par défaut.
- Limites CPU/RAM/disque/durée.
- Pas d'accès libre au socket Docker de production.

### Runtime et réseau
- Opérations typées et bornées.
- Pas de shell arbitraire exposé au client.
- Ports publics minimaux.
- Bases non publiques par défaut.
- TLS vérifié.

### Audit
Auditer les opérations sensibles : déploiement, annulation, suppression, restauration, modification de secrets, changement de domaine, modification des droits, intervention opérateur et facturation.

## Actions destructrices

Une suppression d'application ou de base peut détruire les volumes et données. Le système doit :
1. identifier les données affectées ;
2. vérifier la politique de sauvegarde ;
3. demander confirmation explicite ;
4. enregistrer l'acteur et le résultat ;
5. empêcher la suppression silencieuse si la protection attendue n'est pas démontrée.

## Critères d'acceptation

- Tests cross-tenant couvrent toutes les nouvelles routes.
- Aucun secret dans les artefacts ou logs.
- Builds isolés des systèmes sensibles.
- Actions destructrices explicitement confirmées et auditées.
- Threat model et runbooks actualisés pour chaque nouvelle frontière.
