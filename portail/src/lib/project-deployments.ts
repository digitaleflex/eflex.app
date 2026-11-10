import { prisma } from '@/lib/prisma'
import { enqueueDeployment, removeQueuedDeployment } from '@/lib/queue'
import { publish } from '@/lib/event-bus'
import { isDeploymentStatus, STATUS_LABELS, ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { CANCEL_NOTE } from '@/lib/deployment-cancel'
import { assertDeploymentAllowed, type BillingBlockCode } from '@/lib/billing'
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
export function activeDeploymentMessage(status: string): string {
  const label = isDeploymentStatus(status) ? STATUS_LABELS[status] : status
  return `Un déploiement est déjà en cours pour ce projet (${label.toLowerCase()}). Attendez qu’il se termine ou annulez-le avant de relancer.`
}

/**
 * Crée un déploiement `queued` et le met en file. Utilisé par les actions qui
 * modifient la configuration réseau (domaines) et doivent recréer les labels.
 *
 * `exclusive` refuse un second déploiement actif pour le même projet (issue 04,
 * critère « impossible de lancer un second déploiement tant qu'un est en
 * cours »). La vérification est refaite après création pour couvrir une course
 * entre deux requêtes : le perdant est annulé et son job retiré.
 */
export async function enqueueProjectDeployment(
  project: { id: string; name: string; organizationId: string },
  options: { exclusive?: boolean; commitSha?: string } = {},
): Promise<
  | { deploymentId: string }
  | {
      error: string
      code?: 'deployment_in_progress' | BillingBlockCode | typeof MAINTENANCE_DEPLOYMENT_CODE
      status?: number
      activeDeploymentId?: string
    }
> {
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

  if (options.exclusive) {
    const active = await activeProjectDeployment(project.id)
    if (active) {
      return {
        error: activeDeploymentMessage(active.status),
        code: 'deployment_in_progress',
        activeDeploymentId: active.id,
      }
    }
  }

  const last = options.commitSha
    ? null
    : await prisma.deployment.findFirst({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
        select: { commitSha: true },
      })

  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      commitSha: options.commitSha ?? last?.commitSha ?? 'pending',
      status: 'queued',
    },
  })

  if (options.exclusive) {
    const others = await prisma.deployment.findMany({
      where: {
        projectId: project.id,
        id: { not: deployment.id },
        status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true },
    })
    const running = others[0]
    if (running) {
      // Course perdue : on annule le déploiement qu'on vient de créer sans
      // toucher à celui qui tourne déjà.
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: 'cancelled', logsSummary: CANCEL_NOTE },
      })
      await removeQueuedDeployment(deployment.id).catch(() => undefined)
      return {
        error: activeDeploymentMessage(running.status),
        code: 'deployment_in_progress',
        activeDeploymentId: running.id,
      }
    }
  }

  try {
    await enqueueDeployment(deployment.id)
  } catch {
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: 'failed', logsSummary: 'File de déploiement indisponible.' },
    })
    return { error: 'File de déploiement indisponible.' }
  }

  await publish({
    type: 'deployment.created',
    organizationId: project.organizationId,
    payload: { projectId: project.id, deploymentId: deployment.id, status: 'queued', name: project.name },
  })

  return { deploymentId: deployment.id }
}
