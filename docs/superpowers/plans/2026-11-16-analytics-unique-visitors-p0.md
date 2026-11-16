# Analytics — Visiteurs uniques quotidiens (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le comptage des **visiteurs uniques par jour** (site/projet), privacy-friendly et sans Cloudflare, dans les analytics first-party du portail EFLEX (collecte, agrégats, API stats/export/config, UI), sans cookie, sans identifiant persistant et sans IP stockée.

**Architecture:** Étendre le socle existant (`ProjectAnalytics`, `TrafficDailyStat`, `AnalyticsEventDaily`, `/api/collect`, routes `/api/projects/[id]/analytics/*`, `project-analytics-tab.tsx`). À chaque page vue comptée, dériver une empreinte éphémère `HMAC-SHA256(sel_journalier, ip + '\0' + user-agent)` (IP lue en mémoire via `getClientIp`, jamais persistée) pour dédupliquer par `(projet, jour UTC)` dans une table d’empreintes quotidienne ; incrémenter des totaux journaliers site (`vues`, `visiteurs`) dans une nouvelle table d’agrégats. L’API stats expose les visiteurs quotidiens et, pour une période, la **somme des uniques quotidiens** (explicitement non dédupliquée entre jours). Les événements nommés (`t=event`) ne créent pas de visiteur.

**Tech Stack:** Next.js 15 App Router (Node runtime), TypeScript, Prisma/PostgreSQL, Zod, Vitest, Tailwind/shadcn UI existante, `node:crypto` (HMAC), limiteurs `@/lib/rate-limit` (`getClientIp`).

**Spec:** Proposition validée dans la conversation (P0 d’abord : visiteurs uniques/jour privacy-friendly ; appareils/référents/pays en phases suivantes). Référentiel produit : `docs/architecture/eflex/README.md`, décision portail→Coolify en vigueur (ADR-0012) — ce changement reste dans le portail (`portail/`) et n’implique pas Axiom.

## Global Constraints

- **Privacy/minimisation (existant à préserver)** : opt-in (`enabled=false` par défaut), pas d’IP brute stockée, pas d’identifiant visiteur persistant, pas de cookie, pas de profilage nominatif/cross-site. L’empreinte visiteur est non réversible, liée au **jour UTC** (sel rotatif quotidien), et ne sert qu’à la déduplication du jour.
- **Collecte publique silencieuse** : `/api/collect` répond toujours `204` sans corps révélateur (clé/état/erreurs/abus) ; CORS/`Cache-Control: no-store` conservés ; rate limits/quota journalier/DNT-GPC conservés.
- **Pas de Cloudflare** : aucune dépendance API/en-tête Cloudflare ; IP via `getClientIp(request)` (`lib/rate-limit.ts`, `TRUSTED_PROXY_HOPS`).
- **Multi-tenant & sécurité** : toutes les routes projet scopées org/projet (`requireManagedProject`/`requireOrg`+`requireProject`/`assertProjectManager`), audit des mutations, rate limiting, jamais de secret exposé. Rétention/purge et suppression couvrent toutes les nouvelles données analytics.
- **Rétrocompatibilité** : snippets/payloads clients existants (`{k,p,t,n}`) continuent de fonctionner ; champs/réponses ajoutés sont additifs.
- **UI/texte** : libellés en français, mention explicite « visiteurs uniques par jour (somme sur la période, non dédupliquée entre jours) ».
- **Outillage portail** : Prisma dans `portail/` (`npx prisma ...` depuis `portail/`), imports relatifs TS avec suffixe `.js` non requis dans portail (suivre style local), tests unitaires portail via `pnpm test` (racine) / vitest config existante.

## Review Focus

