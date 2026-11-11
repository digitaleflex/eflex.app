'use client'

import type { DetectedApplication } from '@eflex/detector'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FrameworkIcon } from '@/components/framework-icon'
import { frameworkLabel } from '@/lib/frameworks'

/**
 * Sélection multiple des applications d'un dépôt (lot C de D2).
 *
 * Affiché seulement quand `EFLEX_MULTI_APP` est actif (`/api/auth/config`) et
 * que le dépôt contient plusieurs applications. L'application déjà analysée est
 * l'application principale ; les cases à cocher ajoutent les autres au même
 * projet. Chaque application consomme une unité du quota du plan.
 */
export function ApplicationMultiSelect({
  apps,
  primaryRoot,
  selected,
  onToggle,
}: {
  apps: DetectedApplication[]
  /** Application analysée : elle sera toujours incluse (principale). */
  primaryRoot: string
  /** Dossiers des applications supplémentaires sélectionnées. */
  selected: string[]
  onToggle: (root: string, checked: boolean) => void
}) {
  const others = apps.filter((app) => app.root !== primaryRoot)
  if (others.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Déployer aussi d&apos;autres applications</h2>
        <p className="text-sm text-muted-foreground">
          Les applications cochées rejoignent ce projet, avec leur propre domaine. Chacune
          consomme une unité de votre plan. Vous pourrez les redéployer séparément.
        </p>
      </CardHeader>
      <CardContent>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Applications supplémentaires à déployer</legend>
          {others.map((app) => (
            <label
              key={app.root === '' ? 'racine' : app.root}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="checkbox"
                value={app.root}
                checked={selected.includes(app.root)}
                onChange={(event) => onToggle(app.root, event.target.checked)}
                className="accent-primary"
              />
              {app.framework && (
                <FrameworkIcon framework={app.framework} alt="" className="h-5 w-5 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block font-medium">{app.name}</span>
                <span
                  className="block truncate font-mono text-xs text-muted-foreground"
                  title={app.root === '' ? 'Racine du dépôt' : app.root}
                >
                  {app.root === '' ? 'Racine du dépôt' : app.root}
                </span>
                {app.framework && (
                  <span className="block text-xs text-muted-foreground">
                    {frameworkLabel(app.framework)}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  )
}
