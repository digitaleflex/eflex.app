import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Notifications de l'utilisateur connecté (les plus récentes d'abord), pagination par curseur. */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const userId = session.user.id

  const url = new URL(request.url)
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20))
  const before = url.searchParams.get('before')
  const unreadOnly = url.searchParams.get('unread') === '1'

  const cursor = before ? await prisma.notification.findFirst({ where: { id: before, userId }, select: { id: true, createdAt: true } }) : null
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
      // Curseur composite (date, identifiant) : avec la date seule, les notifications créées au même
      // instant que la dernière d'une page seraient sautées à la page suivante.
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
  })
  const page = rows.slice(0, limit)
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } })

  return NextResponse.json({
    notifications: page,
    unreadCount,
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  })
}
