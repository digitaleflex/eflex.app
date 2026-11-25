# Checklist d’analyse complète du repo (architecte plateforme)

> Objectif : disposer d’une méthode **répétable** pour comprendre, auditer et faire évoluer le monorepo EFLEX/Axiom sans se fier à une lecture “au hasard”.  
> **Contexte repo (à garder en tête) :** chemin de production actuel = **Portail Next.js + Prisma + BullMQ/Redis + Worker + Detector/Renderer TS + Coolify**. Les services Go sous `services/*` (Axiom) sont **gelés** (ADR-0012) : à inventorier mais à ne pas traiter comme actifs en prod sauf décision explicite.

---

## 0) Préparer l’analyse (10–15 min)

**Objectif :** fixer le périmètre et la “source de vérité” avant de plonger dans le code.

- [ ] Lire `README.md`, `AGENTS.md`, `PROD.md`, `DEV.md`.
- [ ] Lire `docs/architecture/eflex/README.md` et `docs/adr/0012-eflex-production-coolify-axiom-paused.md` (et survoler les ADR récents si changement récent).
- [ ] Noter la **branche** et l’**état git** (`git status`, dernier commit) pour que l’analyse soit datée.

**Pourquoi :** évite de confondre docs historiques Axiom et flux réel portail+Coolify ; cadre les interdits (ne pas étendre Axiom, ne pas réinventer Coolify comme backend principal).

---

## 1) Cartographier les zones du monorepo (30–60 min)

**Objectif :** savoir “qui contient quoi” et les frontières.

- [ ] **Racine** : lister `docker-compose.*`, `deploy.sh`, `scripts/`, `config/domains.sh`, `schema/` vs `schemas/`, `packages/`, `portail/`, `services/`, `docs/`, `docs-site/`.
- [ ] **Portail** (`portail/`) : `package.json`, `next.config.*`, `prisma/schema.prisma`, `src/app` (routes), `src/lib`, `src/worker.ts`, `src/instrumentation*.ts`.
- [ ] **Packages TS** : `packages/detector` (entrée, walk, types), `packages/renderer` (render, deploy/dockerfile, templates), `schema/v1.json` + `schema/test.ts`.
- [ ] **Axiom gelé** : `services/engine|agent|orchestrator` (Go.mod, commandes de test), `schemas/` (contrats Axiom), docs associées — marquer “hors flux prod portail”.
- [ ] **Infra/ops** : `docker-compose.prod.yml`, `deploy.sh`, `scripts/deploy-prod.sh`, `scripts/backup-db.sh`, `healthcheck.sh`, `docs/operations/*`.

**Pourquoi :** un monorepo mélange prod active et sous-systèmes gelés ; la cartographie évite les fausses priorités.

**Validation rapide :** être capable d’expliquer en 5 lignes où vit (a) l’API web, (b) le worker, (c) la détection, (d) le rendu, (e) le déploiement Coolify.

---

## 2) Tracer les flux critiques bout en bout (1–2 h)

**Objectif :** comprendre les chemins réels du code, pas seulement les diagrammes.

### 2.1 Authentification et multi-tenant
- [ ] Suivre `portail/src/lib/auth.ts`, `auth-client.ts`, `session.ts`, plugins (org, admin, 2FA, passkeys selon config).
- [ ] Vérifier `resolveOrganization` / `canManageProjects` et l’usage systématique dans les routes API projet.
- [ ] Identifier routes admin (`api/admin/**`) et mécanismes d’audit/impersonation.

**Pourquoi :** isolation tenant et droits = base sécurité métier.

### 2.2 Analyse et création de projet
- [ ] Routes : `POST /api/projects/analyze`, `POST /api/projects` (et routes liées).
- [ ] `lib/repo-analysis.ts`, `lib/github-url.ts`, intégration `@eflex/detector`, revalidation serveur (pas de plan client de confiance).
- [ ] Gestion GitHub (App/PAT) et accès repos privés si concerné.

### 2.3 File de déploiement et worker
- [ ] `lib/queue.ts`, `worker.ts`, `instrumentation*.ts` (ordre de chargement Node vs edge).
- [ ] `lib/deployment-state.ts`, `lib/project-deployments.ts`, `lib/deployment-watchdog.ts`.
- [ ] `lib/deploy-plan.ts` + `@eflex/renderer`, puis `lib/coolify.ts` (création app, labels Traefik, déploiement, domaines, TLS).
- [ ] Points d’annulation, retries, idempotence (jobId, verrouillage logique).

**Pourquoi :** cœur de la promesse produit ; erreurs ici = incidents clients.

