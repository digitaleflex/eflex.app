'use client'

import type { DetectedApplication } from '@eflex/detector'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FrameworkIcon } from '@/components/framework-icon'
import { frameworkLabel } from '@/lib/frameworks'

/**
 * Liste des applications détectées dans un dépôt multi-apps.
 *
 * Lot A de D2 : visibilité et sélection uniquement. Choisir une application
 * relance l'analyse sur son `root` ; un seul projet est encore créé.
 */
export function ApplicationPicker({
  apps,
  selectedRoot,
  analyzing,
  onSelect,
  headingRef,
  multiApp = false,
}: {
  apps: DetectedApplication[]
  selectedRoot: string
  analyzing: boolean
  onSelect: (root: string) => void
  headingRef?: React.Ref<HTMLHeadingElement>
  /** Drapeau `EFLEX_MULTI_APP` : la sélection multiple suit cette analyse. */
  multiApp?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold focus:outline-none">
          {apps.length} applications détectées
        </h2>
        <p className="text-sm text-muted-foreground">
          {multiApp
            ? "Choisissez l'application principale à analyser. Les autres pourront rejoindre le même projet juste après."
            : "Choisissez l'application à analyser. Dans cette version, Eflex déploie une seule application par projet."}
        </p>
      </CardHeader>
      <CardContent>
        <fieldset disabled={analyzing} className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Application à analyser</legend>
          {apps.map((app, index) => (
            <label
              key={app.root === '' ? 'racine' : app.root}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name="app"
                value={app.root}
                checked={selectedRoot === app.root}
                onChange={() => onSelect(app.root)}
                className="accent-primary"
              />
              {app.framework && (
                <FrameworkIcon framework={app.framework} alt="" className="h-5 w-5 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{app.name}</span>
                  {index === 0 && <Badge variant="outline">Proposée</Badge>}
                </span>
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
