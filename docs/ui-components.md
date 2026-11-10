# Bibliothèque de composants du portail (issue #24)

Composants réutilisables et accessibles du portail EFLEX. Ils complètent `Button`, `Card`,
`Input`, `Badge`, `Toast` et `ConfirmDialog` sans ajouter de dépendance : les dialogues
s'appuient sur l'élément natif `<dialog>` (piège de focus, Échap, retour du focus et
`aria-modal` gérés par le navigateur) plutôt que sur une bibliothèque headless.

Tous les libellés sont en français, les cibles tactiles font au moins 44 px, le focus est
visible (`focus-visible:ring-ring`) et les valeurs techniques utilisent `tabular-nums`.

## Jetons (`src/app/globals.css`)

| Jeton | Rôle | Clair | Sombre |
|---|---|---|---|
| `--info` / `--info-foreground` | information neutre (distincte du bleu d'action) | bleu-cyan foncé / blanc | bleu-cyan clair / navy |
| `--surface-raised` / `--surface-raised-foreground` | dialogue, panneau, surface au-dessus de la carte | blanc / navy | navy clair / blanc cassé |
| `--input` | contour de champ, ≥ 3:1 sur `--card` et `--background` | gris ardoise | gris ardoise clair |
| `--radius-control`, `--radius-pill` | rayon des contrôles (10 px) et pastilles | — | — |
| `--space-gutter`, `--space-stack`, `--space-section` | échelle d'espacement documentée | 1 rem / 1,5 rem / 2 rem | identique |

Corrections apportées par #24 :

- `primary` clair ramené à 51 % de luminosité : le texte `primary` sur `primary/10`
  (Badge par défaut) passe de 4,32:1 à 4,62:1 sur le fond.
- `input` clair et sombre renforcé pour atteindre 3:1 (critère non textuel 1.4.11).
- `--info` et `--surface-raised` ajoutés pour les nouveaux composants.
- Placeholder d'`Input` sans opacité réduite (le texte atteint 4,5:1).
- `tailwind.config.ts` expose `bg-info`, `bg-surface-raised`, `rounded-control`,
  `rounded-pill`, `gap-gutter`, `p-stack`, etc.

`src/lib/contrast.test.ts` verrouille ces paires : textes ≥ 4,5:1, contours de champ et
anneau de focus ≥ 3:1, teintes sémantiques à 10 %, dans les deux thèmes.

## Composants

Tous sont dans `portail/src/components/ui/`.

| Composant | Type | Usage principal | Accessibilité |
|---|---|---|---|
| `DataTable` | client | tri, pagination locale, squelette, repli cartes sous 640 px | `caption` masqué, `aria-sort`, en-têtes triables = boutons, `<dl>` en mobile |
| `Dialog` | client | dialogue générique (formulaires, détails) | `<dialog>` natif, Échap, clic sur le fond, `aria-modal` |
| `ConfirmDialog` (existant) | client | confirmation destructive, saisie du nom | même base native |
| `Tabs` | client | onglets de page | `role=tablist/tab/tabpanel`, flèches, Début/Fin, bouclage |
| `Select` | client | sélecteur unique du portail | `<select>` natif, libellé, aide, erreur, chevron décoratif |
| `Pagination` | client | pagination par URL ou locale | `aria-current`, cibles 44 px, ellipses masquées |
| `EmptyState` | serveur | liste ou recherche sans résultat | titre explicite, action de sortie |
| `Skeleton` / `SkeletonText` | partagé | chargement | `aria-hidden`, état annoncé par le conteneur (`aria-busy`) |
| `StatCard` | serveur | indicateur chiffré | valeur `tabular-nums`, icône décorative |
| `StatusBadge` | serveur | statut métier en français | table de libellés, pastille redondante masquée |
| `Avatar` | serveur | initiales ou image | `role=img` + nom, ou `decorative` quand le nom est adjacent |
| `CopyButton` | client | copier un identifiant | annonce `role=status`, repli hors contexte sécurisé |
| `Tooltip` | client | aide courte | `aria-describedby`, Échap, focus et survol |
| `Breadcrumb` | serveur | fil d'Ariane | nav nommée, `aria-current="page"` |

### DataTable

```tsx
<DataTable
  caption="Déploiements du projet"
  data={deployments}
  getRowId={(row) => row.id}
  columns={[
    { id: 'status', header: 'Statut', cell: (row) => <StatusBadge status={row.status} /> },
    { id: 'createdAt', header: 'Créé le', cell: (row) => formatDate(row.createdAt), sortValue: (row) => row.createdAt },
  ]}
  initialSort={{ columnId: 'createdAt', direction: 'desc' }}
  empty={<EmptyState title="Aucun déploiement" description="Lancez un premier déploiement." />}
/>
```

- Tri client à trois états : croissant → décroissant → ordre d'origine. Les valeurs vides
  restent en fin de liste, le tri est stable.
- Pagination locale (20 lignes par défaut) ; la page est bornée si les données changent.
- Sous 640 px, le tableau devient une liste de cartes `<dl>` : aucune barre de défilement
  horizontale au niveau de la page.
- La logique testable vit dans `src/lib/table.ts` (`sortRows`, `paginate`, `pageList`,
  `formatPageRange`) et `src/lib/table.test.ts`.

## Exemple d'intégration

`/admin/users` utilise `StatCard` (comptes, administrateurs, suspendus, e-mails non
vérifiés), `EmptyState` (recherche sans résultat avec réinitialisation), `StatusBadge`
(actif/suspendu avec motif), `Avatar` et `Pagination`.

## Vérifications

```bash
cd portail && npx tsc --noEmit && npm run lint
cd .. && pnpm vitest run portail/src/lib/contrast.test.ts portail/src/lib/table.test.ts
```

## Limites / suite

- Pas encore de page `/admin/design` ni de Storybook : la documentation reste ce fichier.
- Les tests de rendu Playwright + axe, le contrôle à 360/768/1280 px et le mode sombre sont
  en place dans `portail/e2e/a11y.spec.ts` (voir `docs/accessibility/audit-wcag.md`) et
  exécutés par `.github/workflows/a11y.yml`.
- `DataTable` pagine côté client ; la pagination serveur (`hrefTemplate`, sans fonction)
  et la sélection de colonnes restent à brancher quand un écran en aura besoin.
- `ConfirmDialog` est le remplacement de tous les `window.confirm` (aucun ne subsiste,
  verrouillé par `src/lib/no-blocking-dialogs.test.ts`).
- Les animations respectent `prefers-reduced-motion` (global et `motion-reduce`) ; les
  parcours complets (SSE, toasts, dialogues imbriqués) sont neutralisés dans les tests axe
  mais restent à valider avec un lecteur d'écran réel.
