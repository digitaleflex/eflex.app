# Plan UX/UI — Parcours d’authentification EFLEX

> Issue : [#46 — Harmoniser les parcours d’authentification et d’inscription](https://github.com/digitaleflex/eflex.app/issues/46)
> Branche de travail : `design/homepage-refresh`
> Périmètre : portail Next.js — routes publiques d’authentification.
> Nature du document : plan de conception et de réalisation. Aucun comportement métier ne doit être modifié sans validation.

## 1. Objectif

Donner aux cinq parcours une grammaire visuelle commune, lisible et rassurante, tout en conservant strictement les contrats fonctionnels de Better Auth.

Routes concernées :

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/verify-email`

Le travail doit réduire les répétitions d’interface, rendre les états explicites et améliorer l’usage mobile et clavier. Il ne doit ajouter aucun champ ni étape métier.

## 2. État constaté dans le code

- Les cinq pages possèdent leur propre enveloppe de page et répètent le header avec le logo EFLEX.
- Connexion et inscription répètent la carte, le bouton Google, le séparateur et une partie de la présentation.
- Les composants partagés `Input`, `Button` et `Card` existent déjà.
- `Input` fournit label, hint, erreur, `aria-invalid` et `aria-describedby`.
- `Button` fournit tailles, états disabled et loading avec `aria-busy`.
- Les pages utilisent déjà des alertes d’erreur et des messages de statut sur certains parcours.
- L’inscription consulte `/api/auth/config` pour déterminer si la vérification e-mail est requise ; si oui, elle redirige vers `/verify-email`.
- La connexion conserve la destination `next` via `nextFromLocation()` et `withNext()`.
- Les pages de réinitialisation et de vérification utilisent `Suspense` autour des composants qui lisent les paramètres de l’URL.
- Les tokens de thème et les styles de focus visibles existent dans `globals.css`.

## 3. Direction visuelle proposée

### Principes

1. **Une même structure** : enveloppe d’authentification réutilisable avec logo, contenu centré et zone de navigation secondaire.
2. **Une hiérarchie nette** : titre court, phrase d’explication utile, formulaire, action principale, puis lien secondaire.
3. **Une carte sobre** : fond de surface, bordure discrète, rayon cohérent avec les composants existants et ombre légère.
4. **Une identité EFLEX** : navy et bleu royal, sans introduire une nouvelle palette ni un dégradé décoratif.
5. **Une densité maîtrisée** : largeur de lecture limitée, espaces réguliers, aucune illustration qui repousse le formulaire sous la ligne de flottaison sur mobile.
6. **Des états explicites** : erreur, confirmation, chargement et indisponibilité doivent être visuellement et sémantiquement distincts.

### Structure commune

- En-tête compact avec logo cliquable vers l’accueil.
- Zone principale centrée, largeur maximale adaptée au formulaire.
- Titre et description contextuelle.
- Carte contenant le contenu spécifique de la route.
- Liens de navigation en dehors de la carte lorsque cela clarifie la hiérarchie.
- Fond neutre issu des tokens existants ; pas de fond visuel lourd.

### Comportement responsive

- Mobile : formulaire pleine largeur avec marges latérales confortables ; aucun débordement horizontal ; actions principales sur toute la largeur.
- Tablette et desktop : largeur de formulaire constante et centrage vertical raisonnable.
- Écrans bas : éviter le centrage vertical strict qui masque le titre ou les actions ; permettre le défilement naturel.
- Cibles tactiles d’au moins 44 px.

## 4. Traitement par parcours

### Connexion — `/login`

- Conserver e-mail, mot de passe, connexion Google et lien « Mot de passe oublié ? ».
- Garder le message d’erreur d’identifiants générique.
- Préserver la redirection `next` après authentification.
- Maintenir le lien de renvoi de vérification uniquement lorsque le cas métier correspondant est détecté.
- Donner une priorité visuelle claire à « Se connecter » ; Google reste une alternative visible, mais secondaire.

### Inscription — `/register`

- Conserver nom, e-mail, mot de passe et connexion Google.
- Préserver la consultation de `/api/auth/config`.
- Lorsque la vérification est requise, expliquer clairement la prochaine étape sur la page de vérification.
- Lorsque la vérification n’est pas requise, conserver la redirection actuelle.
- Ne pas ajouter de confirmation de mot de passe ou de champs non exigés par le métier.

### Mot de passe oublié — `/forgot-password`

- Une explication courte sur l’envoi d’un lien de réinitialisation.
- Un seul champ e-mail et une seule action principale.
- Un état de confirmation lisible après soumission.
- Un lien de retour vers la connexion toujours visible.

### Réinitialisation — `/reset-password`

- Conserver la validation du jeton et les cas de lien absent/invalide/expiré.
- Conserver les champs nouveau mot de passe et confirmation, ainsi que les contraintes existantes.
- Différencier nettement le formulaire, le succès et le lien invalide.
- Prévoir une action de récupération explicite vers `/forgot-password` en cas de jeton invalide.

### Vérification d’e-mail — `/verify-email`

- Expliquer le but de la vérification et la prochaine action attendue.
- Conserver le préremplissage de l’adresse e-mail depuis l’URL.
- Conserver le renvoi de l’e-mail et son état de confirmation.
- Maintenir un lien vers la connexion pour les personnes ayant déjà vérifié leur adresse.
- Ne pas présenter la vérification comme obligatoire lorsque la configuration ne l’exige pas.

## 5. Architecture d’interface envisagée

Créer une enveloppe partagée, par exemple :

- `portail/src/components/auth/auth-layout.tsx` — header, logo, largeur et zone principale.
- `portail/src/components/auth/auth-card.tsx` — surface et espacements communs si cela évite réellement la duplication.
- `portail/src/components/auth/auth-feedback.tsx` — présentation cohérente des messages d’erreur et de statut, uniquement si les cas d’usage le justifient.

Les pages gardent leurs composants client, leurs états et leurs appels Better Auth. Ne pas créer une abstraction générique de formulaire qui masque les différences métier. Ne pas déplacer la logique d’authentification dans les composants de présentation.

Avant d’ajouter un composant, vérifier si `Card`, `Input` et `Button` couvrent déjà le besoin. L’objectif est de partager la structure, pas de multiplier les couches.

## 6. Accessibilité et états

- Chaque champ garde un label explicite et un identifiant stable.
- Associer les erreurs de champ avec `aria-describedby` et `aria-invalid`.
- Les erreurs globales utilisent `role="alert"`; les confirmations asynchrones utilisent `role="status"`.
- Après une soumission en erreur, rendre l’information perceptible sans déplacer le focus de façon inattendue.
- Après une transition vers un écran de succès, vérifier si un titre ou un message doit recevoir le focus programmatique.
- Les boutons de soumission exposent leur état de chargement et sont désactivés pendant la requête.
- Les contrôles restent utilisables au clavier ; le focus visible ne doit jamais être supprimé.
- Respecter les préférences de réduction des animations.
- Vérifier les contrastes en thème clair et sombre.

## 7. Garde-fous fonctionnels et sécurité

Ne pas modifier :

- Les appels Better Auth et leurs paramètres.
- La normalisation de l’e-mail.
- Les messages génériques qui évitent de révéler l’existence d’un compte.
- La politique de liaison des comptes Google.
- Les redirections sécurisées `nextFromLocation()` et `withNext()`.
- Le comportement conditionnel de vérification e-mail via `/api/auth/config`.
- Les contraintes de longueur et de validation des mots de passe.
- La gestion des jetons de réinitialisation et de vérification.

Point d’attention : l’indisponibilité de Google doit être présentée correctement si l’interface dispose d’un signal fiable de configuration. Ne pas simuler une indisponibilité ni ajouter une détection client fragile. Les erreurs retournées par le fournisseur restent la source de vérité.

## 8. Fichiers à examiner ou modifier lors de l’implémentation

- `portail/src/app/login/page.tsx`
- `portail/src/app/register/page.tsx`
- `portail/src/app/forgot-password/page.tsx`
- `portail/src/app/reset-password/page.tsx`
- `portail/src/app/verify-email/page.tsx`
- `portail/src/components/ui/input.tsx`
- `portail/src/components/ui/button.tsx`
- `portail/src/components/ui/card.tsx`
- `portail/src/app/globals.css` uniquement si un token ou style global est réellement nécessaire
- Nouveaux composants ciblés sous `portail/src/components/auth/`, si justifiés

## 9. Plan de validation

### Fonctionnel

- Connexion correcte, identifiants incorrects et serveur inaccessible.
- Redirection vers une destination `next` valide.
- Inscription avec vérification e-mail activée et désactivée.
- Connexion Google et gestion d’une erreur du fournisseur.
- Demande de réinitialisation et confirmation.
- Jeton de réinitialisation absent, invalide, expiré et valide.
- Renvoi de vérification et confirmation.
- Préservation des paramètres d’URL attendus.

### Interface et accessibilité

- Mobile étroit, tablette et desktop.
- Thème clair et thème sombre.
- Navigation clavier complète et focus visible.
- Labels, annonces d’erreurs et annonces de succès.
- Réduction des animations.
- Contraste des textes, liens, bordures et boutons.

### Qualité

Depuis `portail/` : `npm run lint`, `npm run typecheck`, puis `npm run build`.
Exécuter également les tests pertinents du dépôt. Vérifier les parcours réels dans un navigateur avant de déclarer la validation visuelle terminée.

## 10. Définition de terminé

- Les cinq routes partagent une structure visuelle cohérente.
- Aucun champ ou étape métier superflue n’a été ajouté.
- Les états erreur, succès et chargement sont cohérents et accessibles.
- Les pages sont utilisables au clavier et sur mobile.
- Les thèmes clair et sombre restent lisibles.
- Les destinations et comportements d’authentification sont inchangés.
- Lint, typecheck, build et tests pertinents passent.
- Une revue navigateur confirme les rendus desktop et mobile.
