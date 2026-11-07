import type { Metadata } from 'next'
import Link from 'next/link'
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
import type { IncidentView as Incident } from '@/lib/status'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Statut des services — Eflex',
  description:
    'Disponibilité en temps réel de la plateforme Eflex : portail, base de données, cache, déploiement et moteur Axiom.',
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
  degraded: 'bg-amber-500',
  down: 'bg-destructive',
  unknown: 'bg-muted-foreground/50',
}

const OVERALL_VARIANT: Record<OverallState, BadgeVariant> = {
  ok: 'success',
  degraded: 'warning',
  down: 'destructive',
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }) + ' UTC'
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
        Début : {formatDate(incident.startedAt)}
        {incident.resolvedAt && ` · Résolu le ${formatDate(incident.resolvedAt)}`}
      </p>
    </li>
  )
}

export default async function StatusPage() {
  const snapshot = await collectStatus()

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main className="container flex-1 py-10 sm:py-14 space-y-10">
        <header className="space-y-3">
          <p className="text-sm font-medium text-primary">Eflex · Disponibilité</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Statut des services</h1>
          <p className="text-muted-foreground">
            État en temps réel de la plateforme. Dernière vérification : {formatDate(snapshot.checkedAt)}.
          </p>
        </header>

        <Card className="p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className={`h-3 w-3 shrink-0 rounded-full ${STATE_DOT[snapshot.status]}`}
            />
            <div>
              <p className="font-semibold">{OVERALL_LABELS[snapshot.status]}</p>
              <p className="text-sm text-muted-foreground">
                {snapshot.components.filter((c) => c.state === 'ok').length} composant(s) opérationnel(s)
                {' '}sur {snapshot.components.length}
              </p>
            </div>
          </div>
          <Badge variant={OVERALL_VARIANT[snapshot.status]} className="w-fit">
            {snapshot.status === 'ok' ? 'Tout va bien' : snapshot.status === 'degraded' ? 'Dégradé' : 'Indisponible'}
          </Badge>
        </Card>

        <section aria-labelledby="composants" className="space-y-4">
          <h2 id="composants" className="text-xl font-semibold">Composants</h2>
          <Card className="divide-y divide-border">
            {snapshot.components.map((component) => (
              <div key={component.key} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${STATE_DOT[component.state]}`} />
                  <div>
                    <p className="font-medium">{component.label}</p>
                    <p className="text-xs text-muted-foreground">{component.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {component.latencyMs !== null && (
                    <span className="text-xs text-muted-foreground font-mono">{component.latencyMs} ms</span>
                  )}
                  <Badge variant={STATE_VARIANT[component.state]}>
                    {STATE_LABELS[component.state]}
                  </Badge>
                </div>
              </div>
            ))}
          </Card>
        </section>

        <section aria-labelledby="disponibilite" className="space-y-4">
          <div>
            <h2 id="disponibilite" className="text-xl font-semibold">Disponibilité</h2>
            <p className="text-sm text-muted-foreground">
              Part des relevés de composants « opérationnels » sur la période. Les données se constituent au fil des vérifications.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {snapshot.uptime.map((entry) => (
              <Card key={entry.window} className="p-5 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{entry.window}</p>
                <p className="text-2xl font-bold">
                  {entry.percent === null ? '—' : `${entry.percent.toFixed(1)} %`}
                </p>
                <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <div
                    className="h-full rounded-full bg-success transition-all"
                    style={{ width: `${entry.percent ?? 0}%` }}
                  />
                </div>
                {entry.percent === null && (
                  <p className="text-xs text-muted-foreground">Collecte en cours</p>
                )}
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="incidents" className="space-y-4">
          <div>
            <h2 id="incidents" className="text-xl font-semibold">Historique des incidents</h2>
            <p className="text-sm text-muted-foreground">Les 20 derniers événements déclarés.</p>
          </div>
          <Card className="px-5">
            {snapshot.incidents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucun incident signalé. Tout s&apos;est bien passé jusqu&apos;ici.
              </p>
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
            Retour à l&apos;accueil
          </Link>
          <Link href="/api/status" className="hover:text-foreground hover:underline font-mono text-xs">
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
