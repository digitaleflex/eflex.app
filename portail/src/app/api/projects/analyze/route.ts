import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { allow } from '@/lib/rate-limit'
import { analyzeGitHubRepo } from '@/lib/repo-analysis'
import { errorResponse, repoFields, resolveRepo } from '@/lib/analysis-request'
import { resolveUserRepoToken } from '@/lib/git-credentials'

const schema = z.object(repoFields)

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Chaque analyse consomme des requêtes GitHub : on limite par utilisateur.
  if (!(await allow(`analyze:${session.user.id}`, 10, 60_000))) {
    return NextResponse.json(
      { error: "Trop d'analyses en peu de temps. Patientez une minute avant de réessayer." },
      { status: 429 },
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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }

  try {
    const { ref, root } = resolveRepo(parsed.data)
    const credential = await resolveUserRepoToken(session.user.id, parsed.data)
    const analysis = await analyzeGitHubRepo(ref, {
      root,
      token: process.env.GITHUB_TOKEN,
      installationToken: credential?.source === 'app' ? credential.token : undefined,
      userToken: credential?.source === 'pat' ? credential.token : undefined,
    })
    return NextResponse.json(analysis)
  } catch (error) {
    return errorResponse(error)
  }
}
