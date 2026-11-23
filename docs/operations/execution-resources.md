# Ressources d’exécution par application (CPU, mémoire, disque) — incrément #131

> Portée : **portail EFLEX** (affichage, API de facturation/utilisation, documentation).
> État : incrément de clarification au 2026-11-15. **Aucune limite d’exécution n’est appliquée par le portail** et aucun changement d’infrastructure n’est effectué par cet incrément.

## Objectif

Rendre explicites, de manière factuelle, les limites de ressources d’exécution par plan/profil, ce qui est réellement connu/configuré, et le comportement attendu en cas de dépassement — sans prétendre à une application réelle des limites si l’hébergement ne les impose pas.

## État actuel (réellement supporté / connu)

- **Plans et quotas facturés** : les plans (`Découverte`, `Starter`, `Pro`, `Agence`) définissent des quotas organisationnels (applications, membres, domaines). Source : `portail/src/lib/plans.ts`, `portail/src/lib/billing.ts`.
- **Profil d’exécution** : tous les plans partagent actuellement le **même profil d’hébergement**. Source de vérité : `portail/src/lib/execution-resources.ts` (`executionResourcesForPlan`, exposé via `billingSummary().executionResources`).
- **Limites CPU/mémoire/disque par application** : **aucune limite dédiée n’est imposée par le plan dans la plateforme**. Le portail ne configure pas de quotas CPU/mémoire/disque différenciés par plan lors du déploiement.
- **Mesures observées** : la page Utilisation (`/dashboard/usage`) affiche des échantillons **instantanés** de CPU et de mémoire quand l’hébergement (Coolify) les expose, ainsi que les compteurs/quota connus en base. Stockage et bande passante ne sont pas mesurés (aucune source documentée) ; aucune valeur n’est affichée sans source.
- **Statut d’application** : `perPlanExecutionEnforced` / `enforcement` indiquent qu’aucune application de limites par plan n’est en place (`not_enforced`).

## Comportement en cas de dépassement des ressources (factuel)

Le comportement dépend des capacités et de la configuration de l’hébergement (Coolify/serveur/moteur de conteneurs), pas d’une règle de plan appliquée par le portail :

- **CPU** : en cas de contention sur l’hôte, le temps processeur peut être partagé ou réduit (ralentissements possibles). Aucun plafond CPU garanti par plan n’est défini dans la plateforme.
- **Mémoire** : si un conteneur dépasse la mémoire disponible qui lui est allouée par l’hôte ou le moteur, il peut être arrêté (**OOM kill**) puis redémarré selon la politique de redémarrage. Aucun seuil mémoire garanti par plan n’est défini dans la plateforme.
- **Disque** : en cas de saturation du stockage de l’hôte ou des volumes, les écritures peuvent échouer et l’application peut se dégrader. Aucun quota disque par application n’est imposé par plan dans la plateforme.

Ces comportements sont décrits comme des possibilités dépendantes de l’infrastructure ; ils ne constituent pas un engagement mesuré ou appliqué par le portail.

## Où l’information est exposée

- **UI** : page `/dashboard/usage` (section « Ressources d’exécution », sources/unités, mesures instantanées) et carte Abonnement de `/dashboard/organization` (rappel du profil d’exécution).
- **API** : `GET /api/billing/summary` inclut `executionResources` et `perPlanExecutionEnforced` (dérivés du plan effectif).
- **Code** : `portail/src/lib/execution-resources.ts` (profil factuel), `portail/src/lib/billing.ts` (`billingSummary`), `portail/src/components/dashboard/usage-view.tsx`, `portail/src/components/organization/billing-card.tsx`.

## Ce qui reste pour clore #131

1. **Application réelle des limites** côté hébergement (Coolify/infra) : configurer et faire respecter CPU/mémoire/disque par application au niveau du runtime/conteneur.
2. **Profils différenciés par plan** : définir des quotas/limites par plan (valeurs, unités, périmètre) et les appliquer réellement, puis refléter l’état `configured`/mesuré.
3. **Mesure et quota** : instrumenter stockage/bande passante et, si pertinent, consommation cumulée ; n’afficher que des valeurs sourcées.
4. **Cohérence facturation ↔ infra** : s’assurer que ce qui est vendu/annoncé correspond aux limites effectivement appliquées et observables.
5. **Validation en environnement réel** : vérifier le comportement au dépassement (throttling/OOM/disque plein) sur l’infrastructure cible et documenter les résultats observés.

Tant que ces points ne sont pas réalisés, le portail doit continuer à présenter les ressources d’exécution comme **non imposées par le plan** et à décrire les dépassements comme dépendants de l’hébergement.

## Mise à jour du 23/11 — plafonds par plan (incrément #131)

Quand un client saisit une limite CPU/mémoire dans la configuration applicative, E-FLEX la **refuse** au-delà du plafond de son plan
(`PLAN_RESOURCE_CAPS`, `lib/app-config-validation.ts`) :

| Plan | Mémoire max | CPU max |
|---|---|---|
| Découverte | 512 Mo | 0,5 |
| Starter | 1 024 Mo | 1 |
| Pro | 2 048 Mo | 2 |
| Agence | 4 096 Mo | 4 |

`APP_LIMIT_MAX_MEMORY_MB` et `APP_LIMIT_MAX_CPUS`, s'ils sont définis, restent un plafond global qui l'emporte quand il est plus bas.

**Ce que cela ne fait pas** : une application qui n'a *aucune* limite configurée reste sans limite côté Coolify (valeur par défaut). Le plafond
borne ce que le client peut saisir ; il n'applique pas de limite à sa place. Appliquer le plafond du plan par défaut au déploiement demande une
validation sur un vrai Coolify (effets sur les builds, redémarrages OOM) et n'est pas fait ici. Le statut `perPlanExecutionEnforced` reste donc `false`.
