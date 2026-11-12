# Tests d'accessibilité et captures visuelles (Playwright)

Ce dossier contient les tests automatisés d'accessibilité (axe-core) et la
génération de captures visuelles reproductibles pour la console `portail/`
(issue #80).

## Prérequis

- Node.js et dépendances du portail installées : `npm ci` (depuis `portail/`).
- Navigateur Playwright : `npx playwright install --with-deps chromium`.
- Un serveur accessible (démarré automatiquement par défaut via `npm run dev`).
  - En environnement CI ou après `npm run build`, utiliser le serveur de
    production : `PLAYWRIGHT_WEB_SERVER="npm run start -- --port 3000"`.
  - Si un serveur tourne déjà, définir `PLAYWRIGHT_SKIP_WEBSERVER=1` et
    `PLAYWRIGHT_BASE_URL` si nécessaire.
- Parcours authentifiés : une base PostgreSQL migrée et initialisée, puis
  `PLAYWRIGHT_AUTH=1` (et `PLAYWRIGHT_ADMIN=1` pour `/admin`). Le jeu de
  données de test est créé par `e2e/seed-auth.mjs`.

```bash
# Exemple (base de test migrée)
DATABASE_URL=postgresql://eflex:eflex@localhost:5432/eflex?schema=public \
E2E_ADMIN=1 node e2e/seed-auth.mjs
```

Variables utiles : `E2E_EMAIL`, `E2E_PASSWORD` (doivent correspondre au seed).

## Audits axe (serious/critical)

`a11y.spec.ts` vérifie les pages publiques et, si `PLAYWRIGHT_AUTH=1`, les
parcours authentifiés/administration :

- largeurs **360, 768 et 1440 px**, thèmes **clair et sombre** ;
- absence de violation axe `serious` ou `critical` (WCAG 2.1 A/AA) ;
- absence de débordement horizontal ;
- navigation clavier de base (lien d'évitement, focus visible, formulaire).

```bash
# Public uniquement
npm run test:a11y

# Public + authentifié (+ admin)
PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:a11y
```

## Captures visuelles

`screenshots.spec.ts` produit des captures plein écran reproductibles des pages
clés aux largeurs **360, 768 et 1440 px** en thèmes **clair et sombre**.

Dossier de sortie (stable) : `portail/e2e/screenshots/<thème>/<largeur>/`
(par ex. `e2e/screenshots/light/1440/accueil.png`).

Ces captures sont des artefacts locaux : elles ne sont pas versionnées (`portail/e2e/screenshots/` est ignoré par Git).

```bash
# Captures publiques
npm run test:screenshots

# Captures publiques + parcours authentifiés/admin
PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots
```

Les parcours authentifiés reprennent les mêmes pages clés que l'audit
(tableau de bord, nouveau projet, équipe, notifications, paramètres, activité,
pages projet et, avec `PLAYWRIGHT_ADMIN=1`, administration).

## Intégration CI

L'exécution complète nécessite un build, un serveur, les navigateurs Playwright
et, pour les parcours authentifiés, une base de données initialisée. Elle n'est
pas branchée dans le workflow principal `ts.yml` afin de ne pas alourdir chaque
exécution.

Pour l'intégrer de façon raisonnable, prévoir un job dédié (éventuellement non
bloquant ou manuel) qui :

1. installe les dépendances du portail et exécute `npx playwright install --with-deps chromium` ;
2. construit le portail (`npm run build`) et le sert (`PLAYWRIGHT_WEB_SERVER="npm run start -- --port 3000"`) ;
3. provisionne une base de test, applique les migrations, lance `node e2e/seed-auth.mjs` ;
4. exécute `PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:a11y` (et, au besoin, `npm run test:screenshots`) ;
5. publie le rapport HTML et les captures en artefacts.

## Limitations

- Les captures et les audits dépendent d'un rendu navigateur réel ; ils ne sont
  pas exécutés par `pnpm test` à la racine.
- Le zoom 200 % et les lecteurs d'écran réels ne sont pas couverts
  automatiquement (voir `docs/accessibility/audit-wcag.md`).
- Si `next dev` échoue à cause de l'instrumentation/worker en local, préférer un
  build puis `npm run start` avec `REDIS_URL` vide.
