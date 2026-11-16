# Analytics — UTM / campagnes (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le suivi agrégé des paramètres de campagne **UTM** (`utm_source`, `utm_medium`, `utm_campaign`) aux analytics EFLEX, collectés via le snippet et agrégés par jour (vues + visiteurs uniques/jour du segment), sans données sensibles ni URL complète stockée.

**Architecture:** Étendre le pipeline de dimensions (P1/P2). Le snippet lit `utm_source/utm_medium/utm_campaign` depuis `location.search` et les envoie dans la page vue (`us`, `um`, `uc`, optionnels). Le serveur normalise/borne les valeurs et, si `ProjectAnalytics.collectUtm` est actif, enregistre les dimensions `utm_source`, `utm_medium`, `utm_campaign` dans `TrafficDailyDimension`/`AnalyticsDailyDimensionVisitor` avec la même dédup empreinte journalière. Stats/export/UI exposent les répartitions.

**Tech Stack:** Next.js 15, TypeScript, Prisma/PostgreSQL, Zod, Vitest.

**Spec:** P3 validé : UTM source/medium/campaign, flag `collectUtm` (défaut true), snippet rétrocompatible, normalisation bornée, sans `utm_term`/`utm_content` dans ce lot.

## Global Constraints

- **Privacy/minimisation** : ne pas stocker l’URL complète ni paramètres hors UTM suivis ; valeurs UTM normalisées/bornées, pas d’identifiant visiteur persistant/IP/cookie.
- **Rétrocompatibilité** : payloads/snippets sans champs UTM valides ; config/stats/export additifs.
- **Silencieux & sûr** : collecte publique `204`, rate limits/DNT-GPC/quota conservés ; dimensions ignorées si valeur vide/invalide ou collecte désactivée.
- **Multi-tenant & audit** : routes scopées, mutations config auditées, purge/suppression/export couvrent les dimensions UTM via tables existantes.

## Review Focus

- **UTM absent ou vide** : aucune dimension UTM enregistrée pour ce paramètre (ne pas créer de bucket vide).
- **Valeurs longues/sensibles/brutes** : normalisées (trim, minuscules, caractères sûrs), tronquées/bornées ; URL complète jamais stockée.
- **`collectUtm=false`** : aucune dimension `utm_*` enregistrée.
- **Même visiteur, même UTM, même jour** : visiteur segment compté une seule fois (dédup hash par segment/jour).

## File Structure

- **Modify:** `portail/prisma/schema.prisma`, **Create:** migration `*_analytics_utm_p3` — `ProjectAnalytics.collectUtm Boolean @default(true)`.
- **Modify:** `portail/src/lib/analytics.ts` — `normalizeAnalyticsUtmValue`, payload `us/um/uc`, config schema `collectUtm`, snippet inclut UTM depuis `location.search`.
- **Modify:** `portail/src/lib/analytics.test.ts` — tests normalisation UTM, payload, config, snippet.
- **Modify:** `portail/src/app/api/projects/[id]/analytics/route.ts` — sérialise/écrit `collectUtm`.
- **Modify:** `portail/src/app/api/collect/route.ts` — sélection `collectUtm`, enregistre dimensions `utm_source|utm_medium|utm_campaign`.
- **Modify:** `portail/src/app/api/projects/[id]/analytics/stats/route.ts` — `utmSources`, `utmMediums`, `utmCampaigns`.
- **Modify:** `portail/src/components/project/project-analytics-tab.tsx` — toggle, sections UTM, notice.

---

### Task 1: Schéma & migration
- [ ] **Step 1:** Ajouter `collectUtm Boolean @default(true)` à `ProjectAnalytics`.
- [ ] **Step 2:** Migration SQL ajout colonne.
- [ ] **Step 3:** `npx prisma validate && npx prisma generate`.
- [ ] **Step 4:** Commit.

### Task 2: Lib analytics (normalisation, payload, snippet, config)
**Produces:** `normalizeAnalyticsUtmValue(input: unknown): string | null` (null si vide/invalide après normalisation ; minuscules, trim, remplace espaces par `-`, autorise `[a-z0-9._:-]`, max 100 chars) ; payload `us/um/uc` optionnels (string max 200) ; config `collectUtm` ; snippet lit params `utm_source/utm_medium/utm_campaign` et envoie `us/um/uc`.
- [ ] **Step 1:** Tests (normalisation, payload avec utm, config `collectUtm`, snippet contient `utm_source`/`us`).
- [ ] **Step 2:** Run tests (fail).
- [ ] **Step 3:** Implémenter helpers/schema/snippet.
- [ ] **Step 4:** Run tests (pass).
- [ ] **Step 5:** Commit.

### Task 3: Config API
- [ ] **Step 1:** Sérialiser/écrire/auditer `collectUtm` (GET défaut true).
- [ ] **Step 2:** Commit.

### Task 4: Collecte
- [ ] **Step 1:** Sélectionner `collectUtm` ; si actif, pour chaque `(us->utm_source, um->utm_medium, uc->utm_campaign)` valeur normalisée non nulle ajouter dimension et dédupliquer/incrémenter comme P1/P2.
- [ ] **Step 2:** Commit.

### Task 5: Stats & export
- [ ] **Step 1:** Stats : `utmSources`, `utmMediums`, `utmCampaigns` via `topDimension`.
- [ ] **Step 2:** Export : dimensions UTM incluses (déjà via lignes dimension) ; vérifier.
- [ ] **Step 3:** Commit.

### Task 6: UI
- [ ] **Step 1:** Types + toggle `collectUtm`.
- [ ] **Step 2:** Sections “UTM source/medium/campagne”.
- [ ] **Step 3:** Notice mise à jour (UTM collectés si activé).
- [ ] **Step 4:** Commit.

### Task 7: Vérification
- [ ] **Step 1:** `pnpm vitest run portail/src/lib/analytics.test.ts` — PASS.
- [ ] **Step 2:** `cd portail && npx prisma validate` — PASS.
- [ ] **Step 3:** `cd portail && npm run typecheck` — no new errors.

## Notes
- Dimensions : `utm_source`, `utm_medium`, `utm_campaign` (réutilisent tables de dimensions existantes).
- `utm_term`/`utm_content` exclus de ce lot.
- Migration à appliquer en cible.

## Execution Handoff
Utilisateur a confirmé : implémenter P3 task-by-task.
