# Audit UX/UI des autres pages EFLEX

**Périmètre audité :** inspection statique du code source sur `main` (App Router portail).  
**Date :** 2026-11-10  
**Nature :** audit structurel et UX du code ; aucun test navigateur, capture réelle ou mesure de contraste automatisée n'a été exécuté. Les propositions ci-dessous sont donc des pistes priorisées à confirmer pendant l'implémentation.

## Synthèse exécutive

Le portail possède déjà une base UI cohérente : composants partagés, tokens globaux, thèmes clair/sombre, navigation clavier, libellés français, vues responsive sur plusieurs écrans et composants dédiés. Le meilleur retour sur investissement n'est pas une réécriture générale, mais une harmonisation par parcours.

**Priorités recommandées :**
1. **P0 — Authentification et onboarding :** uniformiser connexion, inscription et récupération de compte ; clarifier les étapes et les retours d'état.
2. **P1 — Shell du dashboard :** renforcer la navigation sur mobile et la hiérarchie entre organisation, recherche, notifications et compte.
3. **P1 — Vue projets et détail projet :** améliorer la lecture de l'état opérationnel, des actions prioritaires et des déploiements.
4. **P2 — Écrans secondaires :** rendre activité, notifications, équipe et paramètres plus cohérents et plus faciles à parcourir.
5. **P2 — Administration et statut :** clarifier les données, filtres, états vides et informations de diagnostic.
6. **P3 — États système :** harmoniser les pages 404, erreur, maintenance et vérification d'e-mail.

## Constats et propositions par zone

### 1. Authentification — `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`

**Constats source :**
- Connexion et inscription partagent une structure proche mais dupliquent header, logo, carte et bouton Google.
- Les formulaires ont des libellés explicites, autocomplete, erreurs annoncées via `role=alert` et états de chargement.
- Le parcours d'inscription interroge la configuration d'e-mail après création pour décider de la suite.
- Les pages de récupération et de réinitialisation utilisent des états successifs distincts.

**Propositions :**
- Extraire un layout d'authentification commun (logo, largeur, titre, carte, liens secondaires) sans abstraire les logiques métier.
- Ajouter une progression visuelle simple uniquement pour l'inscription si elle comporte réellement plusieurs étapes.
- Clarifier le retour après inscription : compte créé, vérification requise ou accès direct.
- Uniformiser les états d'erreur, succès, chargement et indisponibilité du fournisseur Google.
- Vérifier la gestion du focus après erreur et après changement d'état.

**À ne pas faire :** ajouter des étapes de profilage ou des champs non nécessaires à la création du compte.

### 2. Shell du dashboard — `dashboard-shell.tsx`

**Constats source :**
- Barre supérieure compacte avec marque, sélecteur d'organisation, palette de commandes, notifications et compte.
- Navigation horizontale défilante, identique sur mobile et desktop.
- Les cinq entrées principales sont visibles en permanence, mais les sous-pages profondes reposent sur la navigation contextuelle.

**Propositions :**
- Conserver la barre desktop, mais étudier une navigation mobile plus explicite (menu compact ou barre inférieure limitée aux destinations majeures) plutôt que compter uniquement sur le scroll horizontal.
- Rendre l'état actif et la destination courante encore plus évidents.
- Vérifier les zones tactiles, le focus, le débordement et l'ordre de tabulation avec le sélecteur d'organisation et les menus.
- Ajouter un fil d'Ariane sur les vues profondes (projet, paramètres) si les tests montrent une perte de repères.

### 3. Dashboard projets — `/dashboard`, `projects-explorer.tsx`, `overview.tsx`

**Constats source :**
- La page expose une salutation contextualisée, des indicateurs, une liste filtrable/recherchable et un flux d'activité.
- L'explorateur offre grille/liste, recherche, filtres par statut et tri.
- Les barres de déploiement disposent d'un équivalent textuel pour les lecteurs d'écran.

**Propositions :**
- Revoir l'état « aucun projet » comme un vrai onboarding : explication brève, prérequis et CTA unique vers la création.
- Donner la priorité aux projets nécessitant une action, puis aux projets en ligne.
- Afficher une action de création clairement identifiable et cohérente avec les permissions.
- Améliorer la lisibilité des filtres sur mobile ; éviter que trop de commandes se disputent la première ligne.
- Ajouter une aide contextuelle minimale sur les métriques et la période de calcul.

### 4. Détail projet et paramètres projet — `/dashboard/projects/[id]`

