/**
 * Transfert d'un projet vers une autre organisation (issue 21, multi-tenant).
 *
 * Règles :
 * - l'acteur doit être propriétaire ou administrateur de l'organisation **source** (celle
 *   de la session) **et** de l'organisation **cible** ;
 * - un déploiement actif bloque le transfert (le worker écrit des événements et des
 *   notifications pour l'organisation du projet : on évite de la changer sous ses pieds) ;
 * - le quota de projets de l'organisation cible s'applique immédiatement ;
 * - seules les relations `Project.organizationId` changent : variables chiffrées (AAD
 *   `projectId:clé`, inchangée), domaines, bases et déploiements suivent le projet.
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { assertProjectQuota } from '@/lib/billing'
import {
  ACTIVE_DEPLOYMENT_STATUSES,
  STATUS_LABELS,
  isDeploymentStatus,
} from '@/lib/deployment-state'
import { publish } from '@/lib/event-bus'
import { getPrimaryApp } from '@/lib/project-apps'
import { canManageProjects } from '@/lib/organizations'

export const transferProjectSchema = z.object({
  organizationId: z
    .string()
    .trim()
    .min(1, 'Sélectionnez l’organisation de destination.')
    .max(191, 'Identifiant d’organisation invalide.'),
})

export type TransferProjectInput = z.infer<typeof transferProjectSchema>

export type TransferOrganization = { id: string; name: string }

export type TransferProjectFailure = {
  ok: false
  status: 400 | 403 | 404 | 409
  error: string
  code: 'invalid_target' | 'same_organization' | 'not_authorized' | 'not_found' | 'deployment_in_progress' | 'plan_limit' | 'project_moved'
}

export type TransferProjectSuccess = {
  ok: true
  project: { id: string; name: string; slug: string; domain: string | null }
  from: TransferOrganization
  to: TransferOrganization
}

export type TransferProjectResult = TransferProjectFailure | TransferProjectSuccess

type TransferActor = { id: string; email: string }

/**
 * Déplace un projet de l'organisation source vers l'organisation cible.
 *
 * L'appelant (route API) a déjà vérifié la session et résolu l'organisation active ;
 * cette fonction re-vérifie **tous** les rôles en base : on ne fait jamais confiance
 * au rôle porté par la session ou par le client.
 */
export async function transferProject(input: {
  projectId: string
  sourceOrganizationId: string
  targetOrganizationId: string
  actor: TransferActor
  request?: Request
}): Promise<TransferProjectResult> {
  const { projectId, sourceOrganizationId, targetOrganizationId, actor, request } = input

  if (!targetOrganizationId) {
    return {
      ok: false,
      status: 400,
      code: 'invalid_target',
      error: 'Sélectionnez l’organisation de destination.',
    }
  }

  if (targetOrganizationId === sourceOrganizationId) {
    return {
      ok: false,
      status: 400,
      code: 'same_organization',
      error: 'Le projet appartient déjà à cette organisation.',
    }
  }

  const [sourceMembership, targetMembership] = await Promise.all([
    prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: sourceOrganizationId, userId: actor.id } },
      select: { role: true, organization: { select: { id: true, name: true } } },
    }),
    prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: targetOrganizationId, userId: actor.id } },
      select: { role: true, organization: { select: { id: true, name: true } } },
    }),
  ])

  if (!sourceMembership || !canManageProjects(sourceMembership.role)) {
    return {
      ok: false,
      status: 403,
      code: 'not_authorized',
      error: 'Votre rôle dans l’organisation actuelle ne permet pas de transférer ce projet.',
    }
  }

  // Organisation cible inconnue ou rôle insuffisant : même réponse, pour ne pas révéler
  // l'existence d'une organisation à laquelle l'utilisateur n'appartient pas.
  if (!targetMembership || !canManageProjects(targetMembership.role)) {
    return {
      ok: false,
      status: 403,
      code: 'not_authorized',
      error: 'Vous devez être propriétaire ou administrateur de l’organisation de destination pour y transférer un projet.',
    }
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: sourceOrganizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, position: true, domain: true },
      },
    },
  })
  if (!project) {
    return {
      ok: false,
      status: 404,
      code: 'not_found',
      error: 'Projet introuvable',
    }
  }
  const primaryDomain = getPrimaryApp(project.apps)?.domain ?? project.domain ?? null

  const activeDeployment = await prisma.deployment.findFirst({
    where: { projectId: project.id, status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  })
  if (activeDeployment) {
    const label = isDeploymentStatus(activeDeployment.status)
      ? STATUS_LABELS[activeDeployment.status].toLowerCase()
      : activeDeployment.status
    return {
      ok: false,
      status: 409,
      code: 'deployment_in_progress',
      error: `Le projet a un déploiement en cours (${label}). Terminez-le ou annulez-le avant de le transférer.`,
    }
  }

  const quota = await assertProjectQuota(targetMembership.organization.id)
  if ('error' in quota) {
    return {
      ok: false,
      status: 403,
      code: 'plan_limit',
      error: `L’organisation de destination ne peut pas accueillir ce projet : ${quota.error}`,
    }
  }

  // Mise à jour conditionnelle : si le projet a changé d'organisation entre-temps
  // (double clic, autre onglet), aucun transfert silencieux n'est effectué.
  const moved = await prisma.project.updateMany({
    where: { id: project.id, organizationId: sourceOrganizationId },
    data: { organizationId: targetMembership.organization.id },
  })
  if (moved.count !== 1) {
    return {
      ok: false,
      status: 409,
      code: 'project_moved',
      error: 'Le projet a changé d’organisation entre-temps. Rechargez la page et réessayez.',
    }
  }

  const from = sourceMembership.organization
  const to = targetMembership.organization
  const basePayload = {
    projectId: project.id,
    name: project.name,
    fromOrganizationId: from.id,
    fromOrganizationName: from.name,
    toOrganizationId: to.id,
    toOrganizationName: to.name,
  }

  // Un événement par organisation : la source voit le projet partir, la cible le voit arriver.
  // `publish` ne fait jamais échouer l'action métier (erreur seulement journalisée).
  await Promise.all([
    publish({ type: 'project.transferred', organizationId: from.id, payload: { ...basePayload, direction: 'out' } }),
    publish({ type: 'project.transferred', organizationId: to.id, payload: { ...basePayload, direction: 'in' } }),
  ])

  await audit({
    actor: { id: actor.id, email: actor.email },
    action: 'project.transfer',
    target: { type: 'project', id: project.id },
    organizationId: from.id,
    details: {
      projectName: project.name,
      fromOrganizationId: from.id,
      fromOrganizationName: from.name,
      toOrganizationId: to.id,
      toOrganizationName: to.name,
    },
    request,
  })

  return {
    ok: true,
    project: { id: project.id, name: project.name, slug: project.slug, domain: primaryDomain },
    from,
    to,
  }
}
