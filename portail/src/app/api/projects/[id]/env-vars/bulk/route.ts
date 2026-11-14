import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { allow } from '@/lib/rate-limit'
import { assertCryptoConfig, encrypt } from '@/lib/crypto'
import { publish } from '@/lib/event-bus'
import { envBulkSchema, firstIssue } from '@/lib/project-settings'
import { assertProjectManager, requireOrg, requireProject, requireProjectApp, tenantNotFound } from '@/lib/tenant'

/**
 * Enregistre plusieurs variables d'environnement en une fois (collage ou import d'un fichier .env).
 *
 * Même garanties que `POST /env-vars` : chiffrement AES-256-GCM avec l'AAD `projectId:key`, valeurs
 * jamais renvoyées, rôle qui peut gérer le projet. Tout ou rien : une seule transaction, un seul
 * événement temps réel, une seule requête décomptée du limiteur (au lieu d'une par variable).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  try {
    assertCryptoConfig()
  } catch {
    return NextResponse.json({ error: 'Configuration du serveur incomplète.' }, { status: 500 })
  }

  if (!(await allow(`env-bulk:${session.user.id}`, 20, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (assertProjectManager(org)) {
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

  const parsed = envBulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  }
  const { vars, appId } = parsed.data

  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project

  if (appId) {
    const appResult = await requireProjectApp(org, project.id, appId, { id: true })
    if ('response' in appResult) {
      return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
    }
  }

  const select = { key: true, updatedAt: true, appId: true } as const
  const existing = await prisma.envVar.findMany({
    where: { projectId: project.id, appId: appId ?? null, key: { in: vars.map((item) => item.key) } },
    select: { id: true, key: true },
  })
  const existingByKey = new Map(existing.map((row) => [row.key, row.id]))

  // AAD conservée (`projectId:key`) pour compatibilité avec le déchiffrement existant.
  const operations = vars.map((item) => {
    const encrypted = encrypt(item.value, `${project.id}:${item.key}`)
    const existingId = existingByKey.get(item.key)
    return existingId
      ? prisma.envVar.update({ where: { id: existingId }, data: { value: encrypted }, select })
      : prisma.envVar.create({
          data: { projectId: project.id, appId: appId ?? null, key: item.key, value: encrypted },
          select,
        })
  })
  const envVars = await prisma.$transaction(operations)

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id },
  })

  return NextResponse.json({
    envVars,
    created: vars.length - existing.length,
    updated: existing.length,
  })
}
