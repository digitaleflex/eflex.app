# Sources de marque EFLEX

Charte complète (règles d'usage, couleurs, typographie) : **`docs/brand/README.md`**. Planches de
référence : `charte-logo-variantes.webp`, `charte-logo-horizontal.webp`, `charte-planche-couleurs-typo.webp`.

Fichiers source haute résolution de la marque. **Les versions servies par le
portail** sont dans `portail/public/` :

- `logo-horizontal.webp` — logo horizontal optimisé (en-tête, pages) ;
- `logo-mark.png` — marque seule (icônes de framework, favicon dérivé) ;
- `logo-horizontal.png` — repli PNG du logo horizontal.

| Fichier source | Contenu |
|---|---|
| `logo-horizontal-source.png` / `.webp` | Logo horizontal complet (texte + marque) |
| `logo.png` / `.webp` | Marque seule |

Les doublons qui vivaient à la racine du dépôt (`EFLEX Flow Tech Logo.png`,
`Glossy Blue Ribbon F Logo.png`, et leurs variantes sans espaces) ont été
supprimés lors de l'issue 09 : ce dossier est l'unique emplacement des sources.
Aucun script ni Dockerfile ne les référence — le portail n'utilise que
`portail/public/`.
