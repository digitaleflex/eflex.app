# Gestion des secrets et rotation des clés — Portail EFLEX

> Portée : portail (`portail/`), intégrations (Coolify, GitHub, Resend, Kkiapay, FedaPay) et secrets applicatifs chiffrés en base.  
> Objectif : procédures documentées de rotation/révocation, moindre privilège et vérifications de non-exposition.  
> À compléter/adapter selon l’infrastructure de production réelle.

## 1. Inventaire des secrets (à maintenir)

| Secret / clé | Usage | Stockage attendu | Rotation / révocation |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | Signature/chiffrement liés à l’authentification Better Auth | Variable d’environnement serveur, hors dépôt/image | Rotation planifiée ; invalide les sessions selon configuration Better Auth (prévoir fenêtre de maintenance) |
| `ENV_ENCRYPTION_KEY` (32 octets, base64) | Chiffrement AES-256-GCM des `EnvVar` et URLs internes de bases managées (AAD par ressource) | Variable d’environnement serveur, **jamais en base ni dans l’image** | Rotation via procédure ci-dessous (`ENV_ENCRYPTION_KEY_PREVIOUS` + script) |
| `ENV_ENCRYPTION_KEY_PREVIOUS` | Clé précédente pendant la rotation | Temporaire (env) | À retirer après rechiffrement complet et vérification |
| `DATABASE_URL` | Accès PostgreSQL | Env serveur / secret d’orchestration | Rotation des identifiants DB côté SGBD + mise à jour env + redémarrage |
| `REDIS_URL` | Cache/file BullMQ/limiteurs | Env serveur | Rotation identifiants Redis si activée |
| `COOLIFY_API_URL`, `COOLIFY_API_TOKEN` | Pilotage déploiements/ressources | Env serveur | Révoquer/régénérer le jeton Coolify, appliquer moindre privilège (scopes nécessaires uniquement), redéployer portail/worker |
| `GITHUB_APP_*` / secrets webhook GitHub | App GitHub, webhooks, accès dépôts | Env serveur ou `PlatformSetting` chiffré selon flux manifest (jamais commit) | Régénérer secret webhook/clé privée/client secret selon composant ; révoquer installations/tokens compromis |
| PAT GitHub (`GitPat`) | Accès dépôts (alternative App) | Chiffré côté application (modèle dédié) | Révocation côté GitHub + suppression/remplacement dans le portail |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Emails transactionnels + webhooks Svix | Env serveur | Régénérer dans Resend, mettre à jour env ; vérifier signature webhook après rotation |
| `KKIAPAY_*`, `KKIAPAY_WEBHOOK_SECRET` | Paiements + webhooks | Env serveur | Régénérer clés/secrets côté fournisseur, mettre à jour env, tester en sandbox avant prod |
| `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET` | Paiements + webhooks | Env serveur | Idem FedaPay |
| `TURNSTILE_SECRET_KEY` / clé publique | Protection anti-bot (optionnelle) | Env serveur / build arg public | Rotation côté Cloudflare si compromis |
| Identifiants admin/bootstrap (`ADMIN_EMAILS`, etc.) | Accès administration | Env serveur | Revue régulière, comptes à privilèges minimaux, MFA/passkeys recommandés |

## 2. Rotation de la clé de chiffrement des variables (`ENV_ENCRYPTION_KEY`)

Les valeurs `EnvVar.value` et les URLs internes de bases sont chiffrées en AES-256-GCM (format versionné, AAD lié à la ressource). **La clé ne doit jamais être stockée en base ni dans une image Docker.**

### Procédure (rotation contrôlée)

1. **Préparer** une nouvelle clé (32 octets, encodée en base64) et la conserver dans le gestionnaire de secrets de l’environnement cible.
2. **Déployer la configuration** en exposant temporairement :
   - `ENV_ENCRYPTION_KEY` = nouvelle clé
   - `ENV_ENCRYPTION_KEY_PREVIOUS` = ancienne clé
