import { publish } from '@/lib/event-bus'
import { memberIds, notify } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { aggregateDeploymentGroup, isTerminal, type DeploymentGroupAggregate } from '@/lib/deployment-state'

export type AnnounceDeploymentStatusInput = {
  organizationId: string
  projectId: string
  projectName: string
  deploymentId: string
  status: string
  /** Présent pour les déploiements multi-applications partageant un lot. */
  groupId?: string | null
  appId?: string | null
  /** Nom de l’application (utile au suivi temps réel). */
  appName?: string | null
}

/**
 * Un déploiement change de statut : met toujours à jour les listes en direct et, aux états
 * terminaux, prévient les membres de l'organisation. Pour un lot (`groupId`), une seule
 * notification agrégée est envoyée quand le lot est entièrement terminé (idempotente via la
 * clé de déduplication). Sans lot, le comportement historique par déploiement est conservé.
 */
export async function announceDeploymentStatus(input: AnnounceDeploymentStatusInput): Promise<void> {
  const { organizationId, projectId, projectName, deploymentId, status, groupId, appId, appName } = input
  await publish({
    type: 'deployment.status',
    organizationId,
    payload: {
      projectId,
      deploymentId,
      status,
      name: projectName,
      ...(groupId ? { groupId } : {}),
      ...(appId ? { appId } : {}),
      ...(appName ? { appName } : {}),
    },
  })

  if (!isTerminal(status)) return
  const href = `/dashboard/projects/${projectId}`

  if (groupId) {
    const group = await prisma.deployment.findMany({
      where: { groupId },
      select: { status: true },
    })
    const aggregate = aggregateDeploymentGroup(group.map((deployment) => deployment.status))
    if (!aggregate.complete) return
    await notify({
      userIds: await memberIds(organizationId),
      organizationId,
      dedupeKey: `deployment-group:${groupId}:${aggregate.outcome}`,
      ...groupNotification(projectName, aggregate, href),
    })
    return
  }

  if (status !== 'live' && status !== 'failed') return
  await notify({
    userIds: await memberIds(organizationId),
    organizationId,
    dedupeKey: `deployment:${deploymentId}:${status}`,
    ...(status === 'live'
      ? {
          type: 'deployment.succeeded' as const,
          title: `${projectName} est en ligne`,
          body: 'Le déploiement s’est terminé avec succès.',
          href,
        }
      : {
          type: 'deployment.failed' as const,
          title: `Le déploiement de ${projectName} a échoué`,
          body: 'Ouvrez les journaux du déploiement pour voir l’erreur, corrigez-la, puis relancez.',
          href,
        }),
  })
}

function groupNotification(
  projectName: string,
  aggregate: DeploymentGroupAggregate,
  href: string,
): {
  type: 'deployment.succeeded' | 'deployment.failed'
  title: string
  body: string
  href: string
} {
  const { total, live, failed, cancelled, outcome } = aggregate

  if (outcome === 'all-live') {
    return {
      type: 'deployment.succeeded',
      title: `${projectName} : toutes les applications sont en ligne`,
      body:
        total === 1
          ? 'Le déploiement s’est terminé avec succès.'
          : `Les ${total} applications sont en ligne.`,
      href,
    }
  }

  if (outcome === 'all-cancelled') {
    return {
      type: 'deployment.failed',
      title: `${projectName} : tout le lot a été annulé`,
      body:
        total === 1
          ? 'Le déploiement a été annulé.'
          : `Les ${total} déploiements ont été annulés.`,
      href,
    }
  }

  if (outcome === 'all-failed') {
    return {
      type: 'deployment.failed',
      title: `${projectName} : toutes les applications sont en échec`,
      body:
        total === 1
          ? 'Ouvrez les journaux du déploiement pour voir l’erreur, corrigez-la, puis relancez.'
          : `${total} applications sur ${total} sont en échec. Ouvrez les journaux des déploiements pour voir les erreurs, corrigez-les, puis relancez.`,
      href,
    }
  }

  // Lot mixte : on résume le résultat de façon compréhensible.
  const parts: string[] = []
  if (live > 0) parts.push(`${live} en ligne`)
  if (failed > 0) parts.push(`${failed} en échec`)
  if (cancelled > 0) parts.push(`${cancelled} annulée${cancelled > 1 ? 's' : ''}`)
  const summary = parts.join(', ')

  const title =
    failed > 0
      ? `${projectName} : ${failed} application${failed > 1 ? 's' : ''} en échec sur ${total}`
      : live > 0
        ? `${projectName} : ${live}/${total} applications en ligne`
        : `${projectName} : lot de déploiements terminé`

  const body =
    failed > 0
      ? `${summary} (sur ${total}). Ouvrez les journaux des déploiements en échec pour voir les erreurs, corrigez-les, puis relancez.`
      : `${summary} (sur ${total}).`

  return {
    type: failed > 0 ? 'deployment.failed' : 'deployment.succeeded',
    title,
    body,
    href,
  }
}
