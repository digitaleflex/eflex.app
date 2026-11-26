import Link from 'next/link'
import { Activity, AlertTriangle, CheckCircle2, Globe } from 'lucide-react'
import { requireAdminPage } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const metadata = { title: 'Surveillance des sites — Administration' }
export const dynamic = 'force-dynamic'

const dt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })

function fmt(value: Date | null): string {
  return value ? dt.format(value) : '—'
}

function causeLabel(cause: string | null): string {
  switch (cause) {
    case 'dns': return 'DNS'
    case 'tls': return 'TLS'
    case 'http': return 'HTTP'
    case 'timeout': return 'Délai dépassé'
    case 'network': return 'Réseau'
    default: return 'Indisponibilité'
  }
}

export default async function AdminMonitoringPage() {
  await requireAdminPage('admin.monitoring.read')

  const [monitors, incidents, openCount, downCount] = await Promise.all([
    prisma.projectSiteMonitor.findMany({
      where: { enabled: true },
      include: {
        project: { select: { id: true, name: true, organization: { select: { name: true } } } },
      },
      orderBy: [{ lastStatus: 'asc' }, { lastCheckedAt: 'desc' }],
      take: 300,
    }),
    prisma.projectSiteIncident.findMany({
      include: {
        project: { select: { id: true, name: true, organization: { select: { name: true } } } },
      },
      orderBy: { openedAt: 'desc' },
      take: 150,
    }),
    prisma.projectSiteIncident.count({ where: { status: 'open' } }),
    prisma.projectSiteMonitor.count({ where: { enabled: true, lastStatus: 'down' } }),
  ])

  const openByMonitor = new Set(incidents.filter((i) => i.status === 'open').map((i) => i.monitorId))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Surveillance des sites clients"
        description="Sondes continues HTTP, DNS et TLS sur les domaines connus des projets. Les incidents sont confirmés, dédoublonnés et clos au rétablissement. Ne remplace pas les alertes ressources (#122)."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Sites surveillés</p></CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">{monitors.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Incidents ouverts</p></CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">{openCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><p className="text-sm text-muted-foreground">Sites en échec</p></CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">{downCount}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-4 w-4 text-primary" aria-hidden="true" /> État courant</h2>
          <p className="text-sm text-muted-foreground">Dernière vérification et statut par domaine surveillé.</p>
        </CardHeader>
        <CardContent>
          {monitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun site surveillé pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Projet</th>
                    <th className="px-2 py-2 font-medium">Organisation</th>
                    <th className="px-2 py-2 font-medium">Domaine</th>
                    <th className="px-2 py-2 font-medium">Statut</th>
                    <th className="px-2 py-2 font-medium">Dernière vérification</th>
                    <th className="px-2 py-2 font-medium">HTTP / latence</th>
                    <th className="px-2 py-2 font-medium">DNS / TLS</th>
                  </tr>
                </thead>
                <tbody>
                  {monitors.map((m) => {
                    const open = openByMonitor.has(m.id) || m.lastStatus === 'down'
                    return (
                      <tr key={m.id} className="border-b border-border align-top">
                        <td className="px-2 py-2">
                          <Link href={`/admin/projects/${m.project.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                            {m.project.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{m.project.organization.name}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs"><Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{m.host}</div>
                          {m.label && <div className="text-xs text-muted-foreground">{m.label}</div>}
                          {m.lastError && open && <div className="mt-1 text-xs text-destructive">{m.lastError}</div>}
                        </td>
                        <td className="px-2 py-2">
                          {open ? (
                            <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Incident / échec</span>
                          ) : m.lastStatus === 'up' ? (
                            <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> En ligne</span>
                          ) : (
                            <span className="text-muted-foreground">Inconnu</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{fmt(m.lastCheckedAt)}</td>
                        <td className="px-2 py-2 tabular-nums text-muted-foreground">
                          {m.lastHttpStatus ?? '—'}{typeof m.lastLatencyMs === 'number' ? ` · ${m.lastLatencyMs} ms` : ''}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          DNS {m.lastDnsOk == null ? '—' : m.lastDnsOk ? 'OK' : 'KO'} · TLS {m.lastTlsOk == null ? '—' : m.lastTlsOk ? 'valide' : 'invalide'}
                          {m.lastTlsExpiresAt ? <span className="block text-xs">expire le {dateOnly.format(m.lastTlsExpiresAt)}</span> : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-lg font-semibold">Historique des incidents</h2>
          <p className="text-sm text-muted-foreground">Ouvertures et rétablissements récents, tous projets confondus.</p>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun incident enregistré.</p>
          ) : (
            <ul className="divide-y divide-border">
              {incidents.map((incident) => (
                <li key={incident.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {incident.status === 'open' ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                        )}
                        <Link href={`/admin/projects/${incident.project.id}`} className="hover:underline">{incident.project.name}</Link>
                        <span className="font-mono text-xs text-muted-foreground">{incident.host}</span>
                        <span className="rounded-full border border-border px-1.5 text-xs font-normal text-muted-foreground">{causeLabel(incident.cause)}</span>
                        <span className={incident.status === 'open' ? 'text-destructive' : 'text-success'}>
                          {incident.status === 'open' ? 'Ouvert' : 'Résolu'}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{incident.summary}</p>
                      {incident.details && <p className="mt-0.5 text-xs text-muted-foreground">{incident.details}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {incident.project.organization.name} · Ouvert le <time dateTime={incident.openedAt.toISOString()}>{fmt(incident.openedAt)}</time>
                        {incident.resolvedAt ? <> · Résolu le <time dateTime={incident.resolvedAt.toISOString()}>{fmt(incident.resolvedAt)}</time></> : null}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