- **Même visiteur, plusieurs pages vues le même jour UTC** : compte comme 1 visiteur (site) ce jour-là, mais chaque page vue incrémente les vues (path et site). Un test doit le prouver.
- **Même IP+UA mais jour UTC différent** : compté comme un nouveau visiteur le second jour (sel quotidien), sans réutiliser l’empreinte du jour précédent.
- **Payload/flux événement nommé (`t=event`)** : ne doit ni créer d’empreinte visiteur ni incrémenter les visiteurs/vues site ou path. Régression à verrouiller.
- **Collecte refusée/ignorée (clé invalide, désactivée, DNT/GPC, quota, rate limit, JSON invalide)** : doit rester silencieuse `204` et ne doit pas créer de données visiteur/site.
- **Rétention/purge/suppression/export** : les nouvelles tables (dédup visiteur, totaux site) doivent être purgées selon `retentionDays` et supprimées par le reset/export, sinon fuite de stockage/données.

## File Structure

- **Create:** `portail/prisma/migrations/<timestamp>_analytics_unique_visitors/migration.sql` — ajoute `TrafficDailySiteStat`, `AnalyticsDailyVisitor` (+ index/contraintes/relations).
- **Modify:** `portail/prisma/schema.prisma` — nouveaux modèles + relations sur `Project`.
- **Modify:** `portail/src/lib/analytics.ts` — secret/sel journalier, calcul d’empreinte visiteur, helpers date ISO jour, purge/delete étendus aux nouvelles tables, types partagés si utiles.
- **Modify:** `portail/src/lib/analytics.test.ts` — tests unitaires des nouveaux helpers (sel/empreinte stable par jour+entrée, changement de jour, normalisation inputs, purge/delete couvrent nouvelles tables via contrat/helpers purs).
- **Modify:** `portail/src/app/api/collect/route.ts` — sur page vue comptée : calcul empreinte (IP/UA en mémoire), dédup quotidienne, incrément `TrafficDailySiteStat` (views + visitors conditionnel) ; événements inchangés côté visiteurs.
- **Modify:** `portail/src/app/api/projects/[id]/analytics/stats/route.ts` — requête/agrégation des totaux site, réponse avec visiteurs (total, série par jour, comparaison période précédente, libellé période).
- **Modify:** `portail/src/app/api/projects/[id]/analytics/export/route.ts` — inclure les totaux journaliers site (vues + visiteurs) en JSON/CSV.
- **Modify (si nécessaire):** `portail/src/app/api/projects/[id]/analytics/route.ts` — réponse config inchangée fonctionnellement pour P0 (pas de nouveau flag requis) ; ajuster seulement si un champ d’info utile est ajouté.
- **Modify:** `portail/src/components/project/project-analytics-tab.tsx` — afficher KPI visiteurs, comparaison visiteurs, et visiteurs dans la série quotidienne / info explicative.
- **(Optionnel, seulement si partagé):** `portail/src/lib/` types — éviter de créer un fichier dédié sauf nécessité ; préférer types locaux/retour API existants.

Responsabilité : `analytics.ts` = logique pure & helpers (hash/sel/purge/delete) ; `collect/route.ts` = ingestion et comptage ; routes `stats/export` = lecture agrégée ; UI = présentation.

---

### Task 1: Modèle de données Prisma (totaux site + dédup visiteurs)

**Files:**
- Modify: `portail/prisma/schema.prisma`
- Create: `portail/prisma/migrations/<timestamp>_analytics_unique_visitors/migration.sql`

**Interfaces:**
- Consumes: modèles existants `Project`, `ProjectAnalytics`, `TrafficDailyStat`.
- Produces: `TrafficDailySiteStat` (`projectId,date,views,visitors`, unique par projet+jour), `AnalyticsDailyVisitor` (`projectId,date,hash`, unique par projet+jour+hash) avec relations `Project.trafficSiteStats`, `Project.analyticsDailyVisitors`.

- [ ] **Step 1: Add models and relations in `schema.prisma`**

Add to `model Project` (relations block):
```prisma
  trafficSiteStats      TrafficDailySiteStat[]
  analyticsDailyVisitors AnalyticsDailyVisitor[]
```

