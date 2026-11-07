# [P0][Sécurité] Supprimer l'inscription implicite par identifiants et ajouter la vérification d'email

> **Mise à jour :** l'authentification est passée à **Better Auth** (voir `portail/src/lib/auth.ts`). Sont déjà réglés : plus de création de compte implicite, page `/register`, message d'erreur unique, e-mail normalisé, limitation des tentatives (429 vérifié). **Reste à faire :** vérification de l'e-mail (`emailVerification.sendVerificationEmail` + `requireEmailVerification`, nécessite un serveur SMTP), mot de passe oublié (`sendResetPassword`), et un limiteur de débit partagé via Redis si le portail passe sur plusieurs instances.

## Contexte

Dans `portail/src/lib/auth.ts`, la fonction `authorize()` du `CredentialsProvider` **crée automatiquement un compte** quand l'email n'existe pas :

```ts
// New user: create account with hashed password
if (!user) { ... prisma.user.create(...) }
```

Problèmes :
1. **Aucune vérification de l'email** : n'importe qui peut créer un compte au nom de `ceo@entreprise.fr`. Selon la configuration de liaison des comptes, la vraie personne qui se connecte ensuite avec Google risque de voir son compte squatté ou mélangé.
2. **Une faute de frappe dans l'email crée un compte fantôme** au lieu d'afficher « identifiants incorrects ».
3. **Énumération des comptes** : les messages d'erreur diffèrent selon que le compte existe, qu'il utilise Google ou qu'il n'existe pas.
4. **Aucune limitation du nombre de tentatives** : la force brute reste possible (le coût bcrypt de 12 ralentit l'attaque mais ne suffit pas).
5. `PrismaAdapter` + `session.strategy: "jwt"` + Credentials : la table `Session` n'est pas utilisée, et ce mélange prête à confusion.

## Objectif

Une inscription explicite, un email vérifié et une connexion robuste.

## Proposition technique

- Page `/register` et route `POST /api/auth/register` : email et mot de passe (8 caractères minimum, idéalement vérifié contre une liste de mots de passe compromis), compte créé avec `emailVerified = null`.
- Envoi d'un lien de vérification (la table `VerificationToken` existe déjà) via un fournisseur SMTP (variables `EMAIL_SERVER` et `EMAIL_FROM`). En dev, le lien s'affiche dans les logs.
- Dans `authorize()` :
  - ne **jamais** créer d'utilisateur ;
  - refuser la connexion si `emailVerified` est nul, avec un message invitant à vérifier l'email ;
  - un seul message générique, « Email ou mot de passe incorrect », pour éviter l'énumération.
- Limitation des tentatives par IP et par email, via Redis (déjà dans l'infra) : par exemple 5 tentatives par tranche de 15 minutes.
- Normaliser l'email (`trim().toLowerCase()`) à l'inscription et à la connexion.
- Réinitialisation du mot de passe (`/forgot-password`) avec un jeton à usage unique et une expiration courte.
- Vérifier la politique de liaison des comptes Google et identifiants : `allowDangerousEmailAccountLinking` doit rester désactivé.

## Critères d'acceptation
- [ ] Se connecter avec un email inconnu ne crée aucun compte.
- [ ] Un compte non vérifié ne peut pas se connecter.
- [ ] Au-delà de 5 échecs, un blocage temporaire se déclenche.
- [ ] Les messages d'erreur ne révèlent pas l'existence d'un compte.
- [ ] Tous les textes affichés à l'utilisateur sont en français.