### 2.4 Temps réel, logs, notifications
- [ ] `lib/event-bus.ts`, SSE `/api/events`, providers/hooks UI.
- [ ] Routes logs (déploiement/runtime) et masquage secrets.
- [ ] `lib/notifications.ts` (app/email, préférences, déduplication).

---

## 3) Données, contrats et secrets (45–90 min)

- [ ] Ouvrir `portail/prisma/schema.prisma` : lister entités clés (User, Org, Project, Deployment, EnvVar, Subscription, domaines, etc.), relations, contraintes.
- [ ] Vérifier migrations (`portail/prisma/migrations`) et état attendu en prod.
- [ ] `lib/crypto.ts` : chiffrement env (AAD, clés `ENV_ENCRYPTION_KEY` / `ENV_ENCRYPTION_KEY_PREVIOUS`), points d’appel, absence de valeurs en GET.
- [ ] `schema/v1.json` + types `packages/detector/src/types.ts` + `schema/test.ts` : cohérence du contrat BuildPlan.
- [ ] Distinguer `schema/` (E-FLEX) et `schemas/` (Axiom) dans toute lecture.

**Pourquoi :** fuites de secrets et dérive de contrat sont des risques récurrents ; Prisma est la source de vérité métier.

---

## 4) Infrastructure, déploiement, exploitation (45 min)

- [ ] `docker-compose.prod.yml` : services, réseaux (`proxy`, interne), volumes, variables requises.
- [ ] `config/domains.sh` + `deploy.sh` + `scripts/deploy-prod.sh` : ordre réel de déploiement et garde-fous.
- [ ] `docs/operations/*` : sauvegardes, volumes, déploiements, supervision — comparer avec scripts.
- [ ] Vérifier présence/absence de Traefik dans compose (doit être externe) et attentes (réseau `proxy`, certresolver).

**Pourquoi :** beaucoup d’incidents viennent de l’ops (DNS, env manquantes, volumes, Coolify non joignable), pas du code applicatif seul.

---

## 5) Qualité, dette et risques (30–60 min)

- [ ] Lire `AGENTS.md` section “Design system & UI” et vérifier l’alignement code si audit UI.
- [ ] Lister **flags/features** documentés (`EFLEX_MULTI_APP`, limites volumes, etc.) et leur implémentation réelle.
- [ ] Parcourir `.github/workflows` : ce qui tourne en CI (TS, Go, schémas, build portail).
- [ ] Noter risques : double chemin Axiom vs Coolify (gel respecté ?), dépendance Coolify API, jobs BullMQ orphelins, migrations Prisma en prod, exposer des infos sensibles dans logs.
- [ ] Tester mentalement les échecs : Coolify down, Redis down, clé chiffrement absente, webhook invalide.

**Pourquoi :** transforme la lecture en **risques priorisés** et en plan d’action.

---

## 6) Sortie attendue de l’analyse (livrable)

Produire (document ou notes structurées) :

1. **Cartographie** (dossiers + responsabilités + dépendances externes).
2. **Diagramme de flux** (texte/ASCII) pour : auth/org, analyse→projet, déploiement asynchrone, événements/notifications.
3. **Tableau “capacité documentée vs code/flags”** (ce qui est vrai aujourd’hui).
4. **Top 10 risques** (sécurité, fiabilité, données, dette) avec impact/probabilité et **actions recommandées** (quick wins vs chantier).
5. **Plan de vérification** : commandes à lancer (`pnpm test`, typechecks, `go test` ciblé si pertinent, checks ops).

---

## 7) Commandes utiles (rappel)

- Racine : `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm typecheck:all`, `pnpm detect`, `pnpm render`.
- Portail : `cd portail && npm run lint && npm run typecheck && npm run build` (selon besoin), Prisma via `npx prisma ...`.
- Go (si Axiom rouvert explicitement) : `cd services/engine && go test ./...` (et autres services concernés).

---

## Justification (pourquoi cette checklist)

- **Évite la confusion historique** : le repo contient à la fois le chemin prod (portail+Coolify) et Axiom gelé ; l’ordre “sources de vérité → zones → flux” force cette séparation.
- **Couvre les ruptures réelles** : la majorité des pannes en prod viennent des flux async (queue/worker/Coolify), des secrets/env et de l’ops (DNS, volumes) — d’où les sections 2, 3, 4.
- **Produit un livrable actionnable** : sans étape 6, l’analyse reste théorique ; le tableau capacités/risques aligne docs et réalité code.
- **Réutilisable** : checklist applicable après chaque gros changement (nouvelle intégration, migration Prisma, refonte déploiement) ou avant audit sécurité.