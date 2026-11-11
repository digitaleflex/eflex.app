# Politique de phrases secrètes (authentification)

Issues : #55 (politique), #56 (validation), #57 (Google et e-mails).

## Règles appliquées

- **12 caractères minimum**, **256 caractères maximum**, sans règle de composition
  (aucune majuscule, chiffre ou symbole obligatoire).
- Les **espaces**, les accents et l’Unicode sont conservés tels quels, sans `trim`
  ni normalisation : le secret saisi est exactement celui qui est vérifié.
- Aucun indicateur de « force » ni compteur présenté comme une mesure d’entropie.
  L’interface conseille 4 à 5 mots sans lien entre eux et un exemple fictif.
- La confirmation est exigée à l’inscription, à la réinitialisation et pour la
  définition d’une première phrase secrète depuis les paramètres.
- La connexion n’impose que la présence du secret : les comptes créés avec
  l’ancien minimum de 8 caractères continuent de fonctionner.

La validation côté interface (`portail/src/lib/auth-validation.ts`) donne un
retour immédiat, mais **Better Auth reste l’autorité** : longueur, hachage,
unicité de l’adresse et limitation de débit sont contrôlés côté serveur.

## Contrôle des secrets compromis et indicateur de robustesse

Aucun indicateur de « force » n’est affiché : un compteur de caractères ou de
mots ne mesure pas l’entropie réelle. Un estimateur contextuel local (type
`zxcvbn`) n’a pas été ajouté pour ne pas alourdir le bundle ni suggérer une
garantie trompeuse.

Le contrôle de fuite (Have I Been Pwned) n’est pas activé. Better Auth expose un
plugin `haveibeenpwned` en k-anonymat (seuls les 5 premiers caractères du hash
SHA-1 sont envoyés, jamais le secret), mais il introduit une dépendance réseau
sur le parcours d’inscription. Décision : à activer plus tard, avec un délai
maximal et un repli explicite en cas d’indisponibilité du service.

## Hachage et compatibilité

`portail/src/lib/password.ts` applique une stratégie versionnée :

1. `SHA-256` de la phrase encodée en UTF-8, sortie base64 (44 octets) ;
2. `bcrypt` (12 tours) sur cette empreinte ;
3. préfixe `v2$` stocké dans `Account.password`.

Le pré-hachage évite la troncature silencieuse de bcrypt à 72 octets. Deux
phrases partageant les 72 premiers octets restent distinctes.

Les hachages existants (bcrypt direct, sans préfixe), y compris ceux créés par
l’ancien système ou par `portail/e2e/seed-auth.mjs`, sont vérifiés avec
`bcrypt.compare` sur la valeur brute. Aucune migration ni réinitialisation n’est
nécessaire ; un compte est converti en `v2$` à sa prochaine réinitialisation ou
au prochain changement de phrase secrète.

## Vérification d’e-mail et Google

- L’inscription ne renvoie vers `/verify-email` que si Better Auth n’a pas créé
  de session (vérification active) ou si `/api/auth/config` confirme
  `emailVerificationRequired`.
- Le renvoi de l’e-mail de vérification est limité côté serveur
  (`/send-verification-email`, 3 par minute) et côté interface (60 s).
- Le bouton Google n’apparaît que si `/api/auth/config` retourne
  `googleEnabled`. Les erreurs et l’annulation OAuth sont affichées dans une
  région live, sans détail interne.
- Les `callbackURL` OAuth sont validées côté client (`safeNext`) **et** côté
  serveur par un hook `before` sur `/sign-in/social` (pas de redirection
  ouverte).

## Tests

- `portail/src/lib/auth-validation.test.ts` : longueurs, espaces, Unicode,
  confirmation, adresses e-mail.
- `portail/src/lib/password.test.ts` : format `v2$`, vérification, phrases de
  plus de 72 octets, compatibilité bcrypt historique.
- `portail/src/lib/auth-oauth.test.ts` : annulation, erreurs génériques,
  conservation de `next`.
- `portail/src/lib/safe-next.test.ts` : validation des destinations internes.
