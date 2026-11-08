import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, GitBranch, Globe, KeyRound } from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FrameworkIcon } from '@/components/framework-icon'
import { AutoRefresh } from '@/components/auto-refresh'
import { DeploymentLogs } from '@/components/deployment-logs'
import { CoolifyClient, loadCoolifyConfig } from '@/lib/coolify'
import { syncDeployment } from '@/lib/deployer'
import { confidenceLevel, frameworkLabel, runtimeLabel } from '@/lib/frameworks'

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  live: { label: 'En ligne', variant: 'success' },
  building: { label: 'Build en cours', variant: 'warning' },
  deploying: { label: 'Déploiement en cours', variant: 'warning' },
  pending: { label: 'En attente', variant: 'outline' },
  failed: { label: 'Échec', variant: 'destructive' },
  rollbacked: { label: 'Annulé', variant: 'outline' },
}

type StoredAnalysis = { confidence?: number; reasons: string[]; warnings: string[]; commitSha?: string }

/** `Project.detection` est du JSON libre en base : on ne retient que ce qu'on sait afficher. */
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [])

function readAnalysis(value: unknown): StoredAnalysis | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return {
    confidence: typeof v.confidence === 'number' ? v.confidence : undefined,
    reasons: strings(v.reasons),
    warnings: [...strings(v.warnings), ...strings(v.deployWarnings)],
    commitSha: typeof v.commitSha === 'string' ? v.commitSha : undefined,
  }
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const org = await resolveOrganization(session)
  if (!org) notFound()
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    include: {
      envVars: { select: { key: true }, orderBy: { key: 'asc' } },
      deployments: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  if (!project) notFound()

  // Tant que le déploiement est en cours, on demande son état à Coolify (sans bloquer la page
  // si Coolify tarde ou n'est pas configuré : on affiche alors l'état enregistré).
  let deployments = project.deployments
  const latest = deployments[0]
  if (latest) {
    try {
      const patch = await syncDeployment(new CoolifyClient(loadCoolifyConfig(), fetch, 4_000), latest)
      if (patch) {
        await prisma.deployment.update({ where: { id: latest.id }, data: patch })
        deployments = [{ ...latest, ...patch, logsSummary: patch.logsSummary ?? latest.logsSummary }, ...deployments.slice(1)]
      }
    } catch {
      // Configuration Coolify absente ou incomplète.
    }
  }

  const analysis = readAnalysis(project.detection)
  const last = deployments[0]
  const inProgress = last !== undefined && ['pending', 'building', 'deploying'].includes(last.status) && last.coolifyBuildId !== null
  const lastStatus = last ? STATUS[last.status] ?? { label: last.status, variant: 'outline' as const } : null

  return (
    <div className="space-y-8 max-w-5xl">
      <AutoRefresh active={inProgress} />
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
            {analysis.warnings.length > 0 && (
              <div role="note" className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-sm font-medium text-warning">À savoir</p>
                <ul className="mt-2 space-y-1 text-sm text-warning">
                  {analysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.commitSha && (
              <p className="text-xs text-muted-foreground">
                Analysé sur le commit <code className="font-mono">{analysis.commitSha.slice(0, 7)}</code>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Déploiements</h2>
        </CardHeader>
        <CardContent>
          {deployments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun déploiement pour ce projet.</p>
          ) : (
            <ul aria-live="polite" className="divide-y divide-border">
              {deployments.map((d) => {
                const s = STATUS[d.status] ?? { label: d.status, variant: 'outline' as const }
                return (
                  <li key={d.id} className="py-3 flex flex-wrap gap-2 sm:items-center sm:justify-between">
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
                    <DeploymentLogs projectId={project.id} deploymentId={d.id} defaultOpen={d.id === last?.id && inProgress} />
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
