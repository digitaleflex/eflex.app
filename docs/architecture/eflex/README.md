# E-FLEX App — Référentiel d'architecture

> **Référentiel courant : EAOA v1.0**  
> Produit : E-FLEX App · Dépôt : `digitaleflex/eflex.app`  
> Statut : architecture de référence proposée pour guider les travaux ; les capacités restent qualifiées par leur état réel.

## 1. Pourquoi ce dossier existe

Ce dossier est le point d'entrée unique pour comprendre l'architecture E-FLEX App, son ordre de réalisation et les responsabilités de chaque composant. Il complète les documents opérationnels existants ; il ne les remplace pas.

**Règle de lecture :** distinguer systématiquement :
- **En place** : visible dans le dépôt et/ou déjà utilisé par le portail en production.
- **Partiel / limité** : fonctionnalité existante, mais avec des limites documentées ou une activation conditionnelle.
- **À construire** : aucun parcours complet vérifié dans le produit actuel.
- **Différé** : volontairement hors du périmètre de réalisation immédiat.

Ne pas transformer une détection de framework, un test unitaire ou un écran existant en promesse de support production sans validation de bout en bout.

## 2. Décisions structurantes

1. Le portail Next.js est le Control Plane actuellement utilisé en production.
2. Coolify reste l'unique moteur de déploiement/runtime utilisé par le portail.
3. `packages/detector` et `packages/renderer` sont les composants actuels d'analyse et de préparation du déploiement.
4. BullMQ/Redis orchestre les tâches longues de déploiement ; l'interface ne construit pas les applications.
5. Le build doit être progressivement isolé du runtime de production, sans réécrire le portail.
6. Les sauvegardes clients, la restauration et la surveillance des applications doivent être démontrées avant toute promesse de service critique.
7. Axiom (Go) est conservé dans le dépôt mais mis en pause ; il n'est pas le backend de production actuel. Voir [ADR-0012](../../adr/0012-eflex-production-coolify-axiom-paused.md).

## 3. Ordre de lecture

| Ordre | Document | Objectif |
|---:|---|---|
| 00 | [Vision et périmètre](00-product-and-scope.md) | Ce que le produit vend et à qui |
| 01 | [Contexte système](01-system-context.md) | Les acteurs et les systèmes |
| 02–14 | [Couches 01 à 13](layers/) | Responsabilités de chaque couche |
| 15–16 | [Fondations transversales](foundations/) | Sécurité et ressources |
| 17 | [Topologie d'infrastructure](17-infrastructure-topology.md) | Où les composants s'exécutent |
| 18 | [Flux de bout en bout](18-critical-flows.md) | Comment les couches collaborent |
| 19 | [Roadmap ordonnée](19-roadmap.md) | Dans quel ordre développer |
| 20 | [Matrice des capacités](20-capability-matrix.md) | Ce qui existe réellement et ce qui manque |

## 4. Catalogue des couches

| N° | Couche | Document |
|---:|---|---|
| 01 | Experience Layer | [experience.md](layers/01-experience.md) |
| 02 | Tenant & Organization Layer | [tenant-organization.md](layers/02-tenant-organization.md) |
| 03 | Control Plane | [control-plane.md](layers/03-control-plane.md) |
| 04 | Source & Intelligence | [source-intelligence.md](layers/04-source-intelligence.md) |
| 05 | Orchestration | [orchestration.md](layers/05-orchestration.md) |
| 06 | Build Plane | [build-plane.md](layers/06-build-plane.md) |
| 07 | Artifact & Registry | [artifact-registry.md](layers/07-artifact-registry.md) |
| 08 | Runtime & Deployment | [runtime-deployment.md](layers/08-runtime-deployment.md) |
| 09 | Network | [network.md](layers/09-network.md) |
| 10 | Data & Persistence | [data-persistence.md](layers/10-data-persistence.md) |
| 11 | Backup & Recovery | [backup-recovery.md](layers/11-backup-recovery.md) |
| 12 | Observability & Analytics | [observability.md](layers/12-observability.md) |
| 13 | Operations & Business | [operations-business.md](layers/13-operations-business.md) |

Fondations : [Security & Governance](foundations/security-governance.md) · [Resource Management](foundations/resource-management.md).

## 5. Sources de vérité existantes

Les documents ci-dessous conservent les détails propres aux fonctionnalités :
- [README du dépôt](../../../README.md) : démarrage et vue d'ensemble du code.
- [AGENTS.md](../../../AGENTS.md) : consignes de contribution et commandes.
- [ADR index](../../adr/README.md) : décisions d'architecture.
- [Pipeline de déploiement](../../operations/deployments.md).
- [Volumes persistants](../../operations/volumes.md).
- [Sauvegardes de la base du portail](../../operations/backups.md).
- [Mesure d'audience](../../operations/analytics.md).
- [Monorepos et Compose](../deployment-monorepos-volumes.md).
- [Détecteur](../../../packages/detector/README.md).
- [Production runbook](../../../PROD.md).

En cas de divergence, l'état observé dans le code et les tests actuels prévaut sur une vision cible. Toute décision qui modifie une frontière, un moteur, une donnée persistée ou une frontière de sécurité doit être consignée dans un ADR.

## 6. Règle de contribution documentaire

Chaque issue d'architecture doit indiquer :
1. la couche propriétaire ;
2. l'état initial réel ;
3. les dépendances ;
4. les changements code / infra / documentation ;
5. les tests et preuves attendus ;
6. les risques de sécurité, de données et d'exploitation ;
7. les critères de sortie.

Une fonctionnalité n'est « terminée » qu'après validation des critères d'acceptation et mise à jour de la matrice des capacités.
