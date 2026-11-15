import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { rateLimitedResponse, check, checkOrg } from '@/lib/rate-limit'
import { publish } from '@/lib/event-bus'
import { fetchVercelProjectEnv, VercelMigrationError } from '@/lib/migrations/vercel'

const targetSchema = z.enum(['development', 'preview', 'production'])

const schema = z.object({
  token: z
    .string()
    .trim()
    .min(1, "Indiquez un jeton d'accès Vercel.")
    .max(500, 'Le jeton fourni est trop long.'),
  projectId: z
    .string()
    .trim()
    .min(1, 'Indiquez le projet Vercel à lire.')
    .max(200, 'Identifiant de projet Vercel invalide.'),
  targets: z.array(targetSchema).max(3).optional(),
})

/**
 * Lecture des variables d'environnement Vercel (MIG-2, #148) pour un projet sélectionné.
 * Le jeton est utilisé une seule fois pour cet appel : jamais persisté, jamais renvoyé,
 * jamais consigné. Les valeurs non relisibles ne sont ni devinées ni exposées.
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
      { error: "Votre rôle dans cette organisation ne permet pas d'importer des projets." },
      { status: 403 },
    )
  }

  const userLimit = await check(`vercel-env:${session.user.id}`, 12, 60_000, {
    action: 'vercel-env',
    scope: 'user',
  })
  if (!userLimit.allowed) {
    return rateLimitedResponse(userLimit, 'Trop de tentatives en peu de temps. Patientez une minute.')
  }
  const orgLimit = await checkOrg(org.organizationId, 'vercel-env', 30, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(
      orgLimit,
      'Trop de tentatives pour cette organisation. Patientez une minute.',
    )
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
    const review = await fetchVercelProjectEnv(
      parsed.data.token,
      parsed.data.projectId,
      parsed.data.targets,
    )

    // Indicateur « migrations sans intervention manuelle » (MIG-2, #148) :
    // lecture réussie des variables, compteurs factuels uniquement (sans secret ni clé/valeur).
    await publish({
      type: 'migration.vercel.env_reviewed',
      organizationId: org.organizationId,
      payload: {
        projectSelected: true,
        total: review.stats.total,
        readable: review.stats.readable,
        requiresReentry: review.stats.requiresReentry,
        overlaps: review.stats.overlaps,
        truncated: review.truncated,
      },
    })

    return NextResponse.json(review, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    if (error instanceof VercelMigrationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return NextResponse.json(
      { error: "Impossible de lire les variables d'environnement Vercel pour le moment. Réessayez." },
      { status: 500 },
    )
  }
}