**Constats source :**
- Trois onglets : vue d'ensemble, déploiements, variables.
- La page rassemble statut, détection, historique, journaux et actions de redéploiement.
- Les valeurs des variables d'environnement ne sont pas envoyées à l'interface des paramètres ; seuls les noms et dates sont sélectionnés côté serveur.

**Propositions :**
- Créer une hiérarchie plus nette : statut et domaine en tête, action primaire selon l'état, puis informations techniques.
- Présenter les journaux dans un panneau lisible avec recherche/copie et états de chargement/absence, si les composants existants le permettent.
- Mieux expliquer les avertissements de détection et la confiance, sans transformer un score en garantie.
- Conserver les protections existantes et ne jamais afficher les valeurs secrètes.
- Vérifier les onglets sur mobile et l'accès clavier.

### 5. Activité, notifications, équipe, paramètres

**Constats source :**
- Activité propose filtres de statut et pagination.
- Notifications est délégué à un composant dédié.
- Équipe et paramètres utilisent également des composants dédiés.
- Les pages sont séparées, avec titres de page et métadonnées pour certaines.

**Propositions :**
- Standardiser les en-têtes de page (titre, description, action principale) et les états vides.
- Activité : renforcer la distinction entre statut, projet, branche, commit et date ; rendre les filtres persistants et lisibles.
- Notifications : distinguer non lues/lues, grouper par date et rendre l'action « tout marquer comme lu » évidente si disponible.
- Équipe : clarifier rôles, invitations en attente, membres actifs et permissions ; différencier les actions destructives.
- Paramètres : organiser les réglages en sections courtes, avec confirmation et feedback explicites pour les opérations sensibles.

### 6. Administration — `/admin`, `/admin/users`, `/admin/audit`

**Constats source :**
- Vue d'ensemble sous forme de cartes KPI.
- Liste utilisateurs avec recherche, pagination et adaptation mobile en liste.
- Journal d'audit en liste chronologique.
- Les pages utilisent des fonctions de contrôle d'accès serveur dans les écrans de gestion.

**Propositions :**
- Ajouter une navigation admin dédiée et des filtres structurés si le périmètre d'administration s'élargit.
- Clarifier la période de chaque KPI et les dénominateurs des taux.
- Journal : filtres par action, acteur, cible et période ; affichage structuré des détails sans exposer de données sensibles.
- Utilisateurs : distinguer clairement rôle, vérification e-mail, suspension et actions disponibles.
- Ne pas introduire de graphiques sans décisions opérationnelles qu'ils permettent de prendre.

### 7. Statut, 404, erreurs et maintenance

**Constats source :**
- `/status` affiche composants, latence, disponibilité calculée et incidents.
- `not-found.tsx` et `error.tsx` proposent des sorties utiles vers l'accueil ou le statut.
- Une page maintenance existe dans l'arborescence ; les pages global-error et verify-email doivent aussi être incluses dans la passe d'harmonisation.

**Propositions :**
- Clarifier dans la page statut la différence entre état instantané et disponibilité historique.
- Ajouter un rafraîchissement explicite ou un horodatage bien visible ; ne pas promettre une disponibilité temps réel si la collecte est différée.
- Harmoniser visuellement les états 404, erreur globale, maintenance et vérification.
- Conserver un langage calme, une action de récupération principale et une référence d'incident si disponible.

## Direction visuelle transversale

- Garder l'identité EFLEX navy + bleu royal, Inter + JetBrains Mono et les tokens actuels.
- Préserver le thème clair/sombre de la console ; ne pas modifier le mécanisme global de thème.
- Standardiser les espacements, les en-têtes de page, les cartes, les badges d'état et les empty states.
- Utiliser les animations uniquement pour expliquer une transition, jamais pour retarder l'accès à l'information.
- Conserver le français, les focus visibles, les cibles tactiles ≥ 44 px et le respect de `prefers-reduced-motion`.
- Réutiliser les composants existants avant d'en créer de nouveaux.

## Limites et prochaines vérifications

Cet audit est basé sur la lecture du code source, pas sur un audit visuel en navigateur. Avant de figer les maquettes, effectuer une revue des routes réelles à 360, 390, 768, 1024 et 1440 px, dans les deux thèmes, avec clavier et lecteur d'écran. Vérifier aussi les états chargement, vide, erreur, succès et permissions pour chaque parcours.

## Ordre d'exécution conseillé

Traiter les parcours dans cet ordre : Authentification → Shell dashboard → Dashboard/projets → Détail projet → Activité/notifications/équipe/paramètres → Administration → Statut et états système. Ne pas lancer une refonte simultanée de toutes les routes : chaque lot doit être validé avant le suivant.
