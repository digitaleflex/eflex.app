# Modèle de menaces et audit de sécurité — Portail EFLEX

> Portée : **`portail/`** (Next.js 15, Better Auth, Prisma/PostgreSQL, Redis/BullMQ, intégrations Coolify, GitHub, Resend, Kkiapay/FedaPay).  
> Objectif : identifier les actifs, surfaces d’attaque, menaces, contrôles en place (à vérifier dans le code) et actions de remédiation priorisées.  
> Références : `portail/AGENTS.md` (racine `AGENTS.md`), `docs/security/threat-model.md` (moteur Axiom, périmètre distinct).

## 1. Périmètre, actifs et hypothèses

### 1.1 En périmètre
| Surface | Composants principaux |
|---|---|
| Authentification & sessions | Better Auth (`lib/auth.ts`, `auth-client.ts`, `session.ts`), email/mdp, vérification email, reset, 2FA TOTP, passkeys WebAuthn, comptes liés (Google), impersonation admin, rate limiting (DB + Redis applicatif) |
| Multi-tenant & organisations | `resolveOrganization`, `requireOrg/requireProject`, rôles/membres, transferts, invitations, isolation des projets/apps/domaines/bases/déploiements |
| Projets & déploiements | Création/analyse repo, file BullMQ/Redis (`lib/queue.ts`, `worker.ts`), machine à états, Coolify API, domaines/TLS, logs/métriques runtime |
| Secrets & configuration | `lib/crypto.ts` (AES-256-GCM, AAD), `EnvVar`, URLs internes bases, PAT/installations GitHub chiffrés, clés `ENV_ENCRYPTION_KEY` |
| Intégrations externes | GitHub App/webhooks/deploy keys, Coolify, Resend (email + webhook Svix), Kkiapay/FedaPay (paiements + webhooks), Turnstile (optionnel) |
| Facturation & quotas | Abonnements/plans/limites, `assertProjectQuota`/`assertMemberQuota`/limites domaines, blocages maintenance/impayé/suspension |
| Administration | Routes `/api/admin/**`, audit, métriques/exports, modération |

### 1.2 Actifs critiques
| Actif | Emplacement / forme | Exigence |
|---|---|---|
| Identifiants & sessions | Better Auth (cookies HttpOnly, modèles `Session`/`Account`/`TwoFactor`/`Passkey`), hachage mdp côté `Account` | confidentialité, intégrité, révocation |
| Secrets applicatifs des projets | `EnvVar.value` chiffré (AES-256-GCM, AAD `projectId:key`) | **jamais exposé** en lecture/API/logs |
| URLs internes bases managées | `ProjectDatabase.internalUrl` chiffré (AAD `project-db:<projectId>:<kind>`), injectées en env | confidentialité |
| Jetons d’accès infra/intégrations | Token Coolify, secrets webhooks, clés paiement/Resend, clés/identifiants GitHub App, PAT | hors dépôt/image, moindre privilège |
| Données tenant | Projets, déploiements, domaines, logs, métriques, membres, facturation | **isolation stricte** org/projet/app |
| Clé de chiffrement | `ENV_ENCRYPTION_KEY` (+ `_PREVIOUS` pour rotation), hors DB/image | disponibilité & confidentialité (critique) |

### 1.3 Hypothèses
- La base PostgreSQL, Redis et Coolify sont des dépendances de confiance opérationnelle mais leurs accès doivent être minimisés et authentifiés.
- Le contenu des dépôts utilisateurs et les entrées HTTP/webhook sont **non fiables**.
- La terminaison TLS/front (Traefik/proxy) protège le transport public ; la config applicative doit rester sûre si un en-tête est mal interprété (ne pas faire confiance aveuglément à l’origine sans contrôles).
- Environnement mono-région/VPS : certaines protections (rate limit mémoire, verrous par processus) ont des limites en multi-instance (déjà notées dans `AGENTS.md`).

## 2. Matrice acteurs × surfaces

