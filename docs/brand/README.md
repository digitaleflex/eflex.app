# Charte EFLEX

Source de vérité de l'identité EFLEX pour le portail (`portail/`). Elle ne s'applique pas à la
console du moteur Axiom (`docs/design/`). Planches de référence fournies par le porteur du produit,
rangées dans `assets/brand/` :

| Planche | Contenu |
|---|---|
| `charte-logo-variantes.webp` | Logo officiel : version verticale, variantes couleur / monochrome / inversée, avec descripteur, symbole seul, favicon, contour |
| `charte-logo-horizontal.webp` | Logo horizontal officiel (symbole F + wordmark) |
| `charte-planche-couleurs-typo.webp` | Palette, typographie, iconographie, mises en situation |

> **Point ouvert.** La planche `charte-planche-couleurs-typo.webp` montre un autre symbole (chevrons en
> forme de X). Les deux autres planches, marquées « variantes officielles », montrent le **F en deux
> rubans**, qui est aussi celui utilisé partout dans le portail. Le F fait foi tant que ce point n'est
> pas tranché ; la palette, la typographie et l'iconographie de cette planche s'appliquent.

## Nom

- **EFLEX**, toujours en capitales, y compris dans le texte courant (« Déployez avec EFLEX »).
- Exceptions techniques à ne pas changer : nom du projet Coolify (`COOLIFY_PROJECT_NAME`, défaut
  `Eflex`) et nom de la GitHub App, qui identifient des ressources existantes.
- Le descripteur **« Conseil & ingénierie numérique »** est institutionnel (société). Il n'apparaît pas
  dans l'interface du produit.

## Logo

| Usage | Fichier servi (`portail/public/`) |
|---|---|
| Horizontal, fonds clairs | `logo-horizontal.webp` |
| Horizontal, fonds sombres (version inversée officielle) | `logo-horizontal-inverse.webp` |
| Symbole seul, fonds clairs | `logo-mark.png` |
| Symbole seul, fonds sombres | `logo-mark-inverse.png` |
| Favicon / icône d'application (symbole bleu sur carré navy) | `portail/src/app/icon.png`, `apple-icon.png` |

Règles :

- Toujours passer par le composant **`BrandLogo`** (`components/brand-logo.tsx`) : `tone="auto"` suit le
  thème, `tone="dark"` pour un fond toujours sombre (panneau navy), `tone="light"` pour un fond toujours
  clair.
- Seulement les versions officielles : **jamais de filtre CSS**, de recoloration, de plaque, d'ombre,
  d'étirement ni de rotation.
- Espace de protection : au moins la hauteur d'une barre du F autour du logo.
- Taille minimale : 24 px de haut pour le logo horizontal, 16 px pour le symbole.
- Les versions inversées et le favicon sont **dérivés** des fichiers officiels (silhouette blanche,
  symbole recoloré en bleu sur navy). À remplacer par les fichiers vectoriels (SVG) du studio dès qu'ils
  sont disponibles.

## Couleurs

| Nom | Hex | Token (`portail/src/app/globals.css`) | Usage |
|---|---|---|---|
| Navy | `#0B1F3B` | `--eflex-navy` | Fonds de marque (hero, panneaux), texte de marque |
| Bleu principal | `#2563EB` | `--eflex-royalblue`, base de `--primary` | Actions principales, liens, focus |
| Bleu clair | `#3B82F6` | `--eflex-blue` | Accents, mise en valeur sur fond navy |
| Gris clair | `#E5E7EB` | ≈ `--border` | Séparateurs, contours décoratifs |
| Blanc | `#FFFFFF` | `--card` | Surfaces |

- `--eflex-sky` (`#38BDF8`) est un accent secondaire hors planche : réservé aux pictogrammes sur fond
  navy, jamais pour du texte courant.
- Statuts : uniquement les tokens `--success`, `--warning`, `--info`, `--destructive` (et leur
  `-foreground`), **jamais la palette brute de Tailwind** (`emerald-*`, `amber-*`, `slate-*`…).
- Contraste : toute paire texte/fond ≥ 4,5:1 dans les deux thèmes (contrôlé par axe en CI).

## Typographie

- **Plus Jakarta Sans** (Light, Regular, Medium, Semibold, Bold) pour le texte et les titres
  (`--font-sans`, `--font-display`).
- **JetBrains Mono** pour le code, les commits, les journaux et les valeurs techniques (`font-mono`,
  avec `tabular-nums`). Hors planche, conservée pour la lisibilité des valeurs techniques.
- Taille minimale : **12 px**.

## Iconographie

- Pictogrammes au trait (bibliothèque `lucide-react`), épaisseur par défaut, couleur héritée du texte.
- Tailles : 16 px dans le texte et les boutons, 20 px dans les titres de section, 24 px au plus ailleurs.

## Ton

- Français, phrases courtes, sans jargon interne ; « mot de passe » (pas « phrase secrète »).
- Exact : aucune valeur, preuve sociale ou fonction annoncée qui n'existe pas. Ce qui arrive porte la
  mention « Bientôt ».
