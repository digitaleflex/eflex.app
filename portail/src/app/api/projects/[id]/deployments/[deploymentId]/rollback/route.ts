import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { multiAppEnabled } from '@/lib/multi-app'
import { allow } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import {
  ROLLBACK_REFUSAL_MESSAGES,
  isCommitSha,
  rollbackRefusal,
} from '@/lib/deployment-rollback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Retour arrière vers un déploiement précédent (Lot A de #21, Lot E de D2).
 *
 * Crée un nouveau déploiement pointé sur le commit d'un déploiement **réussi**
 * du même projet, puis le met en file. Le worker le déploiera via l'endpoint
 * de retour arrière de Coolify (`deployApplicationCommit`) : la branche suivie
 * n'est pas modifiée, le prochain déploiement normal reprend la tête de branche.
 *
 * Par défaut, le retour arrière cible une seule application (lot C). Avec
 * `?scope=group` (ou `{"scope":"group"}`), tout le lot du déploiement cible est
 * reconstruit au même commit.
 *
 * Refus : rôle insuffisant (403), déploiement hors organisation (404), commit
 * inexploitable (400), cible non réussie, groupe introuvable/incohérent ou
 * déploiement déjà actif (409).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; deploymentId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  if (!(await allow(`rollback-deployment:${session.user.id}`, 10, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de retours arrière en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de revenir à une version précédente.' },
      { status: 403 },
    )
  }

  const { id, deploymentId } = await params
  const url = new URL(request.url)
  let scope = url.searchParams.get('scope')
  if (scope !== 'group') {
    try {
      const body = (await request.clone().json()) as { scope?: unknown }
      if (body?.scope === 'group') scope = 'group'
    } catch {
      // Corps absent ou invalide : le paramètre de requête fait foi.
    }
  }
  const groupScope = scope === 'group'

  // Le déploiement cible doit appartenir au projet **et** à l'organisation
  // active : un identifiant deviné d'un autre locataire répond 404.
  const target = await prisma.deployment.findFirst({
    where: {
      id: deploymentId,
      projectId: id,
      project: { organizationId: org.organizationId },
    },
    select: {
      id: true,
      status: true,
      commitSha: true,
      createdAt: true,
      appId: true,
      groupId: true,
      app: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, organizationId: true } },
    },
  })
  if (!target) return NextResponse.json({ error: 'Déploiement introuvable' }, { status: 404 })

  const refusal = rollbackRefusal(target)
  if (refusal === 'invalid_commit') {
    return NextResponse.json(
      { error: ROLLBACK_REFUSAL_MESSAGES.invalid_commit, code: refusal },
      { status: 400 },
    )
  }
  if (refusal === 'not_live') {
    return NextResponse.json(
      { error: ROLLBACK_REFUSAL_MESSAGES.not_live, code: refusal },
      { status: 409 },
    )
  }
  // `rollbackRefusal` a validé la forme ; le transtypage documente l'invariant.
  if (!isCommitSha(target.commitSha)) {
    return NextResponse.json(
      { error: ROLLBACK_REFUSAL_MESSAGES.invalid_commit, code: 'invalid_commit' },
      { status: 400 },
    )
  }

  let apps: Array<{ id: string; name: string }> = []
  if (groupScope) {
    if (!target.groupId) {
      return NextResponse.json(
        { error: 'Ce déploiement n’appartient à aucun lot : le retour arrière de groupe est impossible.', code: 'rollback_group_missing' },
        { status: 409 },
      )
    }
    const groupDeployments = await prisma.deployment.findMany({
      where: { projectId: id, groupId: target.groupId },
      select: { appId: true, app: { select: { id: true, name: true } } },
    })
    const byId = new Map<string, { id: string; name: string }>()
    for (const deployment of groupDeployments) {
      if (deployment.app) byId.set(deployment.app.id, { id: deployment.app.id, name: deployment.app.name })
    }
    if (byId.size === 0 || groupDeployments.some((deployment) => !deployment.appId || !deployment.app)) {
      return NextResponse.json(
        { error: 'Le lot de déploiements est introuvable ou incohérent : le retour arrière de groupe est impossible.', code: 'rollback_group_inconsistent' },
        { status: 409 },
      )
    }
    apps = [...byId.values()]
  } else {
    // Retour arrière **par application** (lot C) : on ne reconstruit que l'app
    // du déploiement ciblé. Drapeau désactivé : portée projet, comme avant.
    apps = multiAppEnabled() && target.app ? [{ id: target.app.id, name: target.app.name }] : []
  }

  // Version actuellement en ligne, pour tracer la transition dans l'audit.
  const current = await prisma.deployment.findFirst({
    where: { projectId: id, status: 'live' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, commitSha: true },
  })

  const queued = await enqueueProjectDeployment(target.project, {
    exclusive: true,
    commitSha: target.commitSha,
    rollback: true,
    apps,
  })
  if ('error' in queued) {
    // Un déploiement tourne déjà : 409. La facturation renvoie 402/403 pour que
    // le client distingue un blocage d'abonnement d'une panne de file.
    const status =
      queued.code === 'deployment_in_progress'
        ? 409
        : queued.status ??
          (queued.code === 'organization_suspended'
            ? 403
            : queued.code === 'payment_past_due'
              ? 402
              : 503)
    return NextResponse.json(
      {
        error: queued.error,
        ...(queued.code ? { code: queued.code } : {}),
        ...(queued.activeDeploymentId ? { deploymentId: queued.activeDeploymentId } : {}),
      },
      { status },
    )
  }

  if (groupScope) {
    const failed = queued.deployments.some((deployment) => deployment.status !== 'queued')
    if (queued.skipped.length > 0 || failed) {
      return NextResponse.json(
        {
          error:
            'Le retour arrière du lot n’a pas pu être préparé pour toutes les applications. ' +
            'Attendez la fin des déploiements en cours puis réessayez.',
          code: 'rollback_group_enqueue_failed',
          deployments: queued.deployments,
          skipped: queued.skipped,
          groupId: queued.groupId,
        },
        { status: 409 },
      )
    }
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'deployment.rollback',
    target: { type: 'deployment', id: queued.deploymentId },
    organizationId: target.project.organizationId,
    details: {
      projectId: target.project.id,
      // Cible : la version vers laquelle on revient.
      sourceDeploymentId: target.id,
      sourceCommitSha: target.commitSha,
      // Version en ligne au moment de la demande (peut être identique à la cible).
      currentDeploymentId: current?.id ?? null,
      currentCommitSha: current?.commitSha ?? null,
      ...(groupScope ? { scope: 'group', groupId: target.groupId } : {}),
    },
    request,
  })

  return NextResponse.json(
    {
      deployment: { id: queued.deploymentId, status: 'queued' },
      rollback: { commitSha: target.commitSha, targetDeploymentId: target.id },
      ...(groupScope
        ? { scope: 'group', groupId: queued.groupId, deployments: queued.deployments }
        : {}),
    },
    { status: 202 },
  )
}
