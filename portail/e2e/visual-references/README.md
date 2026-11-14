# Captures visuelles de référence (console)

Ce dossier contient les captures de référence **versionnées** pour la validation visuelle de la console (issue #80).

## Contenu attendu
- Accueil du tableau de bord (`/dashboard`) aux largeurs **360, 768 et 1440 px**, thèmes **clair et sombre**, avec la **barre latérale dépliée et repliée** lorsque applicable (≥ 768 px).
- Autres pages clés si nécessaires (public/auth/admin) selon les besoins de non-régression.

## Génération
Les captures sont produites par `portail/e2e/screenshots.spec.ts` dans `portail/e2e/screenshots/<thème>/<largeur>/` (dossier ignoré par Git).

Exemples :
```bash
cd portail
npm run test:screenshots
# Parcours authentifiés/admin (base seedée requise, voir e2e/README.md)
PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots
```

## Mise à jour des références
1. Générer les captures dans un environnement reproductible (base seedée si parcours authentifié).
2. Vérifier visuellement les différences (viewport, thème, état sidebar).
3. Copier les images validées dans ce dossier (en conservant une nomenclature claire, ex. `dashboard/light/1440/sidebar-expanded.png`) et les committer.
4. Pour un changement UI intentionnel, mettre à jour les références dans la même PR et décrire la raison du changement.

Les fichiers de ce dossier sont destinés à être revus en revue de code comme toute autre modification visuelle.

## Jeu actuel (accueil de la console, `/dashboard`)

Base seedée par `e2e/seed-auth.mjs` (compte `a11y-e2e@example.test`, un projet, plan Découverte). Dix captures, nommées `dashboard/<thème>/<largeur>/<état>.png` :

| Largeur | Fichiers |
| --- | --- |
| 360 px | `overview.png` (pas de barre latérale : navigation en barre du bas) |
| 768 px | `sidebar-expanded.png`, `sidebar-collapsed.png` |
| 1440 px | `sidebar-expanded.png`, `sidebar-collapsed.png` |

Chaque fichier existe en `light` et `dark`. Les autres pages (projet, équipe, paramètres, administration) restent des artefacts locaux : les versionner demande de figer des données plus variables.

## Particularités des captures pleine page

Ce sont des limites de la capture, pas des défauts de l'interface :

- sur mobile, la barre de navigation fixe du bas apparaît au milieu de l'image (elle est collée au bas de la première fenêtre) ;
- la barre latérale s'arrête à la hauteur de la fenêtre (960 px) quand la page est plus longue.

## Générer le même jeu

Voir `e2e/README.md` pour la base et le serveur de production, puis `PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npm run test:screenshots`. Le test pose l'état de la barre latérale dans le cookie **et** dans `localStorage` (la barre lit d'abord `localStorage`). Le limiteur de connexion de l'application (10 par minute) peut interrompre une longue série : vider la table `RateLimit` et relancer les largeurs concernées avec `-g`.



## Références publiques (versionnées)

Le dossier `public/<thème>/<largeur>/` contient des captures de référence des pages publiques clés (accueil, connexion, statut, 404) en thèmes clair/sombre et aux largeurs 360/768/1440 px, générées via `e2e/screenshots.spec.ts` (parcours public).