| Acteur | Capacités | Surfaces | Contrôles attendus |
|---|---|---|---|
| Anonyme / internet | Requêtes HTTP, webhooks forgés | Auth, pages publiques, endpoints publics (`/api/health`, webhooks) | rate limiting, validation, vérification de signature, pas de fuite d’info |
| Utilisateur authentifié | Actions selon rôle dans une organisation | Projets, domaines, env vars, déploiements, logs, facturation équipe | `resolveOrganization` + contrôle de rôle, quotas, audit |
| Membre d’une autre organisation | Tentatives IDOR/cross-tenant | Routes `/api/projects/[id]/**`, ressources filles | réponses 401/403/404 sans fuite d’existence/données (tests d’isolation) |
| Admin plateforme | Actions privilégiées | `/api/admin/**`, impersonation, réglages globaux | `requireAdminApi`/404, audit systématique, restrictions (pas d’auto-impersonation) |
| Intégration compromise (webhook/token) | Appels signés ou jetons volés | GitHub, Resend, paiements, Coolify | vérification signature/HMAC/Svix, idempotence, moindre privilège, rotation |
| Dépôt/app malveillante | Code/config fournis au build/deploy | Analyse, build, runtime | isolation runtime via infra, pas d’exécution de code repo côté portail, masquage secrets en logs |

## 3. Menaces et contrôles (synthèse)

> Légende : **EN PLACE** = contrôle identifié dans l’architecture/code attendu ; **À VÉRIFIER** = à confirmer par revue/test ciblé ; **PARTIEL** = présent mais incomplet ; **ABSENT** = non constaté / à implémenter.

| ID | Menace | Impact | Contrôles (état) | Preuves / points de contrôle |
|---|---|---|---|---|
| T-P1 | IDOR / fuite cross-tenant (projets, apps, domaines, bases, logs, métriques, déploiements) | fuite ou modification de données d’un autre client | **EN PLACE (à vérifier en continu)** : résolution org + helpers tenant + tests d’inventaire/isolation d’intégration | `lib/organizations.ts`, `lib/tenant.ts`, `api-tenant-isolation.integration.test.ts`, middleware de routes `[id]` |
| T-P2 | Élévation de privilèges / rôles | actions non autorisées (gestion, facturation, admin) | **EN PLACE (à vérifier)** : `canManageProjects`, `canManageBilling`, admin réservé, refus impersonation d’admin/soi-même | routes API & UI, `requireAdminApi`, audit des actions admin |
| T-P3 | Exposition de secrets (env vars, URLs internes, tokens) | compromission infra/apps | **EN PLACE** : chiffrement AES-256-GCM avec AAD, aucune route GET ne renvoie les valeurs ; masquage logs | `lib/crypto.ts`, routes env-vars, `deployment-events`/logs, `secret-text.ts`/masquage |
| T-P4 | Compromission de la clé de chiffrement | déchiffrement de tous les secrets stockés | **PARTIEL** : clé hors DB/image, rotation via `_PREVIOUS` + script ; pas de KMS/HSM | `instrumentation.ts` (validation), `scripts/encrypt-existing-env-vars.ts`, gestion ops des secrets |
| T-P5 | Failles d’authentification (bruteforce, reset, session) | prise de compte | **EN PLACE (à renforcer)** : rate limiting (DB/Redis), vérification email conditionnelle, 2FA/passkeys, révocation sessions, reset mdp | `lib/auth.ts`, `lib/rate-limit.ts`, routes/settings sécurité |
| T-P6 | Webhooks forgés / replay | actions non sollicitées (deploy, états email/paiement) | **EN PLACE (à vérifier)** : signatures (GitHub HMAC, Svix Resend, FedaPay/Kkiapay selon schéma), idempotence (`X-GitHub-Delivery`, refs paiement), endpoints dédiés | `api/webhooks/**`, `resend-webhook.ts`, `github-app.ts`, `payments.ts` |
| T-P7 | Injection / entrées malformées (XSS stocké/rendu, SSRF indirect, pathing) | exécution script, accès interne, corruption | **À VÉRIFIER** : validation Zod/schémas, échappement rendu React, normalisation domaines/URLs, pas de fetch arbitraire non contrôlé | routes API, `github-url.ts`, `custom-domain.ts`, composants affichant logs/noms |
| T-P8 | Abus / déni de service applicatif | indisponibilité, coûts | **PARTIEL** : quotas plan, rate limits sur certaines routes, timeouts déploiement ; rate limiting distribué non généralisé | `billing.ts`, `rate-limit.ts`, worker/queue, limites Coolify/infra |
| T-P9 | Fuite d’informations via logs/erreurs/diagnostics | aide à l’exploitation | **EN PLACE (à vérifier)** : masquage secrets, messages génériques, 404 sur ressources non autorisées | logs déploiement/runtime, réponses d’erreur, inventaire routes |
| T-P10 | Intégrité de la chaîne de déploiement | code non autorisé déployé, confusion de source | **PARTIEL** : analyse/refetch serveur, liaison projet/repo/installation, deploy keys/jetons courts, verrou déploiement actif | `analyzeGitHubRepo`, `git-credentials.ts`, `project-deployments.ts`, worker |
| T-P11 | Facturation/paiement (double crédit, contournement blocage) | perte financière, incohérences d’accès | **EN PLACE (à vérifier)** : idempotence activation, vérification serveur des transactions, blocages `assertDeploymentAllowed`/suspension | `payments.ts`, `billing.ts`, `billing-renewal.ts`, webhooks paiement |
| T-P12 | Protection transport/navigateur insuffisante | vol de session, clickjacking, fuite de contexte | **PARTIEL** : en-têtes sécurité/HSTS, CSP **Report-Only** (durcissement à finaliser) | `security-headers.mjs`, `next.config.mjs` |

