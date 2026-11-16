# Analytics — Pays (GeoIP locale, P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la répartition par **pays** aux analytics EFLEX, dérivée côté serveur via une base **GeoIP locale (MaxMind GeoLite2 Country, `.mmdb`)** sans Cloudflare, de façon optionnelle et gracieuse (IP jamais stockée, agrégat quotidien uniquement).

**Architecture:** Étendre le pipeline de dimensions existant (P1 : `TrafficDailyDimension`, `AnalyticsDailyDimensionVisitor`, stats/export/UI). Ajouter `ProjectAnalytics.collectCountry` et une résolution pays en mémoire à partir de `GEOIP_DB_PATH` (lecteur `maxmind`, mis en cache par processus). Sur page vue, si la collecte pays est active et la base disponible, déterminer le code ISO pays (ou `Inconnu`) et enregistrer la dimension `country` (vues + visiteurs uniques/jour du segment) avec la même dédup empreinte journalière. Si la base est absente/invalide/indisponible, ignorer silencieusement la dimension pays sans impacter le reste de la collecte.

**Tech Stack:** Next.js 15, TypeScript, Prisma/PostgreSQL, Zod, Vitest, `maxmind` (lecteur mmdb).

**Spec:** P2 validé en conversation : pays via GeoIP locale, `GEOIP_DB_PATH`, pas de Cloudflare, IP utilisée en mémoire uniquement puis écartée, disponibilité gracieuse, `npm install maxmind` dans `portail/`.

## Global Constraints

- **Privacy/minimisation** : IP jamais stockée ni journalisée pour l’analytics ; uniquement le code pays agrégé par jour/segment. Opt-in, DNT/GPC, pas de cookie/identifiant persistant/cross-site, conservés.
- **Sans Cloudflare** : aucune API/en-tête Cloudflare ; résolution via fichier `.mmdb` local.
- **Gracieux** : absence/échec de lecture du fichier ou de lookup ne doit pas faire échouer `/api/collect` ni bloquer les autres dimensions/compteurs.
- **Rétrocompatibilité** : payload/snippet inchangés ; config/stats/export additifs (`countries`, `collectCountry`, lignes dimension `country`).
- **Multi-tenant & sécurité** : routes scopées, audit config, purge/suppression/export couvrent la dimension `country` (déjà via tables de dimensions).
- **Exploitation** : fournir/monter `GeoLite2-Country.mmdb` et définir `GEOIP_DB_PATH` en déploiement ; mise à jour de la base hors requête (hors automatisme de ce lot).

## Review Focus

- **`GEOIP_DB_PATH` absent ou fichier manquant/invalide** : collecte continue, aucune donnée `country` créée, pas d’erreur 500 côté collecte.
- **IP privée/locale/inconnue ou lookup sans pays** : valeur normalisée stable (ex. `Inconnu`) plutôt qu’échec.
- **Même visiteur, pays résolu, même jour/segment** : visiteurs `country` dédupliqués comme les autres dimensions (une seule fois par `(projet,jour,country,valeur,hash)`).
- **`collectCountry=false`** : aucune dimension pays enregistrée même si la base est disponible.
- **Config/stats/UI** : exposent l’état de dispo de la base (`countryAvailable` ou équivalent) pour afficher clairement quand la collecte pays est activée mais la base indisponible.

## File Structure

- **Modify:** `portail/package.json`, `portail/package-lock.json` — dépendance `maxmind` (déjà installée dans l’environnement de travail).
- **Modify:** `portail/prisma/schema.prisma` — `ProjectAnalytics.collectCountry Boolean @default(true)`.
- **Create:** `portail/prisma/migrations/<timestamp>_analytics_country_p2/migration.sql` — colonne `collectCountry`.
- **Modify:** `portail/src/lib/analytics.ts` — config schema, helper de lookup pays (`analyticsCountryAvailability`, `resolveAnalyticsCountry(ip)` avec cache lecteur), constantes/normalisation valeur pays.
- **Modify:** `portail/src/lib/analytics.test.ts` — normalisation/valeur inconnue, config flag.
- **Modify:** `portail/src/app/api/projects/[id]/analytics/route.ts` — sérialise/écrit `collectCountry`, expose disponibilité pays.
- **Modify:** `portail/src/app/api/collect/route.ts` — sélection `collectCountry`, enregistre dimension `country` si activée et résolue.
- **Modify:** `portail/src/app/api/projects/[id]/analytics/stats/route.ts` — `countries` via `topDimension('country')`.
- **Modify:** `portail/src/components/project/project-analytics-tab.tsx` — toggle collectCountry, section Pays, info disponibilité base.
- **(Docs optionnel):** `docs/operations/analytics.md` — mention pays GeoIP locale/`GEOIP_DB_PATH`/limites (si temps).

---

### Task 1: Schéma & migration (`collectCountry`)

**Files:** `portail/prisma/schema.prisma`, `portail/prisma/migrations/<ts>_analytics_country_p2/migration.sql`

- [ ] **Step 1:** Ajouter `collectCountry Boolean @default(true)` à `ProjectAnalytics` (près de `collectDevice`).
- [ ] **Step 2:** Créer migration SQL `ALTER TABLE "ProjectAnalytics" ADD COLUMN "collectCountry" BOOLEAN NOT NULL DEFAULT true;`
- [ ] **Step 3:** `cd portail && npx prisma validate && npx prisma generate` — succès.
- [ ] **Step 4:** Commit.

