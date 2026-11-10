# EFLEX — Brief d’implémentation de la refonte de la page d’accueil

**Branche cible :** `design/homepage-refresh`  
**Branche de base :** `main`  
**Référence de conception :** `design-plans/homepage-refresh.md`  
**Statut :** validé pour implémentation

## Objectif

Moderniser la page d’accueil EFLEX afin de présenter une offre numérique crédible, claire et premium, avec une hiérarchie visuelle plus forte et une expérience mobile soignée. La refonte doit améliorer la compréhension de l’offre et la conversion sans inventer de services, de résultats, de témoignages ou de capacités techniques.

## Direction artistique approuvée

- Hero sombre, sections de contenu claires.
- Identité EFLEX : bleu marine et bleu royal, sans dérive vers l’identité Axiom.
- Typographie Inter et JetBrains Mono selon les usages déjà définis dans le dépôt.
- Composition sobre, professionnelle, éditoriale et contemporaine.
- Animations discrètes, uniquement lorsqu’elles renforcent la compréhension.
- Approche mobile-first et responsive.
- Logos de technologies originaux, non recolorés ou déformés.
- Aucun texte en dégradé ; aucun kicker/eyebrow au-dessus des titres ; aucun `transition-all`.

## Fichiers concernés

- `portail/src/app/page.tsx` — composition et sections de la page d’accueil.
- `portail/src/components/marketing/site-header.tsx` — navigation marketing.
- `portail/src/components/marketing/deploy-demo.tsx` — démonstration visuelle du parcours de déploiement.
- `portail/src/app/globals.css` — uniquement les tokens et styles globaux strictement nécessaires.

Ne pas modifier les parcours authentifiés, les pages privées, les règles métier, les API, les données ni la configuration d’infrastructure.

## Principes d’implémentation

1. Lire `AGENTS.md` et le plan de conception avant toute modification.
2. Conserver les composants et conventions existants lorsqu’ils répondent déjà au besoin.
3. Éviter les dépendances supplémentaires et les abstractions prématurées.
4. Utiliser les composants Lucide déjà installés si une icône est nécessaire.
5. Garder les contenus en français et cohérents avec les capacités réellement présentes.
6. Ne pas présenter la démonstration de déploiement comme un état live ou une preuve d’exécution réelle.
7. Respecter les deux thèmes et ne pas altérer le comportement global des routes authentifiées.
8. Assurer des états de focus visibles, des contrastes WCAG AA et des cibles tactiles d’au moins 44 px.
9. Respecter `prefers-reduced-motion`; aucune animation ne doit être nécessaire pour comprendre le contenu.
10. Préserver les logos de marques et de technologies dans leurs couleurs et proportions d’origine.

## Critères d’acceptation

- Le hero explique clairement la proposition de valeur et présente une action principale identifiable.
- La navigation est utilisable au clavier, au tactile et sur petit écran.
- Les sections s’enchaînent selon une hiérarchie cohérente, sans répétition inutile.
- Les éléments de preuve et technologies restent factuels et traçables au contenu existant.
- Les cartes, boutons et liens ont des états hover/focus/active cohérents.
- Aucun débordement horizontal aux largeurs mobiles usuelles.
- Contraste AA pour le texte courant et les contrôles dans les thèmes pris en charge.
- Les animations sont réduites ou supprimées avec `prefers-reduced-motion`.
- Aucune régression sur les routes authentifiées ni sur le thème global.
- TypeScript, lint et build du package portail passent.

## Vérifications à exécuter

Depuis le dépôt, identifier les scripts réellement déclarés dans `portail/package.json`, puis exécuter les commandes équivalentes disponibles pour :
- lint ;
- vérification TypeScript ;
- build de production.

Effectuer également une revue responsive aux largeurs 360, 390, 768, 1024 et 1440 px, un parcours clavier complet, une vérification des deux thèmes et une simulation de réduction des animations.

## Livraison

- Tous les changements sur `design/homepage-refresh`.
- Commits atomiques avec messages explicites.
- Captures avant/après aux formats desktop et mobile si l’environnement le permet.
- Pull Request vers `main`, liée aux issues créées pour cette refonte.
- Ne pas fusionner la PR sans revue et validation des contrôles.
