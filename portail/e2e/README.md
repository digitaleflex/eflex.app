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

- **Pages publiques** : accueil et pages clés (`/`, auth, statut, maintenance, 404, etc.).
- **Console (authentifié)** : pages du tableau de bord et de projet ; l’**accueil du tableau de bord** (`/dashboard`) est capturé avec la **barre latérale dépliée** et **repliée** aux largeurs ≥ 768 px (`dashboard_sidebar-depliee.png`, `dashboard_sidebar-repliee.png`, issue #80).

Ces captures sont des artefacts locaux : `portail/e2e/screenshots/` est ignoré par Git. Les **références validées et versionnées** sont conservées dans `portail/e2e/visual-references/` (voir section ci-dessous).

```bash
# Captures publiques
npm run test:screenshots

# Captures publiques + parcours authentifiés/admin
PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots
```

Les parcours authentifiés reprennent les mêmes pages clés que l'audit
(tableau de bord, nouveau projet, équipe, notifications, paramètres, activité,
pages projet et, avec `PLAYWRIGHT_ADMIN=1`, administration).

## Captures de référence et procédure de mise à jour (#80)

Les captures générées dans `e2e/screenshots/` servent de base de comparaison visuelle. Les **références versionnées** sont stockées dans `portail/e2e/visual-references/` (voir `visual-references/README.md`).

Procédure :
1. Générer les captures sur une base de test connue : `npm run test:screenshots` (et, si besoin, `PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots`).
2. Vérifier visuellement les différences (thème, viewport, état de la barre latérale repliée/dépliée).
3. Copier les images validées dans `e2e/visual-references/` (nomenclature claire), puis committer avec une note décrivant le changement visuel.
4. En cas d’évolution UI intentionnelle, régénérer, mettre à jour les références dans la même PR et documenter la raison.

> Le dossier de sortie brut `e2e/screenshots/` reste ignoré pour éviter de committer des artefacts non validés. Le workflow `.github/workflows/a11y.yml` exécute `test:a11y` (axe) en CI ; l’intégration de `test:screenshots` / comparaison avec les références peut être ajoutée dans un job dédié si le temps d’exécution reste raisonnable.

## Intégration CI

Le workflow **`.github/workflows/a11y.yml`** exécute déjà les audits axe (`npm run test:a11y`) sur PR/push (portail/détecteur) avec base de test, seed et Playwright/Chromium, et publie les rapports en artefacts en cas d’échec.

Pour étendre à la comparaison visuelle (captures de référence), prévoir un job dédié (éventuellement non bloquant ou manuel) qui :

1. installe les dépendances du portail et exécute `npx playwright install --with-deps chromium` ;
2. construit le portail (`npm run build`) et le sert (`PLAYWRIGHT_WEB_SERVER="npm run start -- --port 3000"`) ;
3. provisionne une base de test, applique les migrations, lance `node e2e/seed-auth.mjs` ;
4. exécute `PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots` (et/ou compare aux références versionnées) ;
5. publie les captures/rapports en artefacts.

## Limitations

- Les captures et les audits dépendent d'un rendu navigateur réel ; ils ne sont
  pas exécutés par `pnpm test` à la racine.
- Le zoom 200 % et les lecteurs d'écran réels ne sont pas couverts
  automatiquement (à compléter par des vérifications manuelles/assistées).
- Les références visuelles versionnées doivent être mises à jour lors des changements UI intentionnels (voir procédure ci-dessus).
- Si `next dev` échoue à cause de l'instrumentation/worker en local, préférer un
  build puis `npm run start` avec `REDIS_URL` vide.
