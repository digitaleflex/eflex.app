import type { Metadata } from 'next'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { collectStatus } from '@/lib/status'
import {
  OVERALL_LABELS,
  STATE_LABELS,
  type ComponentState,
  type OverallState,
} from '@/lib/status-model'
import {
  formatStatusDate,
  observedAge,
  sampleCountLabel,
  uptimePercentLabel,
} from '@/lib/status-view'
import type { IncidentView as Incident } from '@/lib/status'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Statut des services — Eflex',
  description:
    'État observé des services Eflex : portail, base de données, cache, déploiement et moteur Axiom, avec l’historique des relevés et des incidents déclarés.',
}

type BadgeVariant = 'success' | 'warning' | 'destructive' | 'outline'

const STATE_VARIANT: Record<ComponentState, BadgeVariant> = {
  ok: 'success',
  degraded: 'warning',
  down: 'destructive',
  unknown: 'outline',
}

const STATE_DOT: Record<ComponentState, string> = {
  ok: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-destructive',
  unknown: 'bg-muted-foreground/50',
}

const STATE_HINT: Record<ComponentState, string> = {
  ok: 'Réponse reçue dans le délai imparti.',
  degraded: 'Réponse reçue, mais incomplète ou anormale.',
  down: 'Aucune réponse dans le délai de 3 secondes.',
  unknown: 'Service non configuré ou non déployé : il n’est pas sondé.',
}

const OVERALL_VARIANT: Record<OverallState, BadgeVariant> = {
  ok: 'success',
  degraded: 'warning',
  down: 'destructive',
}

const OVERALL_BADGE: Record<OverallState, string> = {
  ok: 'Aucune anomalie détectée',
  degraded: 'Dégradé',
  down: 'Indisponible',
}

const INCIDENT_STATUS: Record<string, string> = {
  investigating: 'Investigation en cours',
  identified: 'Cause identifiée',
  monitoring: 'Surveillance',
  resolved: 'Résolu',
}

const INCIDENT_SEVERITY: Record<string, string> = {
  minor: 'Mineur',
  major: 'Majeur',
  critical: 'Critique',
}

