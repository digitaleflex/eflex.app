import { prisma } from '@/lib/prisma'
import {
  createOrRedeployApplicationPreview,
  deleteApplicationPreview,
  enableApplicationPreviews,
  getApplicationPreview,
} from '@/lib/coolify'
import { getPrimaryApp } from '@/lib/project-apps'
import { isMaintenanceActive } from '@/lib/platform-settings'

/** Nombre maximal de prévisualisations actives par projet (borne MVP). */
export const MAX_ACTIVE_PREVIEWS_PER_PROJECT = 3

export interface PullRequestEvent {
  action: string
  number: number
  title: string | null
  htmlUrl: string | null
  draft: boolean
  headRef: string
  headSha: string | null
  headRepoFullName: string | null
  headRepoFork: boolean
  baseRef: string | null
  authorLogin: string | null
  merged: boolean
  repositoryFullName: string
}

/** Extrait un événement `pull_request` normalisé, ou `null` si incomplet. */
export function parsePullRequestEvent(payload: unknown): PullRequestEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const action = typeof p.action === 'string' ? p.action : null
  const repo = p.repository && typeof p.repository === 'object' ? (p.repository as Record<string, unknown>) : null
  const pr = p.pull_request && typeof p.pull_request === 'object' ? (p.pull_request as Record<string, unknown>) : null
  const repositoryFullName = repo && typeof repo.full_name === 'string' ? repo.full_name : null
  const number = pr && typeof pr.number === 'number' ? pr.number : null
  if (!action || !repositoryFullName || !number || !pr) return null
  const head = pr.head && typeof pr.head === 'object' ? (pr.head as Record<string, unknown>) : null
  const headRepo = head && head.repo && typeof head.repo === 'object' ? (head.repo as Record<string, unknown>) : null
  const base = pr.base && typeof pr.base === 'object' ? (pr.base as Record<string, unknown>) : null
  const user = pr.user && typeof pr.user === 'object' ? (pr.user as Record<string, unknown>) : null
  return {
    action,
    number,
    title: typeof pr.title === 'string' ? pr.title : null,
    htmlUrl: typeof pr.html_url === 'string' ? pr.html_url : null,
    draft: pr.draft === true,
    headRef: head && typeof head.ref === 'string' ? head.ref : '',
    headSha: head && typeof head.sha === 'string' ? head.sha : null,
    headRepoFullName: headRepo && typeof headRepo.full_name === 'string' ? headRepo.full_name : null,
    headRepoFork: headRepo?.fork === true,
    baseRef: base && typeof base.ref === 'string' ? base.ref : null,
    authorLogin: user && typeof user.login === 'string' ? user.login : null,
    merged: pr.merged === true,
    repositoryFullName,
  }
}

export interface PreviewHandleResult {
  projectId: string
  prNumber: number
  action: string
  status: 'created' | 'updated' | 'deleted' | 'skipped' | 'failed' | 'unsupported'
  reason?: string
}

function isSameRepository(event: PullRequestEvent): boolean {
  // Sécurité : on refuse les PR issues d'un fork (code non fiable avec les secrets de l'app).
  if (event.headRepoFork) return false
  if (!event.headRepoFullName) return false
  return event.headRepoFullName.toLowerCase() === event.repositoryFullName.toLowerCase()
}

function shouldDeploy(event: PullRequestEvent): boolean {
  if (event.action === 'ready_for_review') return true
  if (!['opened', 'reopened', 'synchronize'].includes(event.action)) return false
  // Les brouillons ne déclenchent pas de preview tant qu'ils ne sont pas prêts.
  return !event.draft
}

function shouldClose(event: PullRequestEvent): boolean {
  return event.action === 'closed'
}

function unsupportedMessage(error: string): boolean {
  const lower = error.toLowerCase()
  return (
    lower.includes('not found') ||
    lower.includes('404') ||
    lower.includes('not enabled') ||
    lower.includes('preview') && lower.includes('disabled') ||
    lower.includes('501') ||
    lower.includes('not supported') ||
    lower.includes('403')
  )
}

