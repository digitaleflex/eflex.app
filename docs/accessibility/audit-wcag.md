# Audit d'accessibilité — console client (WCAG 2.1 AA)

Issue : [#32](https://github.com/digitaleflex/eflex.app/issues/32) — « Console client : audit
d'accessibilité WCAG 2.1 AA et adaptation mobile ».

Date de l'audit : 10 novembre 2026. Périmètre : `portail/` (console client et administration),
thèmes clair et sombre, largeurs 360, 768 et 1440 px, zoom 200 % (approché par reflow à 360 px),
navigation clavier seule.

## Méthode

1. **Automatisé** — `@axe-core/playwright` avec les balises `wcag2a`, `wcag2aa`, `wcag21a`,
   `wcag21aa`. Une violation `serious` ou `critical` fait échouer la CI. Les animations sont
   neutralisées (`prefers-reduced-motion: reduce`) pour que la mesure ne porte pas sur des
   éléments encore transparents.
2. **Débordement** — `document.documentElement.scrollWidth` comparé à `clientWidth` à chaque
   page et chaque largeur.
3. **Clavier** — lien d'évitement, ordre de tabulation du formulaire de connexion, parcours
   de 12 arrêts sur `/`, `/login`, `/register`, `/forgot-password` et le tableau de bord avec
   vérification d'un indicateur de focus visible à chaque arrêt ; navigation par flèches des
   groupes de radios (thème), onglets ARIA, dialogues natifs `<dialog>`.
4. **Contrastes** — `portail/src/lib/contrast.test.ts` verrouille 49 couples texte/fond et
   composants non textuels dans les deux thèmes (≥ 4,5:1 et ≥ 3:1).
5. **Dialogues bloquants** — `portail/src/lib/no-blocking-dialogs.test.ts` interdit
   `window.confirm(` et `window.alert(` dans le code du portail.

Parcours couverts par la CI (`portail/e2e/a11y.spec.ts`) :

- public : `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`,
  `/status`, `/maintenance`, page 404 ;
- authentifié (`PLAYWRIGHT_AUTH=1`, base de test) : tableau de bord, nouveau projet, activité,
  équipe/invitations, notifications, paramètres, projet (vue d'ensemble, déploiements,
  variables, journaux, paramètres) ;
- administration (`PLAYWRIGHT_ADMIN=1`) : vue d'ensemble, utilisateurs, projets, déploiements,
  organisations, paiements, journal d'audit.

## Constats et corrections

| # | Constat mesuré | Sévérité | Page / parcours | Statut | Correctif |
|---|---|---|---|---|---|
| 1 | En-tête marketing large de **63 px** à 360 px : logo + thème + « Connexion » + « Créer un compte » | S2 — bloquant mobile | `/`, `/status` | Corrigé | `site-header.tsx` : action secondaire masquée sous 640 px (accessible depuis l'inscription), logo porté à 44 px |
| 2 | Texte secondaire de la démo `text-white/50` sous 4,5:1 sur le fond navy | S3 — contraste | `/` (démo de déploiement) | Corrigé | `deploy-demo.tsx` : `text-white/70` et `text-white/75` |
| 3 | `window.confirm` signalé sur la page Équipe | S2 — clavier/lecteur d'écran | Équipe | Déjà corrigé, verrouillé | Aucun `confirm(`/`alert(` restant ; test unitaire dédié + `ConfirmDialog` natif |
| 4 | Boutons `sm` de 32 px et plusieurs liens `h-8`/`h-9`/`h-10` sous 44 px sur mobile | S2 — cibles tactiles | En-tête, Équipe, sélecteur GitHub, notifications, paiements, connexion GitHub | Corrigé | `Button` : 44 px sur pointeur grossier ; contrôles bruts passés à `h-11` (menu compte, cloche, thème, sélecteurs de rôle, « Changer », filtres de dépôts, facture, actions GitHub) |
| 5 | `/admin/users` renvoyait une **erreur 500** : fonction `hrefFor` passée d'un composant serveur à `Pagination` (client) | S1 — page inaccessible | Administration → Utilisateurs | Corrigé | `pagination.tsx` accepte `hrefTemplate` sérialisable ; `admin/users/page.tsx` mis à jour |
| 6 | `<dl>` de « Santé & sécurité » avec un `<div>` imbriqué contenant des `<dt>/<dd>` | S3 — structure | Détail projet | Corrigé | `projects/[id]/page.tsx` : `<dt>` et `<dd>` directs, icône dans le `<dt>` |
| 7 | Indicateurs `/admin` : `<dt>/<dd>` hors `<dl>` (StatCard de `admin/metrics`) + wrapper incohérent | S3 — structure | `/admin` | Corrigé | `metrics.tsx` : libellé/valeur en `<p>` ; wrapper en `<div>` |
| 8 | Lien d'évitement sans cible focusable sur l'invitation et la page d'erreur globale | S3 — navigation clavier | `/invitations/[id]`, erreur globale | Corrigé | `id="contenu" tabIndex={-1}` ajouté ; cibles de focus `main` généralisées |
| 9 | Champ de recherche de la palette de commandes sans indicateur de focus visible (`outline-none`) | S2 — focus | Palette ⌘K | Corrigé | Anneau `focus-visible` interne sur l'input |
| 10 | Groupe de radios du thème sans navigation par flèches ni roving tabindex | S3 — clavier | Paramètres → Apparence, menu compte | Corrigé | `theme-switcher.tsx` : flèches/Début/Fin, `tabIndex` géré |
| 11 | Erreurs de formulaire non reliées aux champs (`aria-invalid`/`aria-describedby`) sur inscription, connexion, mot de passe oublié/reset, vérification, paramètres, projet et équipe | S2 — compréhension | Formulaires | Corrigé | Chaque message d'erreur a un `id`, les champs portent `aria-invalid` et `aria-describedby` |
| 12 | Résultat d'analyse et statut de déploiement non annoncés explicitement | S3 — lecteur d'écran | Nouveau projet, détail projet | Corrigé | Régions `role="status" aria-live="polite"` dédiées (analyse en cours/terminée, dernier déploiement) |
| 13 | Doublon d'identifiants sur le sélecteur d'organisation (constat de l'issue) | S3 — robustesse | En-tête console | Vérifié, déjà corrigé | `useId()` dans `org-switcher.tsx` ; axe ne signale aucun `duplicate-id` |
| 14 | Mise en page mobile de la page Équipe non vérifiée | — | Équipe | Vérifié | Audit 360 px clair/sombre sans débordement ni violation ; sélecteurs de rôle à 44 px |
| 15 | Contrastes des badges, boutons destructifs et jetons | — | Global | Vérifié | 49 couples ≥ seuils AA dans les deux thèmes (`contrast.test.ts`) |

Aucune violation `serious` ou `critical` ne subsiste sur les parcours automatisés après
correction (public et authentifié, 360/768/1440 px, clair/sombre).

### Résultats mesurés après correction

| Périmètre | Résultat |
|---|---|
| Pages publiques + clavier | 60 tests Playwright validés (54 pages, 6 clavier) ; 0 violation sérieuse/critique ; 0 débordement |
| 360 px avec pointeur grossier (cibles 44 px) | 18 tests passés (clair et sombre) |
| Tableau de bord, projet, équipe, notifications, paramètres | 0 violation aux trois largeurs ; 0 débordement |
| Administration (7 pages) | 0 violation à 1440 px clair et 360 px sombre ; `/admin/users` de nouveau accessible |
| Contrastes | 49 couples ≥ 4,5:1 (textes) et ≥ 3:1 (contours/anneau), deux thèmes |
| Dialogues bloquants | 0 `window.confirm`/`window.alert` |

## Écarts restants et justifications

| Écart | Justification / suite |
|---|---|
| **Pas de barre de navigation basse** sur mobile : les onglets restent en haut et défilent horizontalement. | Choix de conception assumé : aucun contenu n'est masqué, toutes les cibles font 44 px, et le défilement horizontal est limité à la barre d'onglets (pas à la page). Une barre basse pourra être étudiée si la navigation grandit. |
| **Pages d'administration de détail** (`/admin/projects/[id]`, `/admin/deployments/[id]`, `/admin/organizations/[id]`), `/admin/live` et `/admin/infrastructure` non couvertes par axe en CI. | Elles dépendent de données dynamiques ou d'API externes (Coolify, flux SSE). Leur source a été relue (libellés, `<dl>`, boutons, focus) mais il manque des fixtures stables. À ajouter avec le jeu de données d'administration. |
| **Zoom 200 %** vérifié par reflow à 360 px (et 768 px), pas par un vrai zoom navigateur. | Playwright n'émule pas le zoom de page ; 360 px est plus contraignant que 1440 px à 200 % (720 px CSS). Une vérification manuelle dans Firefox/Chrome reste recommandée avant mise en production. |
| **Lecteurs d'écran réels** (NVDA, VoiceOver) non testés. | L'audit couvre les rôles/labels/annonces et axe ; un passage manuel reste nécessaire pour valider l'expérience d'annonce des flux SSE et des toasts. |
| **Vérification d'e-mail et 2FA** : seuls les états initiaux sont audités. | Les états de succès exigent un e-mail ou un TOTP réel. Formulaires et messages statiques sont couverts. |
| **Dialogues de confirmation** : `<dialog>` natif sans `aria-modal` explicite. | `showModal()` expose déjà la modalité aux technologies d'assistance (piège de focus, Échap, retour du focus). |
| **Tests authentifiés absents par défaut en local.** | Ils exigent une base de test migrée et le compte `e2e/seed-auth.mjs` ; la CI les exécute. |
| **`next dev` et l'instrumentation** : corrigé (#101) — le code Node de l'instrumentation est isolé dans `instrumentation-node.ts`, derrière une condition `NEXT_RUNTIME` en ligne. | `next dev` fonctionne en local ; la CI continue d'utiliser `npm run build` puis `npm run start` pour Playwright. |

## Commandes de vérification

```bash
# 1. Qualité statique et contrastes / dialogues bloquants
cd portail && npx tsc --noEmit && npm run lint
cd .. && pnpm vitest run portail/src/lib/contrast.test.ts portail/src/lib/no-blocking-dialogs.test.ts

# 2. Navigateur de test
cd portail && npx playwright install --with-deps chromium

# 3. Audit axe — pages publiques (360/768/1440 px, clair/sombre)
cd portail && npm run test:a11y

# 4. Audit axe — parcours authentifiés (base de test migrée)
cd portail
DATABASE_URL=postgresql://eflex:eflex@localhost:5432/eflex?schema=public E2E_ADMIN=1 node e2e/seed-auth.mjs
PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:a11y

# 5. Captures visuelles reproductibles (360/768/1440 px, clair/sombre)
cd portail && npm run test:screenshots
# + authentifié/admin : PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots
```

Détails, prérequis et notes CI : `portail/e2e/README.md`. Les captures sont
enregistrées dans `portail/e2e/screenshots/<thème>/<largeur>/`.

Fichiers principaux : `portail/playwright.config.ts`, `portail/e2e/a11y.spec.ts`,
`portail/e2e/screenshots.spec.ts`, `portail/e2e/seed-auth.mjs`,
`portail/e2e/README.md`, `portail/src/lib/no-blocking-dialogs.test.ts`.
