# EFLEX homepage refresh — dark hero, light content

Written against: `f720a19091bc47b674bf0ecc58793aeddb9cca8e` (main, 2026-11-10)

## Evidence chain

- Surface: public marketing homepage at `/`, rendered by `portail/src/app/page.tsx`.
- Problem: the approved direction calls for a clearly differentiated dark hero followed by light, editorial content sections. The current hero inherits the page background and uses only a low-opacity radial treatment; the deployment preview is dark, but it is visually detached from the surrounding light-first composition. The homepage also relies on generic bordered cards for the process and feature sections.
- Design evidence:
  - `AGENTS.md`, “Design system & UI”: EFLEX identity is navy + royal blue; Inter + JetBrains Mono; original color logos; no gradient text; no kicker above headings; no `transition-all`; visible focus; touch targets ≥44px; French labels; AA contrast in light and dark themes.
  - `portail/src/app/globals.css`: canonical HSL semantic tokens, navy/blue brand tokens, shadows, easing, focus baseline, reduced-motion handling, and `.bg-grid` utility.
  - `portail/src/app/page.tsx`: current hero, stack strip, three-step process, feature grid, FAQ, final CTA and footer; all conversion routes and section anchors are owned here.
  - `portail/src/components/marketing/site-header.tsx`: existing sticky glass navigation and login/register links.
  - `portail/src/components/marketing/deploy-demo.tsx`: existing dark deployment timeline with real detector-oriented copy; preserve its illustrative/static nature.
- Owner: homepage composition is `portail/src/app/page.tsx`; shared marketing navigation is `portail/src/components/marketing/site-header.tsx`; deployment visual is `portail/src/components/marketing/deploy-demo.tsx`; route-scoped styling belongs in `portail/src/app/globals.css`.
- Scope and affected surfaces: homepage only, plus the shared header only as rendered inside the homepage. Verify header styles are unchanged on other marketing routes if it is reused there.
- Uncertainty: no root or portal `DESIGN.md` was found. `AGENTS.md` is the governing documented UI contract. The homepage is public marketing, not an authenticated product workflow.

## Design decision

Implement the user-approved composition: a deep EFLEX navy hero with white text and a disciplined blue accent; a bright, quiet content canvas for all sections below it; retain the existing navy + royal-blue identity and real brand assets. Use the existing deployment demo as the hero's product proof, but integrate it into the hero composition rather than presenting it as an unrelated floating widget.

Keep the visual risk concentrated in the hero. The rest of the page should be restrained: clearer section hierarchy, stronger spacing, fewer generic card treatments, and a coherent progression from capability proof to process, features, FAQ and conversion. Do not imitate Vercel, Linear, Railway or another SaaS site.

The homepage must remain light internally even when the visitor's OS requests dark mode, without changing the portal's global theme behavior on authenticated routes. Scope any light-token override to a homepage root class; do not alter the global `:root` or dark-mode tokens for the rest of the application.

## Reuse

- Brand and semantic tokens from `portail/src/app/globals.css`: `--eflex-navy`, `--eflex-royalblue`, `--eflex-blue`, `--background`, `--foreground`, `--card`, `--muted`, `--border`, `--primary`, `--ring`, and existing shadow/easing utilities.
- Existing `SiteHeader`, `DeployDemo`, `FrameworkIcon`, `SectionHeading`, Lucide icons, and Next.js `Link`/ `Image`.
- Exemplar: current marketing composition in `portail/src/app/page.tsx`; header behavior in `portail/src/components/marketing/site-header.tsx`; deployment proof in `portail/src/components/marketing/deploy-demo.tsx`.

No new design-system primitive or dependency is required.

## Changes

