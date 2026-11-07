# [P1] Renderer : couvrir tous les frameworks détectés (svelte, remix, solidstart, redwoodjs, php) + test garde-fou

## Contexte

Le type `Framework` (`packages/detector/src/types.ts`) contient :

`docker`, `eflex-config`, `nextjs`, `nuxt`, `astro`, `vite`, `svelte`, `remix`, `solidstart`, `redwoodjs`, `node`, `laravel`, `php`, `python`, `static`.

Mais `renderStack()` (`packages/renderer/src/render.ts`) ne gère que :

`docker`, `laravel`, `nextjs`, `nuxt`, `node`, `python`, `static`, `vite`, `astro`, `eflex-config`.

Tous les autres frameworks tombent dans le `default` :

```ts
default:
  throw new RenderError(`Framework "${plan.framework}" non pris en charge par le renderer.`);
```

**Non rendus aujourd'hui : `svelte`, `remix`, `solidstart`, `redwoodjs`, `php`.** Les commits récents (`5e78f4d`, `9c1e5f3`, `e32345d`) ont ajouté des détecteurs sans le rendu correspondant : un dépôt détecté avec succès ne peut pas être déployé.

Par ailleurs, `packages/renderer/src/types.ts` redéfinit son propre `BuildPlan`, ce qui crée un risque de divergence avec le détecteur.

## Travail à faire

1. **Ajouter les cas manquants** dans `render.ts` :
   - `remix`, `solidstart`, `redwoodjs` : serveur Node, donc même branche que `nextjs`/`node` (service `app` sur `plan.port`). Pour RedwoodJS, vérifier s'il faut deux services (web + api).
   - `svelte` : SvelteKit avec adapter-node → service Node ; avec adapter-static → branche statique. Le renderer peut se baser sur `plan.runtime` (`node@…` ou `static@1`).
   - `php` (hors Laravel) : `php-fpm` + `nginx` comme pour Laravel, mais sans `queue` ni `scheduler`.
2. **Test garde-fou** dans `packages/renderer/test/render.test.ts` : pour **chaque** plan de `allFixtures()` (détecteur) et chaque alternative, `renderStack()` ne lève pas d'exception et produit un YAML valide. Un framework ajouté au détecteur sans rendu fera alors échouer les tests.
3. **Exhaustivité vérifiée par le typage** : remplacer le `default` par un `assertNever(plan.framework)` pour que `tsc` signale tout framework oublié.
4. **Un seul type `BuildPlan`** : le renderer importe le type depuis `@eflex/detector` (ou depuis un package `@eflex/schema` partagé) au lieu de le dupliquer.
5. Mettre à jour `AGENTS.md` : « Ajouter un framework = détecteur + fixture + **rendu** ».

## Critères d'acceptation
- [ ] `pnpm test` et `pnpm typecheck` passent.
- [ ] Toutes les fixtures du détecteur se rendent sans erreur.
- [ ] Retirer un `case` du renderer fait échouer `tsc`.
- [ ] Le tableau « Stacks supportées » du README liste les nouveaux frameworks.