Add models (after `TrafficDailyStat` or near analytics models):
```prisma
/// Totaux quotidiens site/projet (vues et visiteurs uniques du jour). Agrégat dérivé des mesures reçues.
model TrafficDailySiteStat {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  /// Jour UTC de la mesure.
  date      DateTime @db.Date
  /// Nombre total de pages vues comptées ce jour.
  views     Int      @default(0)
  /// Nombre de visiteurs uniques comptés ce jour (déduplication privacy-friendly, par jour uniquement).
  visitors  Int      @default(0)

  @@unique([projectId, date])
  @@index([projectId, date])
}

/// Empreinte éphémère de déduplication des visiteurs uniques par jour (hash non réversible, sel quotidien).
/// Ne contient ni IP ni identifiant persistant ; sert uniquement à éviter de recompter un visiteur le même jour.
model AnalyticsDailyVisitor {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  /// Jour UTC concerné.
  date      DateTime @db.Date
  /// Empreinte HMAC hex (64 chars) dérivée de (IP, User-Agent) avec un sel rotatif quotidien.
  hash      String   @db.VarChar(64)

  @@unique([projectId, date, hash])
  @@index([projectId, date])
}
```

- [ ] **Step 2: Create SQL migration matching the schema**

Create `portail/prisma/migrations/<timestamp>_analytics_unique_visitors/migration.sql` (use a UTC timestamp, e.g. `20261116143000_analytics_unique_visitors`) with:

