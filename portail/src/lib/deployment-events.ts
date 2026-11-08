import { publish } from '@/lib/event-bus'
import { memberIds, notify } from '@/lib/notifications'

/**
 * Un déploiement change de statut : met à jour les listes en direct et, aux états finals,
 * prévient les membres de l'organisation (une seule fois par déploiement et par statut).
 */
export async function announceDeploymentStatus(input: {
  organizationId: string
  projectId: string
  projectName: string
  deploymentId: string
  status: string
}): Promise<void> {
  const { organizationId, projectId, projectName, deploymentId, status } = input
  await publish({ type: 'deployment.status', organizationId, payload: { projectId, deploymentId, status, name: projectName } })

  if (status !== 'live' && status !== 'failed') return
  const href = `/dashboard/projects/${projectId}`
  await notify({
    userIds: await memberIds(organizationId),
    organizationId,
    dedupeKey: `deployment:${deploymentId}:${status}`,
    ...(status === 'live'
      ? { type: 'deployment.succeeded' as const, title: `${projectName} est en ligne`, body: 'Le déploiement s’est terminé avec succès.', href }
      : {
          type: 'deployment.failed' as const,
          title: `Le déploiement de ${projectName} a échoué`,
          body: 'Ouvrez les journaux du déploiement pour voir l’erreur, corrigez-la, puis relancez.',
          href,
        }),
  })
}
