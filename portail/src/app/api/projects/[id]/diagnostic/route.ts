import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'
import { diagnoseFailure } from '@/lib/deployment-diagnosis'

export const dynamic = 'force-dynamic'

function shortSha(sha: string | null | undefined): string | null {
  if (!sha) return null
  return sha.length > 12 ? sha.slice(0, 12) : sha
}

function repoLabel(repoUrl: string | null | undefined, repoFullName: string | null | undefined): string | null {
  if (repoFullName) return repoFullName
  if (!repoUrl) return null
  try {
    const u = new URL(repoUrl)
    return u.pathname.replace(/^\/+/, '').replace(/\.git$/, '') || u.host
  } catch {
    return null
  }
}

/**
 * Bundle de diagnostic partageable (sans secrets), à destination du support.
 * Contient uniquement des métadonnées, statuts et diagnostics interprétés :
 * aucune variable d'environnement, aucun jeton, aucun journal brut.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  const { id } = await params
  const projectResult = await requireProject(org, id, {
    id: true,
    name: true,
    framework: true,
    repoUrl: true,
    repoFullName: true,
    productionBranch: true,
    managedByEflex: true,
    suspendedAt: true,
    createdAt: true,
    updatedAt: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, framework: true, root: true },
    },
    deployments: {
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        commitSha: true,
        groupId: true,
        appId: true,
        createdAt: true,
        logsSummary: true,
        app: { select: { name: true } },
      },
    },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as {
    id: string
    name: string
    framework: string | null
    repoUrl: string | null
    repoFullName: string | null
    productionBranch: string | null
    managedByEflex: boolean
    suspendedAt: Date | null
    createdAt: Date
    updatedAt: Date
    apps: Array<{ id: string; name: string; framework: string | null; root: string | null }>
    deployments: Array<{
      id: string
      status: string
      commitSha: string | null
      groupId: string | null
      appId: string | null
      createdAt: Date
      logsSummary: string | null
      app: { name: string } | null
    }>
  }

  const deployments = project.deployments.map((d) => {
    const diagnosis = diagnoseFailure({ status: d.status, logs: d.logsSummary, projectId: project.id })
    return {
      id: d.id,
      appId: d.appId ?? null,
      appName: d.app?.name ?? null,
      groupId: d.groupId ?? null,
      status: d.status,
      commit: shortSha(d.commitSha),
      createdAt: d.createdAt.toISOString(),
      diagnosis: diagnosis
        ? {
            cause: diagnosis.cause,
            suggestedAction: diagnosis.action.label,
          }
        : null,
    }
  })

  const bundle = {
    version: 1,
    generatedAt: new Date().toISOString(),
    scope: 'project',
    notice:
      'Bundle de diagnostic sans secrets : variables d’environnement, jetons, identifiants privés et journaux bruts sont exclus. Les diagnostics sont des interprétations à partir de motifs observés.',
    project: {
      id: project.id,
      name: project.name,
      framework: project.framework ?? null,
      repository: repoLabel(project.repoUrl, project.repoFullName),
      productionBranch: project.productionBranch ?? null,
      managedByEflex: Boolean(project.managedByEflex),
      suspended: Boolean(project.suspendedAt),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      apps: project.apps.map((a) => ({ id: a.id, name: a.name, framework: a.framework ?? null, root: a.root ?? null })),
    },
    deployments: {
      count: deployments.length,
      items: deployments,
    },
  }

  return NextResponse.json(bundle, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Disposition': `attachment; filename="eflex-diagnostic-${project.id}.json"`,
    },
  })
}