async function handlePreviewForApp(params: {
  projectId: string
  app: { id: string; name: string; coolifyAppId: string }
  event: PullRequestEvent
}): Promise<PreviewHandleResult> {
  const { projectId, app, event } = params

  if (shouldClose(event)) {
    const existing = await prisma.projectPreview.findUnique({
      where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
    })
    const deleted = await deleteApplicationPreview(app.coolifyAppId, event.number)
    if ('error' in deleted) {
      await prisma.projectPreview.upsert({
        where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
        create: {
          projectId,
          appId: app.id,
          prNumber: event.number,
          prTitle: event.title,
          prUrl: event.htmlUrl,
          headRef: event.headRef,
          headSha: event.headSha,
          baseRef: event.baseRef,
          authorLogin: event.authorLogin,
          status: 'failed',
          error: `Fermeture demandée mais suppression Coolify impossible : ${deleted.error}`,
          closedAt: new Date(),
        },
        update: {
          status: existing?.status === 'closed' ? 'closed' : 'failed',
          error: `Fermeture demandée mais suppression Coolify impossible : ${deleted.error}`,
          closedAt: new Date(),
          prTitle: event.title,
          prUrl: event.htmlUrl,
          headRef: event.headRef,
          headSha: event.headSha,
        },
      })
      return { projectId, prNumber: event.number, action: event.action, status: 'failed', reason: deleted.error }
    }
    await prisma.projectPreview.upsert({
      where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
      create: {
        projectId,
        appId: app.id,
        prNumber: event.number,
        prTitle: event.title,
        prUrl: event.htmlUrl,
        headRef: event.headRef,
        headSha: event.headSha,
        baseRef: event.baseRef,
        authorLogin: event.authorLogin,
        status: 'closed',
        closedAt: new Date(),
      },
      update: {
        status: 'closed',
        closedAt: new Date(),
        error: null,
        prTitle: event.title,
        prUrl: event.htmlUrl,
        headRef: event.headRef,
        headSha: event.headSha,
        baseRef: event.baseRef,
        authorLogin: event.authorLogin,
      },
    })
    return { projectId, prNumber: event.number, action: event.action, status: 'deleted' }
  }

  if (!shouldDeploy(event)) {
    return { projectId, prNumber: event.number, action: event.action, status: 'skipped', reason: 'action ignorée' }
  }

  // Limite de prévisualisations actives (bornage MVP).
  const activeCount = await prisma.projectPreview.count({
    where: {
      projectId,
      status: { in: ['active', 'updating'] },
      NOT: { appId: app.id, prNumber: event.number },
    },
  })
  if (activeCount >= MAX_ACTIVE_PREVIEWS_PER_PROJECT) {
    await prisma.projectPreview.upsert({
      where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
      create: {
        projectId,
        appId: app.id,
        prNumber: event.number,
        prTitle: event.title,
        prUrl: event.htmlUrl,
        headRef: event.headRef,
        headSha: event.headSha,
        baseRef: event.baseRef,
        authorLogin: event.authorLogin,
        status: 'failed',
        error: `Limite atteinte : ${MAX_ACTIVE_PREVIEWS_PER_PROJECT} prévisualisations actives maximum par projet.`,
      },
      update: {
        status: 'failed',
        error: `Limite atteinte : ${MAX_ACTIVE_PREVIEWS_PER_PROJECT} prévisualisations actives maximum par projet.`,
        prTitle: event.title,
        prUrl: event.htmlUrl,
        headRef: event.headRef,
        headSha: event.headSha,
        baseRef: event.baseRef,
        authorLogin: event.authorLogin,
        closedAt: null,
      },
    })
    return { projectId, prNumber: event.number, action: event.action, status: 'failed', reason: 'limite atteinte' }
  }

  const existing = await prisma.projectPreview.findUnique({
    where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
  })
  await prisma.projectPreview.upsert({
    where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
    create: {
      projectId,
      appId: app.id,
      prNumber: event.number,
      prTitle: event.title,
      prUrl: event.htmlUrl,
      headRef: event.headRef,
      headSha: event.headSha,
      baseRef: event.baseRef,
      authorLogin: event.authorLogin,
      status: 'updating',
      closedAt: null,
    },
    update: {
      status: 'updating',
      error: null,
      closedAt: null,
      prTitle: event.title,
      prUrl: event.htmlUrl,
      headRef: event.headRef,
      headSha: event.headSha,
      baseRef: event.baseRef,
      authorLogin: event.authorLogin,
    },
  })

  // Activation best-effort : certaines instances/versions peuvent ne pas supporter les previews.
  const enabled = await enableApplicationPreviews(app.coolifyAppId, { enabled: true })
  if ('error' in enabled && unsupportedMessage(enabled.error)) {
    await prisma.projectPreview.update({
      where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
      data: {
        status: 'unsupported',
        error: `Prévisualisations non prises en charge par cette instance Coolify : ${enabled.error}`,
      },
    })
    return { projectId, prNumber: event.number, action: event.action, status: 'unsupported', reason: enabled.error }
  }

  const created = await createOrRedeployApplicationPreview(app.coolifyAppId, {
    pullRequestId: event.number,
    pullRequestHtmlUrl: event.htmlUrl ?? undefined,
    gitType: 'github',
    commit: event.headSha ?? undefined,
    instantDeploy: true,
  })

  if ('error' in created) {
    const status = unsupportedMessage(created.error) ? 'unsupported' : 'failed'
    await prisma.projectPreview.update({
      where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
      data: { status, error: created.error },
    })
    return { projectId, prNumber: event.number, action: event.action, status, reason: created.error }
  }

  const previewUrl = created.preview?.domains ?? null
  await prisma.projectPreview.update({
    where: { projectId_appId_prNumber: { projectId, appId: app.id, prNumber: event.number } },
    data: {
      status: 'active',
      error: null,
      previewUrl,
      coolifyDeploymentUuid: created.deploymentUuid,
      lastDeployedAt: new Date(),
    },
  })

  return { projectId, prNumber: event.number, action: event.action, status: existing ? 'updated' : 'created' }
}

