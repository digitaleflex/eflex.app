import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  // Le filtre sur userId garantit qu'un utilisateur ne lit que ses propres projets.
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      name: true,
      slug: true,
      repoUrl: true,
      branch: true,
      framework: true,
      runtime: true,
      domain: true,
      port: true,
      createdAt: true,
      updatedAt: true,
      // Seulement les noms des variables : les valeurs ne quittent jamais le serveur.
      envVars: { select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } },
      deployments: {
        select: { id: true, status: true, commitSha: true, logsSummary: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  return NextResponse.json({ project })
}
