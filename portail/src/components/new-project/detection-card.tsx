import { Info, Terminal, TriangleAlert } from 'lucide-react'
import type { BuildPlan, DetectionResult } from '@eflex/detector'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FrameworkIcon } from '@/components/framework-icon'
import { confidenceLevel, frameworkLabel, runtimeLabel } from '@/lib/frameworks'

function Command({ label, value, fallback }: { label: string; value?: string; fallback?: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        {value ? (
          <code className="block overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-xs sm:text-sm">{value}</code>
        ) : (
          <span className="text-sm text-muted-foreground">{fallback ?? '—'}</span>
        )}
      </dd>
    </div>
  )
}

/** Résumé de ce que le détecteur a compris, avec ses raisons. */
export function DetectionCard({
  plan,
  detection,
  headingRef,
}: {
  plan: BuildPlan
  detection: DetectionResult
  headingRef?: React.Ref<HTMLHeadingElement>
}) {
  const level = confidenceLevel(detection.confidence)
  const isPrimary = plan.framework === detection.plan?.framework
  const services = Object.entries(plan.services ?? {})
  const questions = detection.questions.filter((q) => q.id !== 'app')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
              <FrameworkIcon framework={plan.framework} alt="" className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
                {frameworkLabel(plan.framework)}
              </h2>
              <p className="text-sm text-muted-foreground">
                {runtimeLabel(plan.runtime)}
                {plan.root && <span className="font-mono"> · {plan.root}</span>}
              </p>
            </div>
          </div>
          {isPrimary ? (
            <Badge variant={level.tone}>
              {level.label} · {Math.round(detection.confidence * 100)} %
            </Badge>
          ) : (
            <Badge variant="outline">Choix manuel</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <dl className="space-y-3">
          <Command label="Installation" value={plan.install} />
          <Command label="Build" value={plan.build} />
          <Command label="Démarrage" value={plan.start} fallback={services.length > 0 ? 'Assuré par les services ci-dessous' : undefined} />
          <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
            <dt className="text-sm text-muted-foreground">Port</dt>
            <dd className="text-sm font-mono">{plan.port}</dd>
          </div>
        </dl>

        {services.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Services lancés</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {services.map(([name, spec]) => (
                <li key={name} className="rounded-lg border border-border px-3 py-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Terminal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {name}
                  </p>
                  <code className="mt-1 block truncate font-mono text-xs text-muted-foreground" title={spec.command}>
                    {spec.command}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan.postDeploy && plan.postDeploy.length > 0 && (
          <details className="group rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
              Commandes exécutées après chaque déploiement ({plan.postDeploy.length})
            </summary>
            <ul className="mt-3 space-y-1">
              {plan.postDeploy.map((command) => (
                <li key={command}>
                  <code className="font-mono text-xs">{command}</code>
                </li>
              ))}
            </ul>
          </details>
        )}

        {isPrimary && detection.reasons.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Pourquoi ce choix ?</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {detection.reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isPrimary && detection.warnings.length > 0 && (
          <div role="note" className="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-warning">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />À savoir
            </p>
            <ul className="mt-2 space-y-1 text-sm text-warning">
              {detection.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {isPrimary && questions.length > 0 && (
          <div role="note" className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Info className="h-4 w-4" aria-hidden="true" />À vérifier
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {questions.map((question) => (
                <li key={question.id}>
                  {question.prompt}
                  {question.default && (
                    <>
                      {' '}
                      Valeur retenue : <code className="font-mono text-xs">{question.default}</code>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Pour fixer ces choix, ajoutez un fichier <code className="font-mono">eflex.json</code> à la racine du dépôt.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