### Task 2: Lib analytics — lookup pays, config, disponibilité

**Files:** `portail/src/lib/analytics.ts`, `portail/src/lib/analytics.test.ts`

**Interfaces:**
- Produces: `normalizeAnalyticsCountry(code: string | null | undefined): string` (`'Inconnu'` si vide/invalide, sinon code ISO uppercased borné) ; `analyticsGeoipPath(): string | null`; `isAnalyticsCountryAvailable(): Promise<boolean>` ; `resolveAnalyticsCountry(ip: string): Promise<string | null>` (null si indisponible/échec, sinon code normalisé). Cache lecteur `maxmind` par processus (lazy, réessaie après échec après délai pour permettre montage tardif). `analyticsConfigUpdateSchema` accepte `collectCountry`.

- [ ] **Step 1:** Écrire tests (normalisation pays `FR`/vide/unknown, config accepte `collectCountry`).
- [ ] **Step 2:** Lancer `pnpm vitest run portail/src/lib/analytics.test.ts` — échec attendu.
- [ ] **Step 3:** Implémenter helpers + import dynamique/lazy `maxmind` (éviter crash si module/path KO) ; `resolveAnalyticsCountry` retourne null si `GEOIP_DB_PATH` absent ou lookup impossible, sinon `normalizeAnalyticsCountry(reader.get(ip)?.country?.iso_code ?? null)` ; `isAnalyticsCountryAvailable` basé sur ouverture réussie.
- [ ] **Step 4:** Étendre `analyticsConfigUpdateSchema` avec `collectCountry` et refine.
- [ ] **Step 5:** `pnpm vitest run portail/src/lib/analytics.test.ts` — PASS.
- [ ] **Step 6:** Commit.

### Task 3: Config API

**Files:** `portail/src/app/api/projects/[id]/analytics/route.ts`

- [ ] **Step 1:** `serializeConfig` inclut `collectCountry` et `countryAvailable` (bool via `isAnalyticsCountryAvailable()`).
- [ ] **Step 2:** GET défaut inclut `collectCountry: true`, `countryAvailable`.
- [ ] **Step 3:** PUT gère `collectCountry` (data/create/audit).
- [ ] **Step 4:** Commit.

### Task 4: Collecte dimension country

**Files:** `portail/src/app/api/collect/route.ts`

- [ ] **Step 1:** Sélectionner `collectCountry` dans la config.
- [ ] **Step 2:** En pageview, si `config.collectCountry`, `country = await resolveAnalyticsCountry(ip)` ; si `country` non null, ajouter `{ dimension: 'country', value: country }` aux dimensions (réutiliser boucle de dédup/upsert existante).
- [ ] **Step 3:** S’assurer qu’une indisponibilité/exception de lookup ne casse pas la requête (déjà dans try/catch global, mais helper doit retourner null plutôt que throw).
- [ ] **Step 4:** Commit.

### Task 5: Stats & export

**Files:** `portail/src/app/api/projects/[id]/analytics/stats/route.ts`

- [ ] **Step 1:** Ajouter `countries: topDimension('country')` à la réponse stats.
- [ ] **Step 2:** Export : aucun changement structurel requis si on exporte toutes les lignes `trafficDailyDimension` (vérifier) ; sinon inclure `country` explicitement. S’assurer que `countries`/dimension `country` apparaissent.
- [ ] **Step 3:** Commit.

### Task 6: UI

**Files:** `portail/src/components/project/project-analytics-tab.tsx`

- [ ] **Step 1:** Types config/stats : `collectCountry?`, `countryAvailable?`, `countries?: DimensionStat[]`.
- [ ] **Step 2:** Toggle “Pays (GeoIP locale)” avec indication si base indisponible (`countryAvailable === false`).
- [ ] **Step 3:** Carte “Pays” dans les répartitions (vues + visiteurs uniques/jour du segment).
- [ ] **Step 4:** Notice : pays collecté si activé et base disponible ; UTM/sessions toujours non collectés.
- [ ] **Step 5:** Commit.

### Task 7: Vérification

- [ ] **Step 1:** `pnpm vitest run portail/src/lib/analytics.test.ts` — PASS.
- [ ] **Step 2:** `cd portail && npx prisma validate` — PASS.
- [ ] **Step 3:** `cd portail && npm run typecheck` — no new errors.
- [ ] **Step 4:** Checklist : sans `GEOIP_DB_PATH` la collecte fonctionne et ne crée pas de country ; avec base+flag on, dimension country agrégée ; `collectCountry=false` ignore ; export/stats incluent `country`.

## Notes
- `maxmind` ajouté dans `portail/package.json`/lock (npm). Reader chargé paresseusement et mis en cache ; en cas d’échec, réessayer après un délai pour tolérer un montage tardif.
- Pas d’auto-téléchargement GeoLite2 dans ce lot ; documenter `GEOIP_DB_PATH` et la mise à jour de la base.
- Valeurs pays bornées (code ISO ou `Inconnu`) — pas de nom libre.

## Execution Handoff

Utilisateur a confirmé l’approche : implémenter P2 task-by-task après sauvegarde du plan.
