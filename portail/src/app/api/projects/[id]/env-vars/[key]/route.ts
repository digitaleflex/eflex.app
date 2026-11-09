import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { publish } from '@/lib/event-bus'
import { ENV_KEY_MAX, ENV_KEY_PATTERN } from '@/lib/project-settings'

/** Supprime une variable d'environnement d'un projet. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id, key } = await params

  if (key.length > ENV_KEY_MAX || !ENV_KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Nom de variable invalide.' }, { status: 400 })
  }

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de modifier les variables.' },
      { status: 403 },
    )
  }

  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  const result = await prisma.envVar.deleteMany({
    where: { projectId: project.id, key },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Variable introuvable.' }, { status: 404 })
  }

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id },
  })

  return NextResponse.json({ ok: true })
}
