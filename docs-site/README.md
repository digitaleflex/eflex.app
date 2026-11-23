# EFLEX Docs (`docs.eflex.app`)

Site de documentation produit EFLEX, construit avec [Astro Starlight](https://starlight.astro.build/).

## Développement

```bash
cd docs-site
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Structure

- `src/content/docs/demarrer/` — tutoriels de prise en main
- `src/content/docs/guides/` — guides pratiques
- `src/content/docs/reference/` — référence factuelle
- `src/content/docs/comprendre/` — explications de fonctionnement

## Règles

- Markdown/MDX portable autant que possible.
- Français par défaut (`lang: fr`).
- Ne pas documenter comme disponible une capacité non livrée : indiquer `partiel`, `conditionnel` ou `à venir`.
- La documentation publique est séparée de la documentation interne (`docs/` à la racine du dépôt).