```sql
-- CreateTable
CREATE TABLE "TrafficDailySiteStat" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrafficDailySiteStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyVisitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hash" VARCHAR(64) NOT NULL,

    CONSTRAINT "AnalyticsDailyVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficDailySiteStat_projectId_date_key" ON "TrafficDailySiteStat"("projectId", "date");

-- CreateIndex
CREATE INDEX "TrafficDailySiteStat_projectId_date_idx" ON "TrafficDailySiteStat"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyVisitor_projectId_date_hash_key" ON "AnalyticsDailyVisitor"("projectId", "date", "hash");

-- CreateIndex
CREATE INDEX "AnalyticsDailyVisitor_projectId_date_idx" ON "AnalyticsDailyVisitor"("projectId", "date");

-- AddForeignKey
ALTER TABLE "TrafficDailySiteStat" ADD CONSTRAINT "TrafficDailySiteStat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDailyVisitor" ADD CONSTRAINT "AnalyticsDailyVisitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate schema**

Run (from `portail/`): `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` (or equivalent).

- [ ] **Step 4: Regenerate Prisma client**

Run (from `portail/`): `npx prisma generate`
Expected: client generated without error.

- [ ] **Step 5: Commit**

```bash
git add portail/prisma/schema.prisma portail/prisma/migrations/*_analytics_unique_visitors
git commit -m "feat(analytics): add daily site stats and visitor dedup models (P0)"
```

---

### Task 2: Helpers analytics (sel journalier, empreinte visiteur, purge/delete)

**Files:**
- Modify: `portail/src/lib/analytics.ts`
- Test: `portail/src/lib/analytics.test.ts`

**Interfaces:**
- Consumes: `node:crypto` (`createHmac`), `utcDay` existant.
- Produces: `analyticsVisitorHash(date: Date, ip: string, userAgent: string): string` (hex 64), `analyticsVisitorDayKey(date: Date): string` (ISO `YYYY-MM-DD`, helper), `purgeTrafficStatsForProject`/`deleteAllTrafficStatsForProject` purgent aussi `trafficDailySiteStat` et `analyticsDailyVisitor`.

- [ ] **Step 1: Write failing unit tests for visitor hashing and extended purge contract**

Append to `portail/src/lib/analytics.test.ts`:

```ts
import { createHmac } from 'node:crypto'
import {
  // ...existing imports...
  analyticsVisitorHash,
  analyticsVisitorDayKey,
} from './analytics'

describe('analyticsVisitorDayKey', () => {
  it('formate le jour UTC en YYYY-MM-DD', () => {
    expect(analyticsVisitorDayKey(new Date('2026-11-16T23:59:59.000Z'))).toBe('2026-11-16')
  })
})

describe('analyticsVisitorHash', () => {
  it('retourne une empreinte hex stable pour le même jour, IP et UA', () => {
    const day = new Date('2026-11-16T12:00:00.000Z')
    const a = analyticsVisitorHash(day, '203.0.113.10', 'Mozilla/5.0')
    const b = analyticsVisitorHash(day, '203.0.113.10', 'Mozilla/5.0')
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(a).toBe(b)
  })

  it('change quand l’IP ou le UA change', () => {
    const day = new Date('2026-11-16T12:00:00.000Z')
    const base = analyticsVisitorHash(day, '203.0.113.10', 'Mozilla/5.0')
    expect(analyticsVisitorHash(day, '203.0.113.11', 'Mozilla/5.0')).not.toBe(base)
    expect(analyticsVisitorHash(day, '203.0.113.10', 'curl/8')).not.toBe(base)
  })

  it('change d’un jour UTC à l’autre pour le même visiteur (sel rotatif)', () => {
    const a = analyticsVisitorHash(new Date('2026-11-16T10:00:00.000Z'), '203.0.113.10', 'Mozilla/5.0')
    const b = analyticsVisitorHash(new Date('2026-11-17T10:00:00.000Z'), '203.0.113.10', 'Mozilla/5.0')
    expect(a).not.toBe(b)
  })
})
```

(Add `analyticsVisitorHash`, `analyticsVisitorDayKey` to the named imports from `./analytics` in the test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: FAIL (missing exports `analyticsVisitorHash` / `analyticsVisitorDayKey`).

- [ ] **Step 3: Implement visitor hash helpers in `lib/analytics.ts`**

Add imports: `import { createHmac } from 'node:crypto'`

Add helpers:

```ts
function analyticsVisitorSecret(): string {
  return (
    process.env.ANALYTICS_VISITOR_SECRET ||
    process.env.ENV_ENCRYPTION_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    'eflex-analytics-dev-secret'
  )
}

export function analyticsVisitorDayKey(date = new Date()): string {
  return utcDay(date).toISOString().slice(0, 10)
}

function analyticsDailySalt(dayKey: string): Buffer {
  return createHmac('sha256', analyticsVisitorSecret()).update(`analytics-visitor:${dayKey}`).digest()
}

/**
 * Empreinte non réversible d'un visiteur pour un jour UTC donné.
 * Entrées : IP et User-Agent tels que vus en mémoire (jamais persistés). Le sel
 * quotidien (dérivé d'un secret serveur) empêche le recoupement entre jours.
 */
export function analyticsVisitorHash(date: Date, ip: string, userAgent: string): string {
  const dayKey = analyticsVisitorDayKey(date)
  const salt = analyticsDailySalt(dayKey)
  const data = `${ip}\0${userAgent}`
  return createHmac('sha256', salt).update(data).digest('hex')
}
```

(If `createHmac` is already imported differently, adapt; keep implementation pure/deterministic.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: PASS for the new hashing/day-key tests.

- [ ] **Step 5: Extend purge and delete to cover new tables**

In `purgeTrafficStatsForProject`, extend the Prisma client type and deletion:

```ts
export async function purgeTrafficStatsForProject(
  prisma: Pick<
    PrismaClient,
    'projectAnalytics' | 'trafficDailyStat' | 'analyticsEventDaily' | 'trafficDailySiteStat' | 'analyticsDailyVisitor'
  >,
  projectId: string,
): Promise<number> { ... }
```

Delete `trafficDailySiteStat` and `analyticsDailyVisitor` where `date < cutoff` (in the same `Promise.all`), and sum their counts into the returned total.

In `deleteAllTrafficStatsForProject`, extend type and delete all rows from `trafficDailySiteStat` and `analyticsDailyVisitor` for the project, summing counts.

- [ ] **Step 6: Run analytics unit tests**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add portail/src/lib/analytics.ts portail/src/lib/analytics.test.ts
git commit -m "feat(analytics): add privacy-friendly daily visitor hash helpers and purge coverage (P0)"
```

