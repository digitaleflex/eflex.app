# Gap analysis — Issue #182 (CAT-1)

Date : 2026-11-21  
Branche : `feat/ui-182-catalog-gaps`  
Issue : [#182 — Catalogue de services unifié](https://github.com/digitaleflex/eflex.app/issues/182)

## Périmètre audité

- `portail/src/lib/managed-services-catalog.ts` — index statique des services.
- `portail/src/lib/services-hub.ts` — fusion catalogue/capacités runtime/instances actives.
- `portail/src/lib/project-coolify-services.ts` — provisioning/lifecycle/config services Coolify.
- `portail/src/lib/project-databases.ts`, `database-capabilities.ts` — bases managées et capacités.
- `portail/src/components/project-databases.tsx`, `components/services-hub/*`, `components/service-icon.tsx`.
- Routes API `api/projects/[id]/databases/*`, `api/projects/[id]/coolify-services/*`.
- Tests existants `services-hub.test.ts`, `project-coolify-services.test.ts`, `project-databases.test.ts`, `client-wording.test.ts`.

## Matrice checklist

| Checklist issue | État | Constat code actuel | Action lot |
|---|---|---|---|
| Étendre l’index pour couvrir les templates/services pertinents (dont Coolify one-click) avec métadonnées, catégories, recherche/filtres, logos cohérents | **Partiel** | Index curé (9 moteurs DB/cache + services prêts à l’emploi + candidats planifiés). Catégories/recherche/filtres/logos déjà présents. Pas d’index exhaustif des ~354 templates Coolify (risque faux positifs si type non câblé/validé). | Ajout de métadonnées factuelles (`costNote`, `connectionNote`) sur les entrées, ajout d’entrées planifiées pertinentes (Uptime Kuma, n8n) sans provisionnement câblé, renforcement de la fidélité d’état. Index exhaustif Coolify non fait : nécessite découverte/validation instance + cartographie type par type. |
| Rendre actionnables les services selon leur provider/capacité : provisioning Coolify one-click, provisioning base managée, ou provisioning EFLEX-géré | **Partiel** | Bases managées actionnables via capacités (#183). Services Coolify avec `coolifyServiceType` provisionnables si support instance confirmé/fallback catalogue. EFLEX-géré indexé mais non provisionnable (pas d’adaptateur). | Aucun faux provisionnement ajouté. Le modèle traite désormais une entrée `coolify-oneclick` **sans `coolifyServiceType`** comme `planned` (jamais « Prêt à l’emploi »). Les services câblés restent soumis à `discoverServiceTypeCapabilities()`. |
| Affichage clair des prérequis, limites, coûts/quotas, variables générées et état (disponible, non supporté sur l’instance, planifié) | **Partiel** | Prérequis/limites/état présents. Coûts/quotas et connexion à l’app peu explicites. | Ajout `costNote`/`connectionNote` au catalogue et au modèle, affichage dans le dialogue de détail (« Connexion à l’application », « Coût / quota »). États conservés/fidélisés : `active`, `creatable`, `unavailable` (instance), `eflex-managed`, `planned`. |
| Compléter les assets/icônes manquants et garantir fallback/contraste | **Fait/Partiel** | `ServiceIcon` utilise `simple-icons` + fallback initiales + teinte AA (fix récent). Quelques services sans icône simple-icons. | Ajout de mappings/fallbacks défensifs pour `uptimekuma`/`n8n`. Fallback initiales conservé. Contraste AA existant non régressé. |
| Parcours UX projet : ajout, configuration, connexion à l’app (env vars), et gestion du cycle de vie | **Partiel** | Ajout via catalogue/détail, confirmation, gestion active DB (start/stop/restart/delete), gestion service Coolify (config env/domaines/volumes). Connexion app implicite pour DB, peu explicite pour services prêts à l’emploi. | Détail service : section connexion/coût/quota. ActiveServiceManager : rappel explicite d’ajouter les variables nécessaires aux paramètres du projet puis redéployer. Pas de changement API/rôle. |

## Changements implémentés

- **Fidélité disponibilité (critique)** : `buildServicesHubModel` ne présente plus comme créable/« prêt à l’emploi » une entrée `availability: 'coolify-oneclick'` sans `coolifyServiceType`. Elle passe à `planned` avec raison explicite.
- **Catalogue** : ajout `costNote`/`connectionNote` ; métadonnées enrichies sur les entrées existantes ; `opensearch` et `kafka` corrigés en `availability: 'planned'` (données honnêtes) ; ajout d’entrées planifiées `uptime-kuma`, `n8n` (non provisionnables).
- **Modèle UI** : `UnifiedService` transporte `costNote`/`connectionNote`.
- **UI détail** : affiche connexion à l’application et coût/quota ; messages d’état clarifiés pour éviter tout faux positif.
- **UI navigateur** : retrait du filtre « Prêt à l’emploi » mort (les services câblés sont déjà dans « Provisionnable » ; les non câblés ne doivent pas être présentés comme disponibles).
- **Icônes** : fallback défensif `uptimekuma`/`n8n`.
- **UX connexion app** : note explicite dans `ActiveServiceManager`.

## Vérifications

À compléter après exécution locale :

- `pnpm --dir portail test` (tests ciblés services-hub/catalogue/wording si filtre disponible)
- `pnpm --dir portail exec tsc --noEmit --project tsconfig.json`
- `cd portail && npm run lint`

## Risques / restes

- **Index exhaustif Coolify (~354)** non réalisé volontairement : ajouter un type sans validation de contrat/sécurité/UX créerait des faux positifs. Prochaine étape sûre : alimenter le catalogue depuis la découverte `/services/types` (déjà existante) avec un mapping curé type→métadonnées, et marquer « non supporté sur cette instance » quand absent.
- **Variables générées services Coolify** : l’API expose les clés env du service (`/envs`) mais pas toujours des valeurs/liaisons automatiques vers l’app. La connexion reste guidée, pas magique.
- **EFLEX-géré** (Qdrant/MinIO dédié) : indexé mais bloqué tant qu’aucun adaptateur/provider validé n’est activé (ADR-0013 / #181).
- **Coûts** : volontairement factuels (« ressources du serveur »), pas de prix inventé.
- **Client wording** : les commentaires peuvent contenir « one-click » (strippés par le test), mais aucun texte visible client ne doit l’utiliser ; `client-wording.test.ts` couvre ce point.