3. **Redémarrer** le portail/worker (la validation de configuration au démarrage doit réussir).
4. **Rechiffrer les données existantes** depuis la racine du dépôt (avec accès DB et env chargés) :
   ```bash
   pnpm exec tsx portail/scripts/encrypt-existing-env-vars.ts
   ```
   - Le script rechiffre avec la clé courante et n’affiche que des compteurs (jamais de valeurs).
   - En environnement avec sauvegarde, effectuer une sauvegarde cohérente avant la migration.
5. **Vérifier** : lecture/écriture de variables de projet, déploiements utilisant les secrets injectés, absence d’erreurs de déchiffrement.
6. **Retirer** `ENV_ENCRYPTION_KEY_PREVIOUS` de l’environnement et redéployer.
7. **Révoquer/détruire** l’ancienne clé dans le gestionnaire de secrets après confirmation.

> **Incident (clé compromise)** : considérer tous les secrets chiffrés potentiellement exposés ; après mise en sûreté, procéder à la rotation de la clé **et** à la rotation/remplacement des secrets applicatifs impactés (tokens, mots de passe de services, etc.).

## 3. Rotation des secrets d’intégration (principes)

- **Webhooks (GitHub, Resend, Kkiapay, FedaPay)** : générer un nouveau secret côté fournisseur, mettre à jour la variable d’environnement, redéployer, puis invalider l’ancien secret. Les endpoints vérifient les signatures/HMAC avant traitement (voir code `api/webhooks/*`).
- **Coolify** : créer un jeton avec le **moindre privilège** nécessaire (lecture/écriture limitée aux opérations de déploiement/ressources requises), révoquer l’ancien jeton après bascule.
- **GitHub App / PAT / deploy keys** : privilégier l’App GitHub (jetons courts, permissions ciblées) ; révoquer PAT et clés inutilisées ; supprimer les deploy keys lors de la suppression/désactivation d’accès projet.
- **Resend / fournisseurs de paiement** : utiliser des clés distinctes par environnement (sandbox/prod), restreindre les permissions quand le fournisseur le permet, journaliser les rotations côté ops.

## 4. Moindre privilège et révocation

- Comptes de service/API : permissions minimales, périmètre limité (projet/environnement), pas de réutilisation entre environnements.
- Accès admin portail : limiter `ADMIN_EMAILS`, exiger email vérifié/MFA/passkeys quand possible, auditer les actions sensibles (`audit()` sur routes admin).
- Sessions/tokens utilisateurs : révocation possible depuis les paramètres ; invalidation au changement de mot de passe (comportement Better Auth configuré).

## 5. Vérification du masquage et de l’audit (contrôles en place à préserver)

- **Aucune route GET ne doit renvoyer** les valeurs de `EnvVar` ni les URLs internes de bases ; les exports/diagnostics (ex. bundle support #136) excluent secrets, jetons et journaux bruts.
- **Journaux de déploiement** : masquer les valeurs sensibles avant exposition/streaming ; éviter toute journalisation de secrets en clair.
- **Audit** : conserver la traçabilité des actions d’administration et des opérations sensibles (impersonation, changements de plan/suspension, etc.) via le mécanisme d’audit existant.
- **Revue continue** : à chaque nouvelle route/export/ressource, vérifier l’isolation tenant, l’absence de fuite de secrets et l’application des contrôles d’accès/rate limiting.

## 6. Limites et actions complémentaires

- Pas de KMS/HSM géré dans le portail : la protection des clés repose sur la gestion des secrets d’environnement et les procédures ops.
- Automatiser autant que possible : alertes d’expiration/échec (certificats, paiements), contrôles CI (tests d’isolation, lint/typecheck), et revue des accès lors des rotations.
- Référence : `docs/security/portail-threat-model.md` (menaces T-P3/T-P4, plan de remédiation).