1. `portail/src/app/page.tsx`
   - Change: add a route-local homepage theme scope; restructure the hero into a full-width EFLEX navy surface with readable white typography, existing primary/secondary actions, the three concrete trust points, and the deployment demo as the primary visual proof. Use brand colors and existing utilities; avoid gradient text and decorative gradients.
   - Change: keep the technology strip and all subsequent content on an explicitly light surface, with consistent container width, section rhythm and responsive spacing. Improve the process and feature sections' hierarchy without removing supported product facts or inventing capabilities.
   - Change: make the final CTA visually distinct but consistent with the hero; preserve all existing links, IDs (`fonctionnement`, `fonctionnalites`, `questions`), FAQ content, registration/login/status destinations, and footer.
   - Preserve: French copy and product positioning, all real framework SVGs, original color logo, metadata ownership outside this route, and all existing navigation targets.
   - Verify: at mobile, tablet and desktop widths, the hero remains readable and the demo does not overflow; all anchors and conversion links still work.

2. `portail/src/components/marketing/site-header.tsx`
   - Change: make only the necessary styling adjustment for the header when nested in the homepage theme scope; retain sticky behavior, current navigation items, and login/register actions. Do not add a new mobile menu or change navigation behavior in this visual pass.
   - Preserve: shared component API and behavior on any other route.
   - Verify: header has sufficient contrast over the dark hero, remains legible while sticky, and remains visually correct on any sibling route that uses it.

3. `portail/src/components/marketing/deploy-demo.tsx`
   - Change: refine spacing, typography, border and status emphasis only as needed to integrate the current static deployment sequence into the new hero. Maintain its existing static example semantics and existing detector-grounded copy.
   - Preserve: no fabricated live state, progress, timing, URL, deployment result, or new product capability.
   - Verify: the full timeline remains readable at narrow widths and reduced-motion mode exposes every step.

4. `portail/src/app/globals.css`
   - Change: add a narrowly scoped homepage theme class that pins the homepage's semantic surfaces to the approved light palette under both system color schemes; keep the hero's own navy/white treatment explicit. Do not change global `:root` tokens, `prefers-color-scheme` behavior, or authenticated application theming.
   - Preserve: canonical token ownership, current global light/dark behavior elsewhere, visible focus, scrollbar behavior and reduced-motion rules.
   - Verify: homepage content remains light under both OS themes while dashboard/authenticated routes continue to follow the existing system theme.

## Scope

- Inherit: only components and styles used by the public homepage.
- Verify: any non-homepage route reusing `SiteHeader`; global CSS cascade and responsive breakpoints.
- Exclude: deployment engine, detector, API routes, authentication, dashboard, database, pricing/business model, global theme redesign, new interactions, new dependencies, and new product claims.

## Validation

- Product: navigate from homepage to register/login/status; verify each section anchor scrolls to the correct section.
- Interface: inspect 375px, 768px, 1024px and 1440px; verify light and dark OS preferences; keyboard tab through all links; verify focus visibility and minimum 44px touch targets; test `prefers-reduced-motion`; inspect long French headings and FAQ expansion.
- System: confirm all brand colors, logo assets, framework icons, semantic tokens and existing shared components are reused; confirm no global dark-theme behavior changed.
- Repository:
  - `cd portail && npm run lint` → no ESLint warnings/errors.
  - `cd portail && npm run typecheck` → no TypeScript errors.
  - `cd portail && npm run build` → production build succeeds.
  - If available, run the portal's browser smoke checks and inspect homepage plus one authenticated route in both system themes.

## Stop conditions

- Stop if the approved hero/light-content direction conflicts with a newer maintained EFLEX-specific design contract.
- Stop if a proposed visual change requires changing product behavior, route semantics, authentication, deployment behavior, or making an unsupported product claim.
- Stop if keeping the homepage light requires modifying global theme tokens consumed by authenticated routes; use a route-local scope instead.

## Design documentation

- After acceptance and validation: record the homepage-only dark-hero/light-content decision in a maintained EFLEX public-marketing design document if one is established. Do not edit Axiom Design DNA or Axiom console design documentation.
