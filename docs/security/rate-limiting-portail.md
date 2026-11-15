# Protection anti-abus et limites de débit — portail (SEC-4, premier incrément)

État au 2026-11-15 (incrément partiel). Objectif : limiter les abus sur les routes les plus exposées tout en restant compatible multi-instance lorsque Redis est disponible.

## Stratégie

- **Moteur** : `portail/src/lib/rate-limit.ts` (fenêtre fixe, clé préfixée `eflex:rl:`).
  - **Distribué (Redis)** si `REDIS_URL` est configuré et joignable : `INCR` + `PEXPIRE`, partagé entre instances.
  - **Repli mémoire (par processus)** si Redis est absent ou en erreur : filet de sécurité pour ne pas casser les flux légitimes, **non partagé** entre instances et réinitialisé au redémarrage. En cas d’échec Redis avec `REDIS_URL` défini, le client est marqué en dégradation pendant ~15 s (anti-tempête de reconnexion) puis réessayé.
- **Better Auth** : `rateLimit.storage = 'database'` dans `portail/src/lib/auth.ts` pour les endpoints d’authentification/plugins (partagé, indépendant de Redis applicatif).
- **Clés** : `action:<acteur|identifiant>` (utilisateur), `org:<organizationId>:<action>` (tenant, en plus du par-utilisateur), `ip:<ip>:<action>` (points d’entrée non authentifiés/webhooks).

## Routes couvertes par cet incrément

| Domaine | Routes / actions | Clés / limites (indicatives) |
|---|---|---|
| Projets | `POST /api/projects` (création) | `create:<user>` 10/min + `org:*:create` 20/min |
| Analyse | `POST /api/projects/analyze` | `analyze:<user>` 10/min + `org:*:analyze` 30/min |
| Déploiements | `POST /api/projects/[id]/redeploy`, cancel/rollback déploiement | par utilisateur + `org:*:redeploy` / `deployment-cancel` / `deployment-rollback` |
| Domaines/apps/bases/runtime/logs/métriques/diagnostic | mutations et lectures coûteuses existantes sous `projects/[id]/**` | par utilisateur et/ou `org:*:<action>` selon la route (déjà en place pour la plupart) |
| Secrets projet | `POST/DELETE /api/projects/[id]/env-vars`, `POST /env-vars/bulk`, `DELETE /env-vars/[key]` | `env:*` / `env-bulk:*` par utilisateur + `org:*:env-mutate` |
| Projet | `PATCH/DELETE /api/projects/[id]`, `POST /api/projects/[id]/transfer` | par utilisateur + `org:*:project-mutate` |
| GitHub | `GET /api/github/repositories`, `POST/DELETE /api/github/installations[/*]` | par utilisateur (appels API amont / rattachement sensible) |
| Facturation | `POST /api/billing/request`, `POST /api/billing/checkout`, `POST /api/billing/kkiapay/confirm` | par utilisateur + `org:*:billing-mutate` |
| Webhooks publics | `POST /api/webhooks/{github,resend,kkiapay,fedapay}` | `ip:*:webhook:<provider>` 120/min (signature/HMAC/Svix vérifiée ensuite) |

> Les seuils sont volontairement conservateurs pour ne pas casser les usages légitimes (imports `.env` en lot, redéploiements manuels, intégrations). Les valeurs exactes font foi dans le code des routes.

## Ce qui reste à faire (périmètre complet SEC-4)

- **Couverture exhaustive** : audit systématique de toutes les routes `app/api/**` (lecture/écriture/admin/support/notifications/export) et homogénéisation des politiques par classe de risque (coût CPU/IO, appels tiers, écriture sensible, exposition publique).
- **Tuning & observabilité** : ajuster les seuils selon métriques réelles, ajouter compteurs/métriques (429, mode `redis`/`memory`/`redis-degraded`), alerting sur dégradation Redis prolongée ou pics de refus.
- **Durcissement du repli** : en production multi-instance, envisager un mode « distribué requis » (échec contrôlé) pour les actions les plus critiques quand Redis est indisponible, avec dégradation explicite et documentée (à valider pour ne pas bloquer les flux légitimes).
- **Limites amont/auth** : compléter les règles Better Auth si de nouveaux endpoints sensibles apparaissent ; harmoniser les réponses 429 (en-têtes `Retry-After` éventuels) sans fuite d’information.
- **Tests** : étendre les tests d’intégration/route pour les cas 429 et la non-régression multi-tenant ; tests de charge/burst en environnement proche prod.
- **Admin/support** : évaluer des limites dédiées sur les routes admin et support si exposées à des automatisations abusives.

## Validation

- Test ciblé : `pnpm vitest run portail/src/lib/rate-limit.test.ts` (mémoire, IP/org, mode).
- Les routes modifiées conservent les contrôles d’authentification/tenant/rôle existants ; aucun secret ni détail interne ajouté aux réponses 429.
