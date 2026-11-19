import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getApplicationRollbackImages } from '@/lib/coolify'
import { requireManagedProject } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Versions disponibles pour un retour arrière côté Coolify, par application du projet.
 * Lecture seule : aide l'interface à montrer quels commits/images sont restaurables.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const result = await requireManagedProject(session, id, {
    id: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, coolifyAppId: true },
    },
  })
  if ('response' in result) return result.response

  const apps = await Promise.all(
    result.project.apps
      .filter((app) => Boolean(app.coolifyAppId))
      .map(async (app) => {
        const images = await getApplicationRollbackImages(app.coolifyAppId as string)
        return {
          id: app.id,
          name: app.name,
          ...('error' in images ? { images: [], error: images.error } : { images: images.images }),
        }
      }),
  )

  return NextResponse.json({ apps })
}
