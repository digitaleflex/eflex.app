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
