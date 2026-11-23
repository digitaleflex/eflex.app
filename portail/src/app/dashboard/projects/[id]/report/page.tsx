import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { loadSiteReport, parseMonth } from '@/lib/site-report'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PrintButton } from '@/components/print-button'

export const metadata = { title: 'Rapport d’exploitation — EFLEX' }
export const dynamic = 'force-dynamic'

const CAUSES: Record<string, string> = {
  http: 'Erreur HTTP',
  dns: 'DNS',
  tls: 'Certificat',
  timeout: 'Délai dépassé',
  network: 'Réseau',
  inconnue: 'Cause inconnue',
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(year, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return `${MONTHS[m - 1]} ${year}`
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

export default async function ProjectReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const { id } = await params
  const org = await resolveOrganization(session)
  if (!org) notFound()
  // Même périmètre que la page projet : un projet d'une autre organisation n'existe pas pour ce membre.
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: { id: true, name: true },
  })
  if (!project) notFound()

  const { month: monthParam } = await searchParams
  const period = parseMonth(monthParam)
  if (!period) redirect(`/dashboard/projects/${id}/report`)
  const report = await loadSiteReport(id, period)
  const prev = shiftMonth(period.month, -1)
  const next = shiftMonth(period.month, 1)
  const current = parseMonth(null)!.month

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Rapport d’exploitation</p>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{monthLabel(report.month)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link href={`/dashboard/projects/${id}/report?month=${prev}`} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            Mois précédent
          </Link>
          {next <= current && (
            <Link href={`/dashboard/projects/${id}/report?month=${next}`} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
              Mois suivant
            </Link>
          )}
          <PrintButton />
        </div>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Déploiements</h2>
        </CardHeader>
        <CardContent>
          {report.deployments.total === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun déploiement ce mois-ci.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Total</dt><dd className="text-lg font-semibold tabular-nums">{report.deployments.total}</dd></div>
              <div><dt className="text-muted-foreground">En ligne</dt><dd className="text-lg font-semibold tabular-nums">{report.deployments.live}</dd></div>
              <div><dt className="text-muted-foreground">Échoués</dt><dd className="text-lg font-semibold tabular-nums">{report.deployments.failed}</dd></div>
              <div><dt className="text-muted-foreground">Annulés (retour arrière)</dt><dd className="text-lg font-semibold tabular-nums">{report.deployments.rollbacked}</dd></div>
            </dl>
          )}
          {report.deployments.lastAt && (
            <p className="mt-3 text-sm text-muted-foreground">Dernier déploiement : {new Date(report.deployments.lastAt).toLocaleString('fr-FR', { timeZone: 'UTC' })} (UTC)</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Disponibilité</h2>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!report.availability.measured ? (
            <p className="text-muted-foreground">Aucune sonde n’est configurée pour ce projet : la disponibilité n’est pas mesurée.</p>
          ) : (
            <>
              <p>
                <span className="text-2xl font-semibold tabular-nums">{report.availability.percent?.toLocaleString('fr-FR')} %</span>{' '}
                <span className="text-muted-foreground">estimée</span>
              </p>
              <p>{report.availability.incidents} incident(s), {duration(report.availability.downtimeMinutes)} d’indisponibilité détectée.</p>
              {Object.keys(report.availability.byCause).length > 0 && (
                <ul className="list-inside list-disc text-muted-foreground">
                  {Object.entries(report.availability.byCause).map(([cause, count]) => (
                    <li key={cause}>{CAUSES[cause] ?? cause} : {count}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Estimation à partir des incidents détectés par des sondes toutes les 5 minutes : ce n’est pas une garantie contractuelle.</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Sauvegardes des bases</h2>
        </CardHeader>
        <CardContent className="text-sm">
          {report.databases.length === 0 ? (
            <p className="text-muted-foreground">Ce projet n’a pas de base de données managée.</p>
          ) : (
            <ul className="space-y-1">
              {report.databases.map((db, index) => (
                <li key={`${db.kind}-${index}`}>
                  <span className="font-medium">{db.kind}</span> : sauvegarde {db.backupScheduled ? 'planifiée' : 'non planifiée'}
                  {db.lastRestoreFinishedAt ? `, dernière restauration testée le ${new Date(db.lastRestoreFinishedAt).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} (${db.lastRestoreStatus ?? 'statut inconnu'})` : ', aucune restauration testée enregistrée'}.
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Non mesuré</h2>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Ces informations ne figurent pas dans ce rapport, faute de source de mesure :</p>
          <ul className="mt-1 list-inside list-disc">
            {report.notMeasured.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