---

### Task 3: Collecte — comptage visiteurs/vues site (page views)

**Files:**
- Modify: `portail/src/app/api/collect/route.ts`

**Interfaces:**
- Consumes: `analyticsVisitorHash`, `utcDay` (`@/lib/analytics`), `getClientIp` (`@/lib/rate-limit`), modèles Prisma `analyticsDailyVisitor`, `trafficDailySiteStat`, `trafficDailyStat`.
- Produces: sur page vue comptée, incrément de `TrafficDailySiteStat.views` et, si nouvelle empreinte du jour, `TrafficDailySiteStat.visitors` ; dédup via `AnalyticsDailyVisitor` (unique). Événements nommés : comportement inchangé (aucun comptage visiteur/site).

- [ ] **Step 1: Implement pageview site/visitor counting in collect route**

In `POST`, for the `else` (pageview) branch, after/beside existing path stat upsert:

1. Import `analyticsVisitorHash` from `@/lib/analytics` and `getClientIp` from `@/lib/rate-limit`.
2. Compute `ip = getClientIp(request)` and `userAgent = request.headers.get('user-agent') ?? ''` **only when needed for a counted pageview** (before writes that depend on it).
3. Compute `hash = analyticsVisitorHash(date, ip, userAgent)`.
4. Determine if new visitor for `(projectId, date)`:
   - `let isNewVisitor = false`
   - try `await prisma.analyticsDailyVisitor.create({ data: { projectId: config.projectId, date, hash } })` then `isNewVisitor = true`
   - catch Prisma unique error (P2002, code check) => `isNewVisitor = false`; rethrow other errors.
5. Upsert `trafficDailySiteStat` for `(projectId, date)`:
   - create: `{ projectId: config.projectId, date, views: 1, visitors: isNewVisitor ? 1 : 0 }`
   - update: `{ views: { increment: 1 }, ...(isNewVisitor ? { visitors: { increment: 1 } } : {}) }`
6. Keep existing `trafficDailyStat` path upsert and `counted = true`.
7. Keep event branch exactly as-is (no site/visitor counting).

Use a small helper to detect unique violation, e.g. `(e as { code?: string }).code === 'P2002'`, so a race on the same visitor doesn’t fail the request.

(Optional but recommended) Wrap the visitor-hash create + site-stat upsert (and path stat upsert) in a single `prisma.$transaction([...])` for consistency of site counters; if done, keep the `isNewVisitor` determination compatible (e.g. attempt create first, handle P2002 outside by catching and branching, or use `createMany({ skipDuplicates: true })` semantics — choose the simplest correct approach and document in code). The plan requires correctness: same visitor twice in parallel must not increment visitors twice.

- [ ] **Step 2: Manual sanity check (logic review)**

Verify by reading the code:
- event branch: no call to visitor hash/site stat.
- DNT/quota/disabled/key-invalid paths still return `noContent(204)` before any visitor counting.
- `getClientIp`/UA are not logged or stored.

