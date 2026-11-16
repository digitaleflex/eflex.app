# Analytics — Appareils, navigateurs/OS et référents (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter les répartitions P1 aux analytics first-party EFLEX — **sources/référents**, **appareils**, **navigateurs** et **systèmes d’exploitation** — avec pages vues et visiteurs uniques par jour par segment, sans Cloudflare, en conservant le modèle privacy-friendly (agrégation quotidienne, pas d’IP/UA/référent brut stockés).

**Architecture:** Étendre P0 (`TrafficDailySiteStat`, `AnalyticsDailyVisitor`, `/api/collect`, stats/export/config/UI). Le snippet envoie le référent de page (`r`). Le serveur normalise le référent (domaine ou `direct`) et classe le `User-Agent` en catégories bornées (device/browser/os) via un parseur interne léger (`lib/analytics.ts`). Pour chaque page vue comptée, en plus des compteurs existants, on incrémente des agrégats journaliers par dimension (`TrafficDailyDimension`) et on déduplique les visiteurs par segment/jour avec la même empreinte HMAC quotidienne (`AnalyticsDailyDimensionVisitor`, unique par projet/jour/dimension/valeur/hash). L’API stats renvoie les top valeurs par dimension ; l’UI les affiche.

**Tech Stack:** Next.js 15, TypeScript, Prisma/PostgreSQL, Zod, Vitest, Node (pas de dépendance UA-parser externe).

**Spec:** P1 validé en conversation (référent via snippet normalisé en domaine/`direct`, UA classé côté serveur en catégories bornées, visiteurs uniques calculés aussi par dimension/jour, sans Cloudflare). S’appuie sur P0 (`docs/superpowers/plans/2026-11-16-analytics-unique-visitors-p0.md`).

## Global Constraints

- **Privacy/minimisation** : opt-in, pas d’IP brute, pas d’identifiant persistant, pas de cookie, pas de profilage/cross-site. Ne jamais stocker `User-Agent`, IP ou URL référente complète : uniquement catégories bornées (`device/browser/os`) et domaine/origine référente normalisée (ou `direct`).
- **Collecte publique silencieuse** : `/api/collect` toujours `204` sans corps révélateur ; CORS/cache/rate limits/quota/DNT-GPC conservés.
- **Sans Cloudflare** : classification UA et normalisation référent faites côté portail, aucune API/en-tête Cloudflare.
- **Rétrocompatibilité** : snippets/payloads sans `r` restent valides ; nouveaux champs config/stats/export additifs ; chemins (`TrafficDailyStat`) inchangés.
- **Multi-tenant & sécurité** : routes scopées org/projet, audit des mutations config, purge/suppression/export couvrent toutes les nouvelles données.
- **UI/texte** : français ; indiquer que les visiteurs par dimension sont des uniques/jour sur le segment (somme période = somme des uniques quotidiens du segment).

## Review Focus

- **Référent vide/absent** : normalisé en `direct` (ou libellé équivalent stable, ex. `(direct)`) et compté ; ne jamais stocker l’URL complète.
- **Même visiteur, deux navigateurs/appareils le même jour** : peut compter comme visiteur dans plusieurs segments de dimensions différentes (et dans les deux buckets si les valeurs diffèrent), mais pas deux fois dans le même `(jour, dimension, valeur)`.
- **Collecte dimension désactivée** (`collectReferrer=false` ou `collectDevice=false`) : ne pas enregistrer d’agrégats/dédup pour les dimensions concernées, tout en continuant vues/visiteurs globaux et chemins selon config.
- **Payload ancien sans `r`** : accepté ; référent traité comme direct quand la collecte référent est active.
- **Purge/delete/export** : nouvelles tables `TrafficDailyDimension` et `AnalyticsDailyDimensionVisitor` incluses, sinon fuite de données/stockage.

## File Structure

