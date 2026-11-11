import Link from 'next/link'
import { ArrowLeft, CircleAlert, RefreshCw } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listApplications } from '@/lib/coolify'
import { reconcileApplications, type AdminApplicationRef } from '@/lib/admin-projects'

export const metadata = { title: 'Réconciliation — Administration Eflex' }
export const dynamic = 'force-dynamic'

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

function applicationRef(raw: Record<string, unknown>): AdminApplicationRef | null {
  const id = typeof raw.uuid === 'string' ? raw.uuid : typeof raw.id === 'string' ? raw.id : null
  if (!id) return null
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : id
  return { id, name }
}

/**
 * Réconciliation en **lecture seule** entre les applications Coolify et les
 * projets en base (issue #28). Aucune suppression n'est effectuée ici : les
 * écarts sont listés pour une intervention manuelle.
 */
export default async function AdminReconciliationPage() {
  await requireAdminPage()

  const projects = await prisma.project.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      coolifyAppId: true,
      organization: { select: { name: true } },
      apps: {
        orderBy: { position: 'asc' },
        select: { id: true, name: true, coolifyAppId: true },
      },
    },
  })

  const listed = await listApplications(8_000)
  const checkedAt = new Date()

  const refs = projects.map((project) => {
    const appRefs =
      project.apps.length > 0
        ? project.apps.map((app) => ({ label: app.name, coolifyAppId: app.coolifyAppId }))
        : undefined
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      coolifyAppId: project.coolifyAppId,
      organizationName: project.organization.name,
      ...(appRefs ? { appRefs } : {}),
    }
  })

  const applications = 'applications' in listed
    ? listed.applications.map(applicationRef).filter((app): app is AdminApplicationRef => app !== null)
    : []
  const error = 'error' in listed ? listed.error : null
  const result = error ? null : reconcileApplications({ projects: refs, applications })

  return (
    <div className="space-y-6">
      <Link href="/admin/projects" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tous les projets
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Réconciliation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comparaison entre les applications de l’hébergement et les projets en base. Lecture seule : aucune
            suppression n’est effectuée automatiquement.
          </p>
        </div>
        <Link
          href="/admin/projects/reconciliation"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Recontrôler
        </Link>
      </div>

      <p className="text-xs text-muted-foreground tabular-nums">
        Contrôle effectué le {dateTime.format(checkedAt)} · {projects.length} projet{projects.length > 1 ? 's' : ''} en base
        {error ? '' : ` · ${applications.length} application${applications.length > 1 ? 's' : ''} côté hébergement`}.
      </p>

      {error && (
        <Card className="p-4">
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              L’hébergement est injoignable : {error}. La comparaison est impossible pour le moment ; réessayez une fois
              le service rétabli.
            </span>
          </p>
        </Card>
      )}

      {result && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
              <h2 className="text-sm font-semibold">Applications sans projet en base</h2>
              <Badge variant={result.orphans.length === 0 ? 'success' : 'warning'}>{result.orphans.length}</Badge>
            </div>
            {result.orphans.length === 0 ? (
              <p className="p-4 pt-0 text-sm text-muted-foreground">
                Aucune application orpheline : tout ce qui tourne est rattaché à un projet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {result.orphans.map((application) => (
                  <li key={application.id} className="space-y-1 px-4 py-3">
                    <p className="text-sm font-medium">{application.name}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{application.id}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-4 pb-4 pt-2 text-xs text-muted-foreground">
              Une application orpheline peut être un service géré hors Eflex (proxy, outil interne). Vérifiez avant
              toute suppression manuelle dans Coolify.
            </p>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
              <h2 className="text-sm font-semibold">Références d’applications absentes côté hébergement</h2>
              <Badge variant={result.missing.length === 0 ? 'success' : 'warning'}>{result.missing.length}</Badge>
            </div>
            {result.missing.length === 0 ? (
              <p className="p-4 pt-0 text-sm text-muted-foreground">
                Toutes les références d’applications des projets existent côté hébergement.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {result.missing.map((entry) => (
                  <li key={`${entry.id}:${entry.missingCoolifyAppId}`} className="space-y-1 px-4 py-3">
                    <Link href={`/admin/projects/${entry.id}`} className="text-sm font-medium hover:underline">
                      {entry.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {entry.organizationName} · <span className="font-mono">{entry.slug}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Application : <span className="font-medium text-foreground">{entry.missingAppLabel}</span>
                    </p>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      Référence : {entry.missingCoolifyAppId}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-4 pb-4 pt-2 text-xs text-muted-foreground">
              Application supprimée hors Eflex ? Ouvrez la fiche du projet : vous pouvez relancer un déploiement pour la
              recréer ou corriger la référence depuis les opérations d’infrastructure.
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