- [ ] **Step 3: Run analytics unit tests**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add portail/src/app/api/collect/route.ts
git commit -m "feat(analytics): count daily unique visitors on pageviews (P0)"
```

---

### Task 4: API stats — exposer visiteurs quotidiens et période

**Files:**
- Modify: `portail/src/app/api/projects/[id]/analytics/stats/route.ts`

**Interfaces:**
- Consumes: `prisma.trafficDailySiteStat` (période courante et précédente), données path existantes.
- Produces (additif): `totalVisitors` (somme des uniques quotidiens sur la période), `days[].visitors`, `comparison.previousVisitors`, `comparison.visitorsChangePct`, `visitorsAggregation: 'sum_daily_unique'` (ou libellé équivalent) pour que l’UI affiche l’avertissement correct. Champs existants conservés.

- [ ] **Step 1: Extend stats query and response**

In `GET`:
- Add `trafficDailySiteStat` queries for current window `[since, ...)` and previous `[previousSince, since)` (select `date, views, visitors`, ordered by date asc).
- Build `siteByDay = Map<dateIso, {views, visitors}>` from current window site stats.
- Compute `totalVisitors = sum(visitors over siteByDay)`. (Keep `total` views as today from path aggregation for backward compat, or also expose `totalViews`; ensure `total` remains page views.)
- Extend `daysSeries` to include `visitors` per day: for each day present in path aggregation **or** site stats, emit `{ date, views, visitors }` (views from path aggregation as today, visitors from site stats or 0). Ensure series is sorted by date.
- Compute previous visitors: `previousVisitors = sum(prev site visitors)`, `previousSiteViews` if useful; add `comparison.visitorsChangePct` (same % formula as views: 100 if previous 0 and current > 0, else 0).
- Return additional fields:
  - `totalVisitors`
  - `visitorsAggregation: 'sum_daily_unique'`
  - `days: [{ date, views, visitors }]`
  - `comparison: { ...existing, previousVisitors, visitorsChangePct }`

Keep all existing fields/shape intact for backward compatibility.

- [ ] **Step 2: Verify by reading response shape**

Ensure `events`, `paths`, `goalEvents`, `installation`, existing `comparison.previousTotal/previousActiveDays/changePct/previousEvents`, and `total/rangeDays` remain present.

- [ ] **Step 3: Commit**

```bash
git add portail/src/app/api/projects/[id]/analytics/stats/route.ts
git commit -m "feat(analytics): expose daily unique visitors in stats API (P0)"
```

---

### Task 5: Export — inclure les totaux journaliers site

**Files:**
- Modify: `portail/src/app/api/projects/[id]/analytics/export/route.ts`

**Interfaces:**
- Consumes: `prisma.trafficDailySiteStat`.
- Produces: JSON inclut `dailyTotals: [{date, views, visitors}]` (et/ou `visitorsAggregation`), CSV inclut des lignes de type `daily_total` (ou équivalent explicite) avec vues/visiteurs par jour. Export reste rétention-appliqué et audité.

- [ ] **Step 1: Extend export data**

- Query `trafficDailySiteStat` for the project ordered by date asc (`date, views, visitors`).
- In JSON response add: `dailyTotals: siteRows.map(...)` with `{ date, views, visitors }` and `visitorsAggregation: 'sum_daily_unique'`.
- In CSV, extend header to `type,date,key,count,visitors,goal` **or** add rows `daily_total,<date>,, <views>,<visitors>,` while keeping existing row types parseable. Prefer a clear additive format: e.g. keep existing columns and add `daily_total` rows with `key` empty, `count` = views, and an extra `visitors` column — if changing header, ensure it’s a deliberate, documented format change. (Alternatively keep header and encode as `daily_total,<date>,site,<views>,` and add a separate visitors column at end; choose the simplest unambiguous form and keep `pageview`/`event` rows backward-compatible where possible.)
- Audit `details` can include `dailyTotalRows`.

- [ ] **Step 2: Commit**

```bash
git add portail/src/app/api/projects/[id]/analytics/export/route.ts
git commit -m "feat(analytics): include daily unique visitors in analytics export (P0)"
```

---

### Task 6: UI — afficher les visiteurs uniques

**Files:**
- Modify: `portail/src/components/project/project-analytics-tab.tsx`

**Interfaces:**
- Consumes: champs stats additifs `totalVisitors`, `days[].visitors`, `comparison.previousVisitors`, `comparison.visitorsChangePct`, `visitorsAggregation`.
- Produces: KPI « Visiteurs » (période, somme des uniques quotidiens), évolution visiteurs, série quotidienne affichant vues et visiteurs, texte explicatif clair.

- [ ] **Step 1: Update stats types and fetch handling in the component**

Extend the local `Stats`/day/comparison types to include optional/new fields:
- `totalVisitors: number`
- `visitorsAggregation?: string`
- `days: { date: string; views: number; visitors?: number }[]`
- `comparison: { ..., previousVisitors?: number; visitorsChangePct?: number }`

Default missing visitors to `0` when reading (for robustness).

- [ ] **Step 2: Add visitors KPI and comparison**

- Add a KPI card for **Visiteurs** showing `stats.totalVisitors` over the period, with helper text like « uniques/jour (somme sur la période) ».
- Show visitor trend vs previous period using `visitorsChangePct`/`previousVisitors` (same up/down/flat pattern as views).
- Keep existing page-view KPIs.

- [ ] **Step 3: Show visitors in daily evolution**

In the daily bars/list, display both views and visitors per day (e.g. « X vues · Y visiteurs » or a secondary bar/value), using `day.visitors ?? 0`.

- [ ] **Step 4: Update info notice**

Adjust the privacy/measurement notice to state that unique visitors per day are now measured in a privacy-friendly way (no cookie, no persistent ID, no stored IP) and that the period total is the sum of daily uniques (not deduplicated across days). Keep the note that referrers/devices/countries/sessions are still not collected.

- [ ] **Step 5: Commit**

```bash
git add portail/src/components/project/project-analytics-tab.tsx
git commit -m "feat(analytics): display daily unique visitors in project analytics UI (P0)"
```

---

### Task 7: Vérification finale

**Files:**
- Test: `portail/src/lib/analytics.test.ts` (and any new unit tests added)

- [ ] **Step 1: Run analytics unit tests**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 2: Run targeted typecheck for portail (if quick)**

Run (from `portail/`): `npm run typecheck`
Expected: no new TypeScript errors from analytics changes. (If unrelated pre-existing errors appear, report them without masking.)

- [ ] **Step 3: Run lint on touched files if feasible**

Run (from `portail/`): `npm run lint`
Expected: clean for changed files (respect `--max-warnings=0`).

- [ ] **Step 4: Manual review checklist**

- [ ] Pageview counted → site views +1, visitors +1 only on first hash of that (project,day); same visitor same day → visitors unchanged.
- [ ] Different UTC day → visitors +1 again for same visitor.
- [ ] Event payload → no visitor/site stat changes.
- [ ] Rejected/ignored collect (invalid key, disabled, DNT, quota) → no visitor data written.
- [ ] Purge/delete/export include `TrafficDailySiteStat` and `AnalyticsDailyVisitor`.
- [ ] UI labels state “uniques par jour (somme sur la période)”.

- [ ] **Step 5: Final commit (if any fixups)**

```bash
git add -A
git commit -m "chore(analytics): finalize unique visitors P0"
```

(Only if there are remaining changes; otherwise skip.)

## Notes d’exécution

- Migration : créer le dossier de migration avec un timestamp cohérent et appliquer en environnement cible via le flux Prisma habituel (`prisma migrate dev/deploy` selon contexte) — ne pas exécuter de migration destructive.
- Secret de hachage : `ANALYTICS_VISITOR_SECRET` prioritaire si défini, sinon dérivation à partir des secrets serveur existants ; le sel **quotidien** est dérivé (jamais exposé). Documenter si une variable dédiée est ajoutée.
- Concurrence : la dédup repose sur l’unicité `(projectId,date,hash)` ; gérer `P2002` comme “déjà compté”.
- Portée P0 : visiteurs uniques site/jour uniquement. Appareils, navigateurs/OS, référents, pays, UTM restent pour P1/P2 (modèles/API/UI supplémentaires).
- Hors périmètre : déduplication multi-jours, sessions, rebond, durée, temps réel.

## Execution Handoff

After saving and self-reviewing the plan, ask the user to review and choose execution approach (subagent-driven vs native) before implementation, unless they have already explicitly asked to proceed with implementation in this session. If they explicitly asked to proceed, confirm the plan captures intent and begin implementation task-by-task using TDD.
