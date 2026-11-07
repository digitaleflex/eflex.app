import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, GitBranch, Globe, KeyRound } from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FrameworkIcon } from '@/components/framework-icon'

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  live: { label: 'En ligne', variant: 'success' },
  building: { label: 'Build en cours', variant: 'warning' },
  deploying: { label: 'Déploiement en cours', variant: 'warning' },
  pending: { label: 'En attente', variant: 'outline' },
  failed: { label: 'Échec', variant: 'destructive' },
  rollbacked: { label: 'Annulé', variant: 'outline' },
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: {
      envVars: { select: { key: true }, orderBy: { key: 'asc' } },
      deployments: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  if (!project) notFound()

  const last = project.deployments[0]
  const lastStatus = last ? STATUS[last.status] ?? { label: last.status, variant: 'outline' as const } : null

  return (
    <div className="space-y-8 max-w-5xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 min-h-11 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Tous les projets
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 w-12 h-12 rounded-xl border border-border bg-card flex items-center justify-center">
            {project.framework ? (
              <FrameworkIcon framework={project.framework} alt="" className="h-7 w-7" />
            ) : (
              <span className="text-lg font-bold text-primary" aria-hidden="true">{project.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">{project.name}</h1>
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground font-mono break-all"
            >
              {project.repoUrl.replace(/^https?:\/\//, '')}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="sr-only">(nouvel onglet)</span>
            </a>
          </div>
        </div>
        {lastStatus && <Badge variant={lastStatus.variant} className="self-start">{lastStatus.label}</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><GitBranch className="w-4 h-4" aria-hidden="true" />Branche</p>
            <p className="font-medium font-mono">{project.branch}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Globe className="w-4 h-4" aria-hidden="true" />Domaine</p>
            {project.domain ? (
              <a href={`https://${project.domain}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline break-all">
                {project.domain}
              </a>
            ) : (
              <p className="font-medium text-muted-foreground">Aucun domaine</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="text-xs text-muted-foreground">Stack</p>
            <p className="font-medium">
              {project.framework || 'Détection automatique'}
              {project.runtime && <span className="text-muted-foreground font-mono text-sm"> · {project.runtime}</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Déploiements</h2>
        </CardHeader>
        <CardContent>
          {project.deployments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun déploiement pour ce projet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {project.deployments.map((d) => {
                const s = STATUS[d.status] ?? { label: d.status, variant: 'outline' as const }
                return (
                  <li key={d.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium">{dateFormat.format(d.createdAt)}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {d.commitSha === 'pending' ? 'Commit en attente' : d.commitSha.slice(0, 7)}
                      </p>
                      {d.status === 'failed' && d.logsSummary && (
                        <p className="text-xs text-destructive break-words">{d.logsSummary}</p>
                      )}
                    </div>
                    <Badge variant={s.variant} className="self-start sm:self-center">{s.label}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" aria-hidden="true" />Variables d&apos;environnement</h2>
        </CardHeader>
        <CardContent>
          {project.envVars.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune variable définie.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {project.envVars.map((v) => (
                <li key={v.key} className="font-mono text-xs rounded-md border border-border bg-muted/50 px-2 py-1">{v.key}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
