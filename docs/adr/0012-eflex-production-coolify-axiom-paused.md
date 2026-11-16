# ADR-0012 — E-FLEX production path: portail + Coolify ; Axiom en pause

- **Status:** Accepted (proposition à ratifier dans la PR)
- **Date:** 2026-11-16
- **Issue:** À créer si l'équipe souhaite suivre l'exécution séparément.
- **Supersedes:** ADR-0011 for the current product execution strategy; ADR-0011 remains historical.

## Context

Le dépôt rassemble deux héritages techniques : le portail E-FLEX en TypeScript et le moteur Axiom en Go. Le portail actuellement utilisé en production possède son propre parcours : Next.js, Prisma/PostgreSQL, BullMQ/Redis, détecteur et renderer TypeScript, puis intégration Coolify via `portail/src/lib/coolify.ts`.

Le portail ne consomme pas l'API du moteur Axiom et n'utilise pas les Runtime Agents Go pour ses déploiements de production. Faire avancer simultanément les deux chemins augmenterait le coût de maintenance et retarderait les capacités prioritaires pour les clients existants : sauvegardes restaurables, surveillance des applications, build isolé et gestion des agences.

## Decision

1. **Le portail E-FLEX reste le Control Plane de production.** Les fonctionnalités produit sont livrées dans le portail existant.
2. **Coolify reste l'unique backend de déploiement/runtime utilisé par le portail** jusqu'à nouvelle décision documentée.
3. **Axiom (Go Engine, Agent et Orchestrator) est mis en pause.** Le code et les tests sont conservés dans le dépôt ; aucun travail produit courant ne doit dépendre de lui et il n'est pas présenté comme le moteur de production.
4. Aucun portage du détecteur/renderer, aucune migration du portail vers Axiom et aucune réécriture Go/Rust n'est engagée dans la roadmap immédiate.
5. Les appels Coolify restent concentrés dans le connecteur existant. Une abstraction `DeployBackend` n'est introduite que si un deuxième backend devient un besoin réel, financé et testé ; elle n'est pas un chantier préalable.
6. Les capacités prioritaires sont : (a) backups/restores clients et copie hors site, (b) surveillance des sites clients, (c) séparation build/runtime, (d) validation des stacks clients, (e) expérience agence et rapports, (f) limites et facturation de ressources.
7. Toute reprise d'Axiom ou tout changement de backend nécessite un nouvel ADR et des preuves de bout en bout sur VPS réel : dépôt privé GitHub, agent réel si nécessaire, réseau/DNS/TLS, persistance, rollback, sécurité, restauration et parité fonctionnelle.

## Consequences

### Positives
- Une seule voie de production à maintenir.
- Les efforts se concentrent sur les clients déjà hébergés et sur la fiabilité.
- Axiom reste disponible comme code de recherche/héritage sans imposer une seconde chaîne de livraison.
- Les décisions futures reposent sur des preuves et des coûts mesurés.

### Négatives / contraintes
- Le produit reste couplé à Coolify dans l'immédiat.
- Certaines capacités de build déporté devront contourner les limites de l'API Coolify, notamment pour Docker Compose.
- La reprise éventuelle d'Axiom exigera une requalification technique et opérationnelle, pas une simple activation de code.

## Alternatives considered

1. **Réécrire le portail en Go/Rust :** rejeté ; cela ne traite pas à lui seul les ressources CPU/RAM/disque consommées par les builds et crée un coût de migration.
2. **Maintenir portail + Axiom comme deux backends actifs :** rejeté ; double la charge pour un opérateur solo sans bénéfice utilisateur immédiat.
3. **Remplacer Coolify immédiatement par Axiom :** rejeté ; la preuve de fonctionnement réel et la parité de production ne sont pas suffisantes.
4. **Créer dès maintenant une abstraction multi-backend :** différé ; l'abstraction doit répondre à un besoin démontré, pas à une possibilité abstraite.

## Review triggers

Revoir cette décision uniquement si au moins un des éléments suivants est démontré :
- une limite Coolify bloque un besoin client prioritaire et mesuré ;
- le coût opérationnel de Coolify devient supérieur au coût total d'une alternative ;
- Axiom a passé une qualification complète de production sur des applications représentatives ;
- un client financé demande un backend ou fournisseur différent.

## Related documents

- [E-FLEX architecture reference](../architecture/eflex/README.md)
- [ADR-0011 — historical transition decision](0011-coolify-then-axiom.md)
- [Build Plane](../architecture/eflex/layers/06-build-plane.md)
- [Runtime](../architecture/eflex/layers/08-runtime-deployment.md)
- [Roadmap](../architecture/eflex/19-roadmap.md)
