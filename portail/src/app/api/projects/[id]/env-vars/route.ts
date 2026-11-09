import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { allow } from '@/lib/rate-limit'
import { assertCryptoConfig, encrypt } from '@/lib/crypto'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { publish } from '@/lib/event-bus'
import { envVarSchema, firstIssue } from '@/lib/project-settings'

/**
 * Ajoute ou met à jour une variable d'environnement.
 *
 * La valeur est chiffrée en AES-256-GCM avec l'AAD `projectId:key` et n'est
 * jamais renvoyée : seuls le nom et la date de mise à jour sortent du serveur.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  // La clé de chiffrement doit être présente avant d'écrire quoi que ce soit.
  try {
    assertCryptoConfig()
  } catch {
    return NextResponse.json({ error: 'Configuration du serveur incomplète.' }, { status: 500 })
  }

  if (!allow(`env:${session.user.id}`, 60, 60_000)) {
    return NextResponse.json(
      { error: 'Trop de modifications en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de modifier les variables.' },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = envVarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  }

  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  const { key, value } = parsed.data
  const encrypted = encrypt(value, `${project.id}:${key}`)

  const envVar = await prisma.envVar.upsert({
    where: { projectId_key: { projectId: project.id, key } },
    create: { projectId: project.id, key, value: encrypted },
    update: { value: encrypted },
    select: { key: true, updatedAt: true },
  })

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id },
  })

  return NextResponse.json({ envVar })
}