function IncidentItem({ incident }: { incident: Incident }) {
  return (
    <li className="border-b border-border py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{incident.title}</span>
        <Badge variant={incident.status === 'resolved' ? 'success' : 'warning'}>
          {INCIDENT_STATUS[incident.status] ?? incident.status}
        </Badge>
        <Badge variant="outline">{INCIDENT_SEVERITY[incident.severity] ?? incident.severity}</Badge>
      </div>
      {incident.description && (
        <p className="mt-1.5 text-sm text-muted-foreground">{incident.description}</p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Début : <time dateTime={incident.startedAt}>{formatStatusDate(incident.startedAt)}</time>
        {incident.resolvedAt && (
          <> · Résolu le <time dateTime={incident.resolvedAt}>{formatStatusDate(incident.resolvedAt)}</time></>
        )}
      </p>
    </li>
  )
}

export default async function StatusPage() {
  const snapshot = await collectStatus()
  const okCount = snapshot.components.filter((c) => c.state === 'ok').length
  const watchedCount = snapshot.components.filter((c) => c.state !== 'unknown').length
  const unknownCount = snapshot.components.length - watchedCount
  const age = observedAge(snapshot.checkedAt)

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="container flex-1 py-10 sm:py-14 space-y-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-display-sm font-bold">Statut des services</h1>
            <Badge variant="outline">État instantané</Badge>
          </div>
          <p className="max-w-3xl text-muted-foreground">
            Chaque ouverture de cette page vérifie en direct les services d’Eflex. Vous y trouvez aussi
            l’historique de disponibilité et les incidents signalés par l’équipe.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <p>
              Dernière vérification :{' '}
              <time dateTime={snapshot.checkedAt} className="font-medium text-foreground">
                {formatStatusDate(snapshot.checkedAt)}
              </time>{' '}
              <span className="text-muted-foreground">({age})</span>
            </p>
            <Link
              href="/status"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Actualiser l’état
            </Link>
          </div>
        </header>

        {snapshot.maintenance.enabled && (
          <Card className="border-warning/40 bg-warning/10 p-5">
            <div role="status" className="space-y-1">
              <p className="font-semibold text-warning">Maintenance en cours</p>
              <p className="text-sm text-foreground">
                {snapshot.maintenance.message ||
                  'Les services peuvent être momentanément indisponibles pendant l’opération.'}
              </p>
              <Link href="/maintenance" className="inline-block text-sm font-medium underline underline-offset-2 hover:no-underline">
                Voir la page de maintenance
              </Link>
            </div>
          </Card>
        )}

        <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-full', STATE_DOT[snapshot.status])}
            />
            <div>
              <p className="font-semibold">{OVERALL_LABELS[snapshot.status]}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {okCount} composant{okCount === 1 ? '' : 's'} sur {watchedCount} surveillé
                {watchedCount === 1 ? '' : 's'} signalé{okCount === 1 ? '' : 's'} opérationnel
                {okCount === 1 ? '' : 's'}
                {unknownCount > 0 &&
                  ` · ${unknownCount} non surveillé${unknownCount > 1 ? 's' : ''}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Relevé {age}. Une panne d’un service périphérique dégrade l’ensemble ; une panne du
                portail ou de la base le rend indisponible.
              </p>
            </div>
          </div>
          <Badge variant={OVERALL_VARIANT[snapshot.status]} className="w-fit">
            {OVERALL_BADGE[snapshot.status]}
          </Badge>
        </Card>

        <section aria-labelledby="composants" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="composants" className="text-xl font-semibold">
              Composants sondés
            </h2>
            <p className="text-sm text-muted-foreground">Relevé {age}</p>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Chaque composant doit répondre en moins de 3 secondes. Un composant « non surveillé » n’est
            pas configuré : il n’entre pas dans l’état global.
          </p>
          <Card>
            <ul className="divide-y divide-border">
              {snapshot.components.map((component) => (
                <li
                  key={component.key}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden
                      className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', STATE_DOT[component.state])}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{component.label}</p>
                      <p className="text-xs text-muted-foreground">{component.detail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {component.latencyMs !== null && (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {component.latencyMs} ms
                      </span>
                    )}
                    <Badge variant={STATE_VARIANT[component.state]}>
                      {STATE_LABELS[component.state]}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground sm:grid-cols-2">
            {(Object.keys(STATE_HINT) as ComponentState[]).map((state) => (
              <p key={state} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', STATE_DOT[state])}
                />
                <span>
                  <span className="font-medium text-foreground">{STATE_LABELS[state]}</span> —{' '}
                  {STATE_HINT[state]}
                </span>
              </p>
            ))}
          </div>
        </section>

        <section aria-labelledby="disponibilite" className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id="disponibilite" className="text-xl font-semibold">
              Disponibilité observée
            </h2>
            <Badge variant="outline">Historique</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Part des relevés où les composants répondaient normalement, sur chaque période.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {snapshot.uptime.map((entry) => (
              <Card key={entry.window} className="p-5 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">{entry.window}</p>
                  {entry.samples > 0 && (
                    <p className="text-xs text-muted-foreground">{sampleCountLabel(entry.samples)}</p>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums">{uptimePercentLabel(entry.percent)}</p>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className={cn(
                      'h-full rounded-full',
                      entry.percent === null ? 'bg-transparent' : 'bg-success',
                    )}
                    style={{ width: `${entry.percent ?? 0}%` }}
                  />
                </div>
                {entry.percent === null ? (
                  <p className="text-xs text-muted-foreground">
                    Pas encore assez de relevés pour calculer un pourcentage.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Calculé sur {sampleCountLabel(entry.samples)} de composants.
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="limites" className="space-y-4">
          <h2 id="limites" className="text-xl font-semibold">
            À propos de ces mesures
          </h2>
          <Card className="p-5 sm:p-6">
            <p className="text-sm text-muted-foreground">
              Un relevé est fait au plus une fois par minute, à la consultation de cette page ou de{' '}
              <code className="font-mono text-xs">/api/status</code> ; il vérifie les services de la plateforme,
              pas chaque application déployée.
            </p>
          </Card>
        </section>

        <section aria-labelledby="incidents" className="space-y-4">
          <div className="space-y-1">
            <h2 id="incidents" className="text-xl font-semibold">
              Incidents déclarés
            </h2>
            <p className="text-sm text-muted-foreground">
              Signalés par l’équipe, du plus récent au plus ancien. Les 20 derniers sont affichés.
            </p>
          </div>
          <Card className="px-5">
            {snapshot.incidents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium">Aucun incident signalé pour le moment.</p>
              </div>
            ) : (
              <ul>
                {snapshot.incidents.map((incident) => (
                  <IncidentItem key={incident.id} incident={incident} />
                ))}
              </ul>
            )}
          </Card>
        </section>

        <footer className="flex flex-wrap items-center gap-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            Retour à l’accueil
          </Link>
          <Link href="/api/status" className="font-mono text-xs hover:text-foreground hover:underline">
            /api/status (JSON)
          </Link>
          <Link href="/maintenance" className="hover:text-foreground hover:underline">
            Maintenance
          </Link>
        </footer>
      </main>
    </div>
  )
}
