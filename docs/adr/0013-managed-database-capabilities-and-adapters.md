# ADR-0013 — Capacités et adaptateurs pour les bases managées (Coolify / EFLEX)

- **Status:** Proposed
- **Date:** 2026-11-19
- **Supersedes:** — (complète ADR-0011/0012 sur le périmètre bases managées)
- **Related:** [ADR-0011](0011-coolify-then-axiom.md), [ADR-0012](0012-eflex-production-coolify-axiom-paused.md), [Layer 11 — Backup & Recovery](../architecture/eflex/layers/11-backup-recovery.md), [Client database backups](../operations/client-database-backups.md)

## Context

Le portail E-FLEX provisionne des bases managées via Coolify (actuellement PostgreSQL et Redis, puis exposition des moteurs connus de l’API Coolify : MySQL, MariaDB, MongoDB, ClickHouse, Dragonfly, KeyDB, SQLite). Les capacités réelles varient selon la version/configuration de l’instance Coolify et selon le moteur (provisionnement, cycle de vie, sauvegarde, restauration, copie hors site, format d’URL).

Coolify peut être en retard sur un moteur ou une capacité (ex. sauvegarde/restauration non équivalente, moteur/version non disponible). Le portail doit rester fiable, ne pas promettre de fonctions non supportées, et pouvoir évoluer moteur par moteur sans réintroduire un second système d’orchestration lourd.

## Decision

1. **Pas de nouvel orchestrateur séparé.** Les opérations de bases managées s’appuient sur l’orchestration existante du portail (API, worker BullMQ, machine à états/déploiements quand nécessaire). La variabilité est traitée par des **capacités et des adaptateurs**, pas par un service d’orchestration additionnel.
2. **Détection de capacités runtime.** Le portail détecte les capacités de l’instance (ex. `GET /version`, sondages légers non destructifs comme `GET /databases`) avec mise en cache courte et dégradation explicite si l’instance est injoignable. Les décisions ne reposent pas uniquement sur un numéro de version.
3. **Registre de capacités par moteur.** Une source de vérité (`database-capabilities`) définit, par moteur, les métadonnées (libellé, variable d’environnement) et les capacités effectives : provisionnement, cycle de vie, sauvegarde intégrée, restauration intégrée, provider, raison/notes. L’API et l’UI exposent ces capacités ; les opérations refusent explicitement ce qui n’est pas supporté.
4. **Adaptateurs/providers derrière un contrat stable.** Les opérations DB passent par un provider/adaptateur (`database-provider`) sélectionné selon les capacités :
   - **Provider Coolify (défaut)** : utilise les APIs Coolify lorsque le moteur/capacité est supporté.
   - **Provider EFLEX-géré (prévu, activable par capacité)** : lorsque Coolify est en retard ou insuffisant, EFLEX peut opérer la ressource sous son contrôle (image/version choisie, volume, réseau isolé, secrets, sauvegarde/restauration outillée) derrière le même contrat. Ce choix implique une responsabilité opérationnelle EFLEX (sécurité, mises à jour, supervision, runbooks de restauration).
5. **Sauvegardes/restaurations par moteur.** Le support intégré est déclaré par capacité. PostgreSQL reste le parcours intégré actuel (Coolify : planification/exécutions/S3 optionnel/restauration assistée/preuve). Les autres moteurs ne doivent pas hériter implicitement de ce parcours : extensions par adaptateurs/outils natifs et validation de restauration réelle avant toute promesse.
6. **Visibilité opérateur.** Les capacités runtime et le support par moteur sont exposés aux administrateurs (API/UI admin) et, côté projet, sous forme d’informations de disponibilité/limites.
7. **Gouvernance.** Toute activation d’un provider EFLEX-géré en production, ou toute extension majeure de support moteur (notamment backup/restore), doit être validée par tests (instance réelle, restauration), documentation opérationnelle et mise à jour de cet ADR/ADR associé si la politique change.

## Consequences

### Positives
- Comportement explicite et sûr face aux différences de versions/instances/moteurs.
- Évolutivité moteur par moteur (Coolify d’abord, EFLEX-géré ciblé si nécessaire) sans orchestrateur additionnel.
- Meilleure visibilité admin/projet sur ce qui est réellement supporté.

### Négatives / contraintes
- Le support « exposé » ne vaut pas « pleinement garanti » sans validation par moteur/instance (ex. SQLite, backups non-PostgreSQL).
- Un provider EFLEX-géré augmente la charge opérationnelle et de sécurité.
- Les sondages/caches de capacités doivent rester non destructifs, bornés et cohérents avec les erreurs réelles des opérations.

## Alternatives considered

1. **Liste statique unique sans détection** : simple mais incorrect selon versions/instances et source d’erreurs opaques. Rejeté.
2. **Orchestrateur/service DB dédié** : puissance accrue mais complexité et duplication face au portail/worker existants. Différé/rejeté pour le besoin actuel.
3. **N’implémenter que PostgreSQL/Redis** : sûr mais limite l’usage des moteurs déjà disponibles côté Coolify. Rejeté au profit d’une exposition gouvernée par capacités.
