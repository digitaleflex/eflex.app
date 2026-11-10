import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { allow } from '@/lib/rate-limit'
import { AnalysisError } from '@/lib/repo-analysis'
import { deletePat, savePat } from '@/lib/git-credentials'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  token: z.string().trim().min(20, 'Jeton GitHub invalide.').max(500, 'Jeton GitHub trop long.'),
})

function errorResponse(error: unknown): Response {
  if (error instanceof AnalysisError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('[github/pat] erreur inattendue', error)
  return NextResponse.json({ error: "Impossible d'enregistrer le jeton GitHub." }, { status: 500 })
}

/** Enregistre (ou remplace) le jeton personnel GitHub, après validation auprès de GitHub. */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  if (!(await allow(`github-pat:${session.user.id}`, 5, 60_000))) {
    return NextResponse.json({ error: 'Trop de tentatives. Patientez une minute.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }

  try {
    const pat = await savePat(session.user.id, parsed.data.token)
    return NextResponse.json({ pat: { login: pat.login, scopes: pat.scopes } })
  } catch (error) {
    return errorResponse(error)
  }
}

/** Supprime le jeton personnel. */
export async function DELETE() {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  await deletePat(session.user.id)
  return NextResponse.json({ ok: true })
}
