# [P0][Sécurité] Chiffrer les variables d'environnement au repos et ne jamais les renvoyer en clair

## Contexte

Dans `portail/src/app/api/projects/route.ts` :

```ts
value: v.value, // TODO: encrypt with libsodium before production
```

Les secrets des clients (clés API, `DATABASE_URL`, etc.) sont stockés **en clair** dans PostgreSQL (`EnvVar.value`). Une fuite de dump, de sauvegarde ou un simple accès en lecture à la base expose tous les secrets de tous les clients. Le commentaire du schéma Prisma (« chiffré au repos ») est actuellement faux.

## Objectif

Chiffrer chaque valeur avec un chiffrement authentifié, et garder la clé maître hors de la base.

## Proposition technique

- Module `portail/src/lib/crypto.ts` :
  - AES-256-GCM via `node:crypto` (aucune dépendance), ou `crypto_secretbox` de `libsodium-wrappers` ;
  - format stocké : `v1:<nonce base64>:<ciphertext+tag base64>` (le préfixe de version permet la rotation) ;
  - fonctions `encrypt(plaintext)` et `decrypt(stored)` ;
  - `projectId:key` comme données associées (AAD), pour empêcher qu'une valeur chiffrée soit déplacée vers une autre variable.
- Clé : `ENV_ENCRYPTION_KEY` (32 octets en base64), ajoutée à `.env.example` et `.env.prod.example`, validée au démarrage (échec explicite si elle manque ou n'a pas la bonne taille).
- Rotation : prise en charge de `ENV_ENCRYPTION_KEY_PREVIOUS` pour le déchiffrement, et rechiffrement via un script `portail/scripts/rotate-env-key.ts`.
- API :
  - les réponses `GET` ne renvoient **jamais** les valeurs, seulement les clés (éventuellement avec `••••` et la date de mise à jour) ;
  - aucune valeur dans les logs ni dans `logsSummary`.
- Migration des données existantes : script one-shot qui chiffre les lignes non préfixées par `v1:`.
- Validation : clés conformes à `^[A-Za-z_][A-Za-z0-9_]*$`, longueur maximale des valeurs, dédoublonnage. Aujourd'hui, la contrainte `@@unique([projectId, key])` fait planter `createMany` en cas de doublon : il faut renvoyer une erreur 400 propre.

## Critères d'acceptation
- [ ] En base, `EnvVar.value` ne contient que des valeurs `v1:…`.
- [ ] Tests unitaires : aller-retour, altération détectée (tag invalide), AAD incorrecte rejetée.
- [ ] Le portail refuse de démarrer en production sans `ENV_ENCRYPTION_KEY`.
- [ ] Aucune route de l'API ne renvoie une valeur en clair.
