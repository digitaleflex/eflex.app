import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, GitBranch, Globe, KeyRound } from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FrameworkIcon } from '@/components/framework-icon'
import { DeploymentPanel, type DeploymentView } from '@/components/deployment-panel'
import { STATUS_LABELS, isDeploymentStatus } from '@/lib/deployment-state'
import { confidenceLevel, frameworkLabel, runtimeLabel } from '@/lib/frameworks'

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  queued: { label: STATUS_LABELS.queued, variant: 'outline' },
  analyzing: { label: STATUS_LABELS.analyzing, variant: 'warning' },
  provisioning: { label: STATUS_LABELS.provisioning, variant: 'warning' },
  live: { label: STATUS_LABELS.live, variant: 'success' },
  building: { label: STATUS_LABELS.building, variant: 'warning' },
  deploying: { label: STATUS_LABELS.deploying, variant: 'warning' },
  pending: { label: 'En attente', variant: 'outline' },
  failed: { label: STATUS_LABELS.failed, variant: 'destructive' },
  cancelled: { label: STATUS_LABELS.cancelled, variant: 'outline' },
  rollbacked: { label: 'Annulé', variant: 'outline' },
}

type StoredAnalysis = { confidence?: number; reasons: string[]; commitSha?: string }

/** `Project.detection` est du JSON libre en base : on ne retient que ce qu'on sait afficher. */
function readAnalysis(value: unknown): StoredAnalysis | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return {
    confidence: typeof v.confidence === 'number' ? v.confidence : undefined,
    reasons: Array.isArray(v.reasons) ? v.reasons.filter((r): r is string => typeof r === 'string') : [],
    commitSha: typeof v.commitSha === 'string' ? v.commitSha : undefined,
  }
}

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

  const analysis = readAnalysis(project.detection)
  const last = project.deployments[0]
  const lastStatus = last ? STATUS[last.status] ?? { label: last.status, variant: 'outline' as const } : null
  const deploymentViews: DeploymentView[] = project.deployments.map((d) => ({
    id: d.id,
    status: d.status,
    label: isDeploymentStatus(d.status) ? STATUS_LABELS[d.status] : d.status,
    commitSha: d.commitSha,
    logsSummary: d.logsSummary,
    createdAt: d.createdAt.toISOString(),
  }))

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
              {project.framework ? frameworkLabel(project.framework) : 'Détection automatique'}
              {project.runtime && <span className="text-muted-foreground text-sm"> · {runtimeLabel(project.runtime)}</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {analysis && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Détection</h2>
              {typeof analysis.confidence === 'number' && (
                <Badge variant={confidenceLevel(analysis.confidence).tone}>
                  {confidenceLevel(analysis.confidence).label} · {Math.round(analysis.confidence * 100)} %
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.reasons.length > 0 && (
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {analysis.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            )}
            {analysis.commitSha && (
              <p className="text-xs text-muted-foreground">
                Analysé sur le commit <code className="font-mono">{analysis.commitSha.slice(0, 7)}</code>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <DeploymentPanel projectId={project.id} initial={deploymentViews} />

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