- **Modify:** `portail/prisma/schema.prisma` — flags `collectReferrer`, `collectDevice` sur `ProjectAnalytics`; modèles `TrafficDailyDimension`, `AnalyticsDailyDimensionVisitor`; relations `Project`.
- **Create:** `portail/prisma/migrations/<timestamp>_analytics_dimensions_p1/migration.sql`.
- **Modify:** `portail/src/lib/analytics.ts` — schéma payload (`r`), schéma config update (flags), parseur UA (`parseUserAgent` → `{device,browser,os}`), normalisation référent (`normalizeAnalyticsReferrer`), constantes de dimensions, extension `purgeTrafficStatsForProject`/`deleteAllTrafficStatsForProject`, `buildAnalyticsSnippet` inclut `r`.
- **Modify:** `portail/src/lib/analytics.test.ts` — tests parseur UA, normalisation référent, payload avec `r`, snippet inclut `r`, config flags.
- **Modify:** `portail/src/app/api/collect/route.ts` — lit `r`, calcule catégories/referrer, enregistre agrégats+déddup par dimension selon flags.
- **Modify:** `portail/src/app/api/projects/[id]/analytics/route.ts` — sérialise/écrit `collectReferrer`, `collectDevice`.
- **Modify:** `portail/src/app/api/projects/[id]/analytics/stats/route.ts` — retourne `referrers`, `devices`, `browsers`, `operatingSystems` (top N `{value,views,visitors}`).
- **Modify:** `portail/src/app/api/projects/[id]/analytics/export/route.ts` — exporte les dimensions.
- **Modify:** `portail/src/components/project/project-analytics-tab.tsx` — réglages collecte dimensions, affichage des répartitions (vues+visiteurs), notice mise à jour.

---

### Task 1: Schéma Prisma (flags + tables de dimensions)

**Files:**
- Modify: `portail/prisma/schema.prisma`
- Create: `portail/prisma/migrations/<timestamp>_analytics_dimensions_p1/migration.sql`

**Interfaces:**
- Produces: `ProjectAnalytics.collectReferrer Boolean @default(true)`, `collectDevice Boolean @default(true)`; `TrafficDailyDimension` (unique projet/jour/dimension/valeur, views/visitors), `AnalyticsDailyDimensionVisitor` (unique projet/jour/dimension/valeur/hash) avec relations Project.

- [ ] **Step 1: Update `ProjectAnalytics` in `schema.prisma`**

Add fields (near `collectPath`/`retentionDays`):
```prisma
  /// Collecte agrégée du référent (domaine/source) sur les pages vues.
  collectReferrer Boolean @default(true)
  /// Collecte agrégée appareil/navigateur/OS (dérivés du User-Agent) sur les pages vues.
  collectDevice   Boolean @default(true)
```

- [ ] **Step 2: Add dimension models and Project relations**

Add to `Project`:
```prisma
  trafficDimensions      TrafficDailyDimension[]
  analyticsDimensionVisitors AnalyticsDailyDimensionVisitor[]
```

Add models:
```prisma
/// Agrégat quotidien par dimension (référent, appareil, navigateur, OS). Valeurs bornées/normalisées, sans donnée brute.
model TrafficDailyDimension {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  date      DateTime @db.Date
  /// Dimension : referrer | device | browser | os
  dimension String   @db.VarChar(32)
  /// Valeur normalisée (domaine, direct, desktop/mobile/..., nom navigateur/OS).
  value     String   @db.VarChar(255)
  views     Int      @default(0)
  visitors  Int      @default(0)

  @@unique([projectId, date, dimension, value])
  @@index([projectId, date, dimension])
}

/// Déduplication visiteurs uniques par segment de dimension et par jour (même empreinte journalière que P0).
model AnalyticsDailyDimensionVisitor {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  date      DateTime @db.Date
  dimension String   @db.VarChar(32)
  value     String   @db.VarChar(255)
  hash      String   @db.VarChar(64)

  @@unique([projectId, date, dimension, value, hash])
  @@index([projectId, date, dimension])
}
```