/**
 * Traite un événement `pull_request` GitHub pour tous les projets EFLEX liés au dépôt.
 * Sécurité : signature/idempotence vérifiées en amont, PR du même dépôt uniquement (pas de fork),
 * projet opt-in, bornes par projet. Les prévisualisations héritent des variables de l'application
 * Coolify : ne pas activer sur des projets portant des secrets de production sensibles.
 */
export async function handlePullRequestEvent(event: PullRequestEvent): Promise<PreviewHandleResult[]> {
  const results: PreviewHandleResult[] = []
  if (!isSameRepository(event)) {
    return [{ projectId: '', prNumber: event.number, action: event.action, status: 'skipped', reason: 'PR externe (fork) ignorée' }]
  }

  if (await isMaintenanceActive()) {
    return [{ projectId: '', prNumber: event.number, action: event.action, status: 'skipped', reason: 'maintenance de la plateforme' }]
  }

  const projects = await prisma.project.findMany({
    where: {
      previewsEnabled: true,
      OR: [
        { repoFullName: event.repositoryFullName },
        { repoUrl: { endsWith: `github.com/${event.repositoryFullName}` } },
      ],
    },
    select: {
      id: true,
      organization: { select: { suspendedAt: true } },
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, coolifyAppId: true, position: true },
      },
    },
  })

  for (const project of projects) {
    if (project.organization.suspendedAt) {
      results.push({
        projectId: project.id,
        prNumber: event.number,
        action: event.action,
        status: 'skipped',
        reason: 'organisation suspendue',
      })
      continue
    }
    // MVP : cibler l'application principale déployée (une preview par projet/PR).
    const primary = getPrimaryApp(project.apps)
    if (!primary?.coolifyAppId) {
      results.push({
        projectId: project.id,
        prNumber: event.number,
        action: event.action,
        status: 'skipped',
        reason: 'application non déployée (Coolify)',
      })
      continue
    }
    const result = await handlePreviewForApp({
      projectId: project.id,
      app: { id: primary.id, name: primary.name, coolifyAppId: primary.coolifyAppId },
      event,
    })
    results.push(result)
  }

  if (projects.length === 0) {
    results.push({ projectId: '', prNumber: event.number, action: event.action, status: 'skipped', reason: 'aucun projet opt-in' })
  }

  return results
}

/** Liste les prévisualisations d'un projet (la plus récente en premier). */
export async function listProjectPreviews(projectId: string) {
  return prisma.projectPreview.findMany({
    where: { projectId },
    orderBy: [{ updatedAt: 'desc' }],
    include: { app: { select: { id: true, name: true } } },
  })
}

/** Tente de rafraîchir l'URL/statut depuis Coolify pour les previews actives. */
export async function refreshProjectPreviews(projectId: string): Promise<void> {
  const previews = await prisma.projectPreview.findMany({
    where: { projectId, status: { in: ['active', 'updating'] } },
    include: { app: { select: { coolifyAppId: true } } },
  })
  for (const preview of previews) {
    const appId = preview.app.coolifyAppId
    if (!appId) continue
    const remote = await getApplicationPreview(appId, preview.prNumber)
    if ('error' in remote) continue
    await prisma.projectPreview.update({
      where: { id: preview.id },
      data: {
        previewUrl: remote.domains ?? preview.previewUrl,
        status: remote.status ? 'active' : preview.status,
      },
    })
  }
}