## 4. Revue d’audit ciblée (à exécuter / répéter)

| Priorité | Vérification | Méthode | Critère de succès |
|---|---|---|---|
| P0 | Isolation tenant sur routes critiques & nouvelles ressources (apps, domaines, bases, exports, analytics futures) | tests d’intégration (inventaire exhaustif) + revue manuelle scoping | aucune réponse 200 cross-tenant, pas de fuite d’existence/IDs |
| P0 | Non-exposition des secrets | revue des routes GET/exports/logs + tests | aucune valeur `EnvVar`/URL interne/token en clair |
| P0 | Webhooks : signature + idempotence + rejet des requêtes invalides | tests unitaires/intégration par fournisseur | 4xx sur signature invalide/rejouée hors fenêtre, effet unique |
| P1 | Auth/session : 2FA, reset, révocation, impersonation, rate limit distribué sur sensibles | revue config Better Auth + tests | flux durcis, abus limités, audit présent |
| P1 | Paiements/facturation : idempotence, blocages, cas de bord (grâce, remboursement) | tests de non-régression et scénarios webhook | aucun double crédit/activation incohérente |
| P1 | Rendu/logs : XSS et masquage | revue composants affichant contenu utilisateur/logs | échappement correct, secrets masqués |
| P2 | En-têtes/CSP : passage Report-Only → enforce | observation rapports + ajustement | CSP effective sans casser Turnstile/paiements/flux légitimes |
| P2 | Dépendances & surface npm/Next | audit dépendances, mises à jour, SCA en CI | vulnérabilités critiques traitées |

## 5. Plan de remédiation priorisé

| Horizon | Action | Lié à |
|---|---|---|
| Court terme | Étendre la matrice de tests d’isolation à toute nouvelle route/ressource et l’exiger en CI ; centraliser les helpers tenant | T-P1, #125 |
| Court terme | Vérifier/compléter la couverture signatures+idempotence de tous les webhooks et le masquage systématique des secrets dans exports/logs/diagnostics | T-P3, T-P6, T-P9 |
| Court terme | Renforcer le rate limiting **distribué** (Redis) sur auth, création, webhooks, exports/ingestion | T-P5, T-P8, #127 |
| Moyen terme | Finaliser CSP en mode enforce (après collecte Report-Only) et revue des en-têtes selon déploiement réel | T-P12 |
| Moyen terme | Durcir gestion/rotation des secrets et accès (moindre privilège Coolify/GitHub, procédures clés de chiffrement) | T-P3, T-P4, #126 |
| Moyen terme | Durcir la chaîne de déploiement (contrôles d’intégrité/source, revue des cas compose/monorepo) et diagnostics sans fuite | T-P10 |
| Continu | SCA/MAJ dépendances, revue des changements sensibles (auth, billing, tenant) avec `@security`/`@reviewer` | transversal |

## 6. Limites connues (à date)

- **CSP en Report-Only** : durcissement à valider avant enforcement (cf. `AGENTS.md`).
- **Limites d’exécution (CPU/RAM/disque) des conteneurs** et certaines mesures (stockage/bande passante) dépendent de l’infrastructure/Coolify et ne sont pas pleinement imposées/observées par le portail seul (#22, #131, #119, #120).
- **Rate limiting** : partagé en DB/Redis pour certains cas, mais pas uniformément distribué sur tous les endpoints sensibles ; certains compteurs en mémoire ne passent pas à l’échelle multi-instance.
- **Rotation de clé de chiffrement** : opérationnelle via script mais sans KMS/HSM (contrôle procédural).
- **Ce document est un socle** : il doit être mis à jour à chaque nouvelle surface (analytics, exports, bundles diagnostic, etc.) et accompagné de preuves (tests/revues) pour passage en « audit formel » clos.

---
*Document initial rédigé pour l’issue #124 — à réviser lors des revues de sécurité et de l’évolution du périmètre.*
