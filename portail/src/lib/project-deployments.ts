import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { enqueueDeployment, removeQueuedDeployment } from '@/lib/queue'
import { publish } from '@/lib/event-bus'
import { isDeploymentStatus, STATUS_LABELS, ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { CANCEL_NOTE } from '@/lib/deployment-cancel'
import { assertDeploymentAllowed, type BillingBlockCode } from '@/lib/billing'
import { multiAppEnabled } from '@/lib/multi-app'
import {
  MAINTENANCE_DEPLOYMENT_CODE,
  MAINTENANCE_DEPLOYMENT_MESSAGE,
  isMaintenanceActive,
} from '@/lib/platform-settings'

/** Déploiement du projet qui n'a pas encore d'issue (verrou « un seul à la fois »). */
export async function activeProjectDeployment(
  projectId: string,
): Promise<{ id: string; status: string } | null> {
  return prisma.deployment.findFirst({
    where: { projectId, status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  })
}

/** Message utilisateur quand un déploiement est déjà en cours (409). */
export function activeDeploymentMessage(status: string, appName?: string | null): string {
  const label = isDeploymentStatus(status) ? STATUS_LABELS[status] : status
  const target = appName ? `l’application « ${appName} »` : 'ce projet'
  return `Un déploiement est déjà en cours pour ${target} (${label.toLowerCase()}). Attendez qu’il se termine ou annulez-le avant de relancer.`
}

/** Référence minimale d'une application à enfiler (id + nom d'affichage). */
export interface DeploymentAppRef {
  id: string
  name: string
}

export interface EnqueuedDeployment {
  id: string
  appId: string | null
  status: 'queued' | 'failed'
}

export interface SkippedDeploymentApp {
  appId: string
  appName: string
}

export interface EnqueueOptions {
  exclusive?: boolean
  commitSha?: string
  rollback?: boolean
  /**
   * Applications à déployer. `undefined` = toutes les applications du projet
   * (repli historique : un déploiement de portée projet s'il n'y en a aucune) ;
   * `[]` = déploiement de portée projet explicite (`appId = null`).
   */
  apps?: DeploymentAppRef[]
  /** Lot commun ; généré automatiquement dès qu'il y a plusieurs applications. */
  groupId?: string
}

export type EnqueueResult =
  | {
      deploymentId: string
      deployments: EnqueuedDeployment[]
      groupId: string | null
      /** Applications ignorées parce qu'un déploiement y était déjà actif. */
      skipped: SkippedDeploymentApp[]
    }
  | {
      error: string
      code?: 'deployment_in_progress' | BillingBlockCode | typeof MAINTENANCE_DEPLOYMENT_CODE
      status?: number
      activeDeploymentId?: string
      /** Renseigné quand les lignes ont bien été créées mais pas enfilées. */
      deployments?: EnqueuedDeployment[]
      deploymentId?: string
      groupId?: string | null
    }

/**
 * Crée **un `Deployment` par application** (même `groupId`) puis enfile chaque
 * ligne séparément : le worker garde le contrat « 1 job = 1 application ».
 *
 * Utilisé par la création de projet (lot C), le redéploiement (toutes les apps
 * ou `appId`), le retour arrière (l'app du déploiement ciblé), le webhook GitHub
 * et les actions qui doivent réappliquer les labels (domaines, bases).
 *
 * `exclusive` refuse un second déploiement actif **par application** : une app
 * déjà en cours est **ignorée** (retournée dans `skipped`) sans empêcher les
 * autres de partir (voir § 2.2 et § 6.4 du document D2). Si **toutes** les apps
 * visées sont occupées, la fonction renvoie une erreur `deployment_in_progress`.
 *
 * `rollback` marque un retour arrière : la cible est `commitSha` (obligatoire)
 * et le worker déploiera exactement ce commit au lieu du dernier commit de la
 * branche. Voir `lib/deployment-rollback.ts` et `deployApplicationCommit`.
 */
export async function enqueueProjectDeployment(
  project: { id: string; name: string; organizationId: string },
  options: EnqueueOptions = {},
): Promise<EnqueueResult> {
  if (options.rollback && !options.commitSha) {
    return { error: 'Retour arrière impossible : aucun commit cible n’a été fourni.' }
  }

  // Mode maintenance (issue 31) : aucun nouveau déploiement, message explicite.
  if (await isMaintenanceActive()) {
    return { error: MAINTENANCE_DEPLOYMENT_MESSAGE, code: MAINTENANCE_DEPLOYMENT_CODE }
  }

  // Facturation (#18/#27) : organisation suspendue ou grâce d'impayé dépassée.
  // Les applications déjà en ligne ne sont pas arrêtées par cette garde.
  const billing = await assertDeploymentAllowed(project.organizationId)
  if (!billing.ok) {
    return { error: billing.error, code: billing.code, status: billing.status }
  }

  let targetApps: DeploymentAppRef[] =
    options.apps ??
    (multiAppEnabled()
      ? await prisma.projectApp.findMany({
          where: { projectId: project.id },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true },
        })
      : [])

  const skipped: SkippedDeploymentApp[] = []

  if (options.exclusive) {
    const active = await prisma.deployment.findMany({
      where: {
        projectId: project.id,
        status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] },
        ...(targetApps.length > 0
          ? { appId: { in: targetApps.map((app) => app.id) } }
          : { appId: null }),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, appId: true },
    })

    if (active.length > 0) {
      if (targetApps.length === 0) {
        return {
          error: activeDeploymentMessage(active[0]!.status),
          code: 'deployment_in_progress',
          activeDeploymentId: active[0]!.id,
        }
      }
      const busy = new Set(active.map((item) => item.appId).filter((id): id is string => Boolean(id)))
      for (const app of targetApps) {
        if (busy.has(app.id)) skipped.push({ appId: app.id, appName: app.name })
      }
      targetApps = targetApps.filter((app) => !busy.has(app.id))
      if (targetApps.length === 0) {
        return {
          error: activeDeploymentMessage(active[0]!.status, skipped[0]?.appName ?? null),
          code: 'deployment_in_progress',
          activeDeploymentId: active[0]!.id,
        }
      }
    }
  }

  const appIds = targetApps.map((app) => app.id)

  const last = options.commitSha
    ? null
    : await prisma.deployment.findFirst({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
        select: { commitSha: true },
      })

  // Une seule ligne pour l'application implicite (projet historique), sinon une
  // ligne par application avec le même `groupId`.
  const targets: Array<{ appId: string | null; name: string | null }> =
    targetApps.length > 0
      ? targetApps.map((app) => ({ appId: app.id, name: app.name }))
      : [{ appId: null, name: null }]

  const groupId = options.groupId ?? (targets.length > 1 ? randomUUID() : null)
  const commitSha = options.commitSha ?? last?.commitSha ?? 'pending'

  const created = await prisma.$transaction(
    targets.map((target) =>
      prisma.deployment.create({
        data: {
          projectId: project.id,
          appId: target.appId,
          groupId,
          commitSha,
          status: 'queued',
        },
        select: { id: true, appId: true },
      }),
    ),
  )

  const cancelled = new Set<string>()

  if (options.exclusive) {
    // Course entre deux requêtes : on relit les déploiements actifs une fois les
    // lignes créées. Le perdant est annulé **par application**, sans toucher à
    // celui qui tourne déjà ni aux autres applications du lot.
    const conflicts = await prisma.deployment.findMany({
      where: {
        projectId: project.id,
        id: { notIn: created.map((item) => item.id) },
        status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] },
        ...(appIds.length > 0 ? { appId: { in: appIds } } : { appId: null }),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, appId: true },
    })

    if (conflicts.length > 0) {
      for (const deployment of created) {
        if (!conflicts.some((conflict) => conflict.appId === deployment.appId)) continue
        cancelled.add(deployment.id)
        await prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: 'cancelled', logsSummary: CANCEL_NOTE },
        })
        await removeQueuedDeployment(deployment.id).catch(() => undefined)
      }
      for (const app of targetApps) {
        if (conflicts.some((conflict) => conflict.appId === app.id)) {
          skipped.push({ appId: app.id, appName: app.name })
        }
      }
      if (created.every((item) => cancelled.has(item.id))) {
        const first = conflicts[0]!
        const appName = targetApps.find((app) => app.id === first.appId)?.name ?? null
        return {
          error: activeDeploymentMessage(first.status, appName),
          code: 'deployment_in_progress',
          activeDeploymentId: first.id,
        }
      }
    }
  }

  const enqueued: EnqueuedDeployment[] = []
  let queueError: string | null = null

  for (const deployment of created) {
    if (cancelled.has(deployment.id)) continue
    try {
      await enqueueDeployment(deployment.id, { rollback: options.rollback })
      enqueued.push({ id: deployment.id, appId: deployment.appId, status: 'queued' })
    } catch {
      queueError = 'File de déploiement indisponible.'
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: 'failed', logsSummary: 'File de déploiement indisponible.' },
      })
      enqueued.push({ id: deployment.id, appId: deployment.appId, status: 'failed' })
    }
  }

  for (const deployment of enqueued) {
    const app = targetApps.find((item) => item.id === deployment.appId)
    await publish({
      type: 'deployment.created',
      organizationId: project.organizationId,
      payload: {
        projectId: project.id,
        deploymentId: deployment.id,
        status: deployment.status,
        name: project.name,
        ...(deployment.appId ? { appId: deployment.appId, appName: app?.name ?? null } : {}),
      },
    })
  }

  const first = enqueued[0]
  if (!first) return { error: 'Aucun déploiement n’a pu être préparé.' }

  if (queueError) {
    return {
      error: queueError,
      deployments: enqueued,
      deploymentId: first.id,
      groupId,
    }
  }

  return { deploymentId: first.id, deployments: enqueued, groupId, skipped }
}