- [ ] **Step 3: Create migration SQL**

Create `portail/prisma/migrations/<timestamp>_analytics_dimensions_p1/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "ProjectAnalytics" ADD COLUMN "collectReferrer" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProjectAnalytics" ADD COLUMN "collectDevice" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TrafficDailyDimension" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dimension" VARCHAR(32) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TrafficDailyDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyDimensionVisitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dimension" VARCHAR(32) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    CONSTRAINT "AnalyticsDailyDimensionVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficDailyDimension_projectId_date_dimension_value_key" ON "TrafficDailyDimension"("projectId", "date", "dimension", "value");
CREATE INDEX "TrafficDailyDimension_projectId_date_dimension_idx" ON "TrafficDailyDimension"("projectId", "date", "dimension");
CREATE UNIQUE INDEX "AnalyticsDailyDimensionVisitor_projectId_date_dimension_val_key" ON "AnalyticsDailyDimensionVisitor"("projectId", "date", "dimension", "value", "hash");
CREATE INDEX "AnalyticsDailyDimensionVisitor_projectId_date_dimension_idx" ON "AnalyticsDailyDimensionVisitor"("projectId", "date", "dimension");

-- AddForeignKey
ALTER TABLE "TrafficDailyDimension" ADD CONSTRAINT "TrafficDailyDimension_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalyticsDailyDimensionVisitor" ADD CONSTRAINT "AnalyticsDailyDimensionVisitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
(Respecter la limite de nom d’index Postgres : si nécessaire, raccourcir le nom de l’index unique de `AnalyticsDailyDimensionVisitor` en gardant les colonnes identiques.)

- [ ] **Step 4: Validate & generate**

Run in `portail/`: `npx prisma validate` then `npx prisma generate`. Expected: success.

- [ ] **Step 5: Commit**

```bash
git add portail/prisma/schema.prisma portail/prisma/migrations/*_analytics_dimensions_p1
git commit -m "feat(analytics): add referrer and device dimension models (P1)"
```

---

### Task 2: Librairie analytics — référent, UA, payload/snippet/config, purge/delete

**Files:**
- Modify: `portail/src/lib/analytics.ts`
- Test: `portail/src/lib/analytics.test.ts`

**Interfaces:**
- Produces: `normalizeAnalyticsReferrer(input: unknown): string` → domaine normalisé ou `direct`; `parseAnalyticsUserAgent(ua: string): { device: string; browser: string; os: string }` avec catégories bornées ; `collectPayloadSchema` accepte `r`; `analyticsConfigUpdateSchema` accepte `collectReferrer`, `collectDevice`; `buildAnalyticsSnippet` inclut `r` (`document.referrer`), variante consentement idem ; purge/delete couvrent `trafficDailyDimension` et `analyticsDailyDimensionVisitor`.

- [ ] **Step 1: Write failing tests (referer, UA, payload r, snippet r, config flags)**

In `analytics.test.ts` add imports and tests:
```ts
import { normalizeAnalyticsReferrer, parseAnalyticsUserAgent } from './analytics'

describe('normalizeAnalyticsReferrer', () => {
  it('retourne direct si absent/vide', () => {
    expect(normalizeAnalyticsReferrer('')).toBe('direct')
    expect(normalizeAnalyticsReferrer(undefined)).toBe('direct')
  })
  it('extrait le domaine d’une URL', () => {
    expect(normalizeAnalyticsReferrer('https://www.google.com/search?q=eflex')).toBe('www.google.com')
  })
  it('normalise en minuscules et borne', () => {
    expect(normalizeAnalyticsReferrer('HTTPS://NEWS.YCOMBINATOR.COM/item')).toBe('news.ycombinator.com')
  })
})

describe('parseAnalyticsUserAgent', () => {
  it('détecte mobile iOS Safari', () => {
    const r = parseAnalyticsUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    expect(r.device).toBe('mobile')
    expect(r.os).toBe('iOS')
    expect(r.browser).toBe('Safari')
  })
  it('détecte desktop Chrome Windows', () => {
    const r = parseAnalyticsUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    expect(r.device).toBe('desktop')
    expect(r.os).toBe('Windows')
    expect(r.browser).toBe('Chrome')
  })
  it('retombe sur other/autre si inconnu', () => {
    const r = parseAnalyticsUserAgent('')
    expect(['desktop','mobile','tablet','other']).toContain(r.device)
    expect(typeof r.browser).toBe('string')
    expect(typeof r.os).toBe('string')
  })
})
```

Update existing tests:
- `collectPayloadSchema` accepts `{ k, p, r: 'https://google.com/' }` (pageview).
- `analyticsConfigUpdateSchema` accepts `{ collectReferrer: false }` and `{ collectDevice: true }` and refuses empty object as before.
- `buildAnalyticsSnippet` output contains `document.referrer` and includes `r` in payload (e.g. `,r:` or `"r"`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: FAIL (missing exports/behavior).

- [ ] **Step 3: Implement referrer normalization and UA parser**

Add in `analytics.ts`:
```ts
const REFERRER_DIRECT = 'direct'

export function normalizeAnalyticsReferrer(input: unknown): string {
  if (typeof input !== 'string') return REFERRER_DIRECT
  const raw = input.trim()
  if (!raw) return REFERRER_DIRECT
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`)
    let host = url.hostname.toLowerCase().replace(/\.$/, '')
    host = host.replace(/[\u0000-\u001f\u007f]/g, '')
    if (!host) return REFERRER_DIRECT
    if (host.length > 255) host = host.slice(0, 255)
    return host
  } catch {
    return REFERRER_DIRECT
  }
}

export type AnalyticsUaInfo = { device: 'desktop' | 'mobile' | 'tablet' | 'other'; browser: string; os: string }

export function parseAnalyticsUserAgent(ua: string): AnalyticsUaInfo {
  const s = ua || ''
  const isTablet = /ipad|tablet|playbook|silk/i.test(s) || (/android/i.test(s) && !/mobile/i.test(s))
  const isMobile = !isTablet && /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|bb10/i.test(s)
  const device: AnalyticsUaInfo['device'] = isTablet ? 'tablet' : isMobile ? 'mobile' : s ? 'desktop' : 'other'

  let os = 'Autre'
  if (/windows nt/i.test(s)) os = 'Windows'
  else if (/iphone|ipad|ipod|ios/i.test(s)) os = 'iOS'
  else if (/mac os x|macintosh/i.test(s) && !/iphone|ipad|ipod/i.test(s)) os = 'macOS'
  else if (/android/i.test(s)) os = 'Android'
  else if (/linux/i.test(s)) os = 'Linux'
  else if (/cros/i.test(s)) os = 'ChromeOS'

  let browser = 'Autre'
  if (/edg\//i.test(s)) browser = 'Edge'
  else if (/opr\//i.test(s) || /opera/i.test(s)) browser = 'Opera'
  else if (/samsungbrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/firefox|fxios/i.test(s)) browser = 'Firefox'
  else if (/crios/i.test(s)) browser = 'Chrome'
  else if (/chrome\//i.test(s) && !/edg\//i.test(s) && !/opr\//i.test(s)) browser = 'Chrome'
  else if (/safari/i.test(s) && !/chrome|crios|android/i.test(s)) browser = 'Safari'

  return { device, browser, os }
}
```
(Adjust rules as needed for reasonable accuracy; keep outputs bounded to known labels/strings.)

- [ ] **Step 4: Extend payload, config schema, snippet, and purge/delete**

- `collectPayloadSchema`: add `r: z.string().max(2048).optional()` (referrer, pageview only in practice; ignored for events server-side).
- `analyticsConfigUpdateSchema`: add `collectReferrer: z.boolean().optional()`, `collectDevice: z.boolean().optional()` and include them in the refine “Aucune modification fournie”.
- `buildAnalyticsSnippet`: include referrer in sent payload: read `var r="";try{r=document.referrer||""}catch(_){}` and add `r:r` to `d` (e.g. `{k:...,p:location.pathname,t:"pageview",r:r}`). Apply in both default and consent-gated bodies.
- `purgeTrafficStatsForProject` / `deleteAllTrafficStatsForProject`: extend Prisma pick types and delete `trafficDailyDimension` and `analyticsDailyDimensionVisitor` (by `date < cutoff` for purge, all for delete), include counts in returned total.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add portail/src/lib/analytics.ts portail/src/lib/analytics.test.ts
git commit -m "feat(analytics): add referrer/UA normalization, snippet referrer, and dimension config (P1)"
```

---

### Task 3: API config — collectReferrer/collectDevice

**Files:**
- Modify: `portail/src/app/api/projects/[id]/analytics/route.ts`

**Interfaces:**
- Produces: GET/PUT config inclut `collectReferrer`, `collectDevice` (défaut true).

- [ ] **Step 1: Update serialize, GET defaults, PUT create/update**

- `serializeConfig` accepts and returns `collectReferrer`, `collectDevice`.
- GET default (no config): include `collectReferrer: true, collectDevice: true`.
- PUT `data` type + mapping: handle `parsed.data.collectReferrer/collectDevice`.
- Create defaults: `collectReferrer: data.collectReferrer ?? true`, `collectDevice: data.collectDevice ?? true`.
- Audit changes: include flags when provided.

- [ ] **Step 2: Commit**

```bash
git add portail/src/app/api/projects/[id]/analytics/route.ts
git commit -m "feat(analytics): expose referrer/device collection flags in config API (P1)"
```

---

### Task 4: Collecte — agrégats et visiteurs par dimension

**Files:**
- Modify: `portail/src/app/api/collect/route.ts`

**Interfaces:**
- Consumes: `normalizeAnalyticsReferrer`, `parseAnalyticsUserAgent` from `@/lib/analytics`; config `collectReferrer`, `collectDevice`; `analyticsDailyDimensionVisitor`, `trafficDailyDimension`.
- Produces: pour chaque page vue comptée, selon flags, incrémente vues/visiteurs (dédup hash par segment/jour) pour `referrer`, et pour `device`/`browser`/`os`.

- [ ] **Step 1: Load config flags and compute dimensions on pageview**

In config select add `collectReferrer: true, collectDevice: true`.
In pageview branch (after hash computed), build list of `{dimension, value}`:
- if `config.collectReferrer`: `[{ dimension: 'referrer', value: normalizeAnalyticsReferrer(r) }]`
- if `config.collectDevice`: UA info → `{dimension:'device',value:device}`, `{dimension:'browser',value:browser}`, `{dimension:'os',value:os}`

- [ ] **Step 2: Upsert dimension aggregates with per-segment visitor dedup**

For each dimension entry:
- try create `analyticsDailyDimensionVisitor` `{ projectId, date, dimension, value, hash }`; `isNewSeg = true` on success, false on P2002, rethrow otherwise.
- upsert `trafficDailyDimension` on `(projectId,date,dimension,value)` incrementing `views` and `visitors` if `isNewSeg`.

Perform sequentially or in a small loop (4 entries max). Keep inside the existing try/catch that returns silent 204 on error. Ensure global P0 counting remains unchanged.

- [ ] **Step 3: Run analytics tests**

Run: `pnpm vitest run portail/src/lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add portail/src/app/api/collect/route.ts
git commit -m "feat(analytics): collect referrer and device/browser/os dimensions (P1)"
```

---

### Task 5: Stats & export — dimensions

**Files:**
- Modify: `portail/src/app/api/projects/[id]/analytics/stats/route.ts`
- Modify: `portail/src/app/api/projects/[id]/analytics/export/route.ts`

**Interfaces:**
- Produces (stats): `referrers`, `devices`, `browsers`, `operatingSystems` arrays of `{ value, views, visitors }` (top 20, triés par vues desc) sur la période.
- Produces (export): JSON `dimensions` (ou clés dédiées) + lignes CSV typées (ex. `dimension,<date>,<dimension>:<value>,<views>,<visitors>,` ou format clair) ; audit détail mis à jour.

- [ ] **Step 1: Stats — query and aggregate `trafficDailyDimension`**

Fetch `trafficDailyDimension` for period grouped in app logic: accumulate by `(dimension,value)` sums of views/visitors. Return top 20 per dimension:
```ts
referrers: [...],
devices: [...],
browsers: [...],
operatingSystems: [...], // dimension 'os'
```
(Keep response additive.)

- [ ] **Step 2: Export — include dimensions**

Query all `trafficDailyDimension` rows for project (retention applied). Add to JSON (e.g. `dimensions: { referrer: [], device: [], browser: [], os: [] }` or flat rows with date/dimension/value/views/visitors). Add CSV rows per dimension (format explicite et stable).

- [ ] **Step 3: Commit**

```bash
git add portail/src/app/api/projects/[id]/analytics/stats/route.ts portail/src/app/api/projects/[id]/analytics/export/route.ts
git commit -m "feat(analytics): expose and export referrer/device dimensions in stats (P1)"
```

---

### Task 6: UI — réglages et affichage des dimensions

**Files:**
- Modify: `portail/src/components/project/project-analytics-tab.tsx`

**Interfaces:**
- Consumes: config `collectReferrer`, `collectDevice`; stats `referrers`, `devices`, `browsers`, `operatingSystems`.
- Produces: toggles (gestionnaires) pour référents et appareil/navigateur/OS ; sections/listes “Sources”, “Appareils”, “Navigateurs”, “Systèmes d’exploitation” montrant vues et visiteurs ; notice mise à jour (référents/appareils désormais collectés si activés, pays/UTM/sessions toujours non).

- [ ] **Step 1: Extend config/stats types and toggles**

Add `collectReferrer`, `collectDevice` to `AnalyticsConfig` type and to load/save (PUT accepts them). Show toggles in config block (like collectPath) with labels FR.

- [ ] **Step 2: Render dimension breakdowns**

When `hasPageData` and data exists, render cards/lists for each dimension (top values) with `value`, `views`, `visitors`. Handle empty states (“Aucune donnée”).

- [ ] **Step 3: Update notices/snippet text**

Mention that referrer and device/browser/OS aggregates are collected (when enabled). Keep limits (no country/UTM/sessions, uniques/jour).

- [ ] **Step 4: Commit**

```bash
git add portail/src/components/project/project-analytics-tab.tsx
git commit -m "feat(analytics): show referrer and device/browser/OS breakdowns (P1)"
```

---

### Task 7: Vérification finale

- [ ] **Step 1:** `pnpm vitest run portail/src/lib/analytics.test.ts` — PASS.
- [ ] **Step 2:** `cd portail && npx prisma validate` — PASS.
- [ ] **Step 3:** `cd portail && npm run typecheck` — no new errors.
- [ ] **Step 4:** Checklist manuel : pageview avec/without `r`, referrer vide→`direct`, flags off→pas de lignes dimension, même visiteur même segment/jour→visitors segment non doublé, purge/delete/export incluent dimensions, UI affiche répartitions.

- [ ] **Step 5: Final commit if needed**

## Notes
- Noms d’index uniques Postgres limités (63 chars) : raccourcir si nécessaire dans la migration tout en conservant les colonnes.
- Le parseur UA est heuristique (catégories bornées) : acceptable pour analytics agrégées ; ne pas stocker le UA brut.
- P2 (pays, GeoIP locale) et P3 (UTM) hors de ce plan.
- Appliquer la migration en environnement cible (`prisma migrate deploy/dev`).

## Execution Handoff

Plan saved. User a explicitement confirmé la mise en œuvre : procéder à l’implémentation task-by-task (TDD) après cette sauvegarde.
