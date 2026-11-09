import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const schema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })])

/** Marque comme lues les notifications données, ou toutes. Ne touche jamais celles d'un autre utilisateur. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const userId = session.user.id

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })

  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...('all' in parsed.data ? {} : { id: { in: parsed.data.ids } }) },
    data: { readAt: new Date() },
  })
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } })
  return NextResponse.json({ updated: count, unreadCount })
}
