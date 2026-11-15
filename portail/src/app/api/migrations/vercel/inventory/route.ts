import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { rateLimitedResponse, check, checkOrg } from '@/lib/rate-limit'
import { publish } from '@/lib/event-bus'
import { fetchVercelInventory, VercelInventoryError } from '@/lib/migrations/vercel'

const schema = z.object({
  token: z
    .string()
    .trim()
    .min(1, 'Indiquez un jeton d\'accès Vercel.')
    .max(500, 'Le jeton fourni est trop long.'),
})

/**
 * Inventaire Vercel (MIG-1, #148) : lit une seule fois la liste des projets
 * accessibles avec le jeton fourni. Le jeton n'est jamais persisté, ni renvoyé,
 * ni consigné dans les journaux ; aucune variable d'environnement Vercel n'est lue.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await resolveOrganization(session)
  if (!org) {
    return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 403 })
  }
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas d\'importer des projets.' },
      { status: 403 },
    )
  }

  const userLimit = await check(`vercel-inventory:${session.user.id}`, 8, 60_000, {
    action: 'vercel-inventory',
    scope: 'user',
  })
  if (!userLimit.allowed) {
    return rateLimitedResponse(userLimit, 'Trop de tentatives en peu de temps. Patientez une minute.')
  }
  const orgLimit = await checkOrg(org.organizationId, 'vercel-inventory', 20, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(orgLimit, 'Trop de tentatives pour cette organisation. Patientez une minute.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 },
    )
  }

  try {
    const inventory = await fetchVercelInventory(parsed.data.token)
    const githubLinkedCount = inventory.projects.filter((p) => p.repository?.gitHubUrl).length

    // Base minimale pour l'indicateur « migrations sans intervention manuelle » (MIG-1, #148) :
    // on trace le démarrage d'un inventaire réussi, sans secret ni détail sensible.
    await publish({
      type: 'migration.vercel.inventory',
      organizationId: org.organizationId,
      payload: {
        projectCount: inventory.projects.length,
        githubLinkedCount,
        truncated: inventory.truncated,
      },
    })

    return NextResponse.json(inventory, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    if (error instanceof VercelInventoryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return NextResponse.json(
      { error: 'Impossible de lire les projets Vercel pour le moment. Réessayez.' },
      { status: 500 },
    )
  }
}
