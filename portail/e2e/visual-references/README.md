# Captures visuelles de référence (#80)

Ce dossier contient les captures de référence **versionnées** pour la validation visuelle
de l’« accueil » demandé par l’issue #80, interprété comme :

- **accueil public** (`/`, page d’accueil du site) ;
- **accueil de la console** (`/dashboard`, page d’accueil du tableau de bord).

Les références couvrent les thèmes **clair et sombre** aux largeurs **360, 768 et 1440 px**.
Pour l’accueil console, la **barre latérale dépliée et repliée** est versionnée aux largeurs
≥ 768 px (à 360 px la console utilise la navigation en barre du bas).

## Contenu

- `dashboard/<thème>/<largeur>/...` : accueil console (`/dashboard`), base seedée.
- `public/<thème>/<largeur>/accueil.png` : accueil public (`/`).
- `public/<thème>/<largeur>/{login,status,cette-page-nexiste-pas}.png` : autres pages publiques clés versionnées pour la non-régression visuelle.

## Génération

Les captures sont produites par `portail/e2e/screenshots.spec.ts` dans
`portail/e2e/screenshots/<thème>/<largeur>/` (dossier ignoré par Git).

```bash
cd portail
npm run test:screenshots
# Parcours authentifiés/admin (base seedée requise, voir e2e/README.md)
PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots
```

## Nomenclature

- Accueil public : `public/<thème>/<largeur>/accueil.png` (correspond à la route `/`).
- Accueil console : `dashboard/<thème>/<largeur>/sidebar-expanded.png`, `sidebar-collapsed.png` (≥ 768 px) ou `overview.png` (360 px).
- Toujours conserver la structure `<zone>/<thème>/<largeur>/<état-ou-nom>.png`.

## Mise à jour des références

1. Générer les captures dans un environnement reproductible (base seedée pour le parcours authentifié).
2. Vérifier visuellement les différences (viewport, thème, état de la barre latérale).
3. Copier les images validées dans ce dossier en conservant la nomenclature, puis committer.
4. Pour un changement UI intentionnel, mettre à jour les références dans la même PR et décrire la raison du changement.

Les fichiers de ce dossier sont destinés à être revus en revue de code comme toute autre modification visuelle.

## Jeu actuel — accueil de la console (`/dashboard`)

Base seedée par `e2e/seed-auth.mjs` (compte `a11y-e2e@example.test`, un projet, plan Découverte). Dix captures :

| Largeur | Fichiers |
| --- | --- |
| 360 px | `overview.png` (pas de barre latérale : navigation en barre du bas) |
| 768 px | `sidebar-expanded.png`, `sidebar-collapsed.png` |
| 1440 px | `sidebar-expanded.png`, `sidebar-collapsed.png` |

Chaque fichier existe en `light` et `dark`. Les autres pages (projet, équipe, paramètres, administration) restent des artefacts locaux : les versionner demande de figer des données plus variables.

## Jeu actuel — accueil public (`/`)

Captures versionnées en `public/<thème>/<largeur>/accueil.png` pour chaque combinaison thème × largeur (360/768/1440).

## Particularités des captures pleine page

Ce sont des limites de la capture, pas des défauts de l'interface :

- sur mobile, la barre de navigation fixe du bas apparaît au milieu de l'image (elle est collée au bas de la première fenêtre) ;
- la barre latérale s'arrête à la hauteur de la fenêtre (960 px) quand la page est plus longue.

## Générer le même jeu

Voir `e2e/README.md` pour la base et le serveur de production, puis
`PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots`. Le test pose l'état de
la barre latérale dans le cookie **et** dans `localStorage` (la barre lit d'abord
`localStorage`). Le limiteur de connexion de l'application (10 par minute) peut interrompre
une longue série : vider la table `RateLimit` et relancer les largeurs concernées avec `-g`.
