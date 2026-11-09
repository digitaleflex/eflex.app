import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { NOTIFICATION_TYPES, isNotificationType } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/** Préférences par type : tout est activé tant que l'utilisateur n'a rien désactivé. */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const stored = await prisma.notificationPreference.findMany({ where: { userId: session.user.id, channel: 'app' } })
  const byType = new Map(stored.map((p) => [p.type, p.enabled]))
  return NextResponse.json({
    preferences: Object.entries(NOTIFICATION_TYPES).map(([type, meta]) => ({ type, ...meta, enabled: byType.get(type) ?? true })),
  })
}

const schema = z.object({ type: z.string(), enabled: z.boolean() })

export async function PUT(request: Request) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const userId = session.user.id

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !isNotificationType(parsed.data.type)) {
    return NextResponse.json({ error: 'Type de notification inconnu.' }, { status: 400 })
  }
  const { type, enabled } = parsed.data
  await prisma.notificationPreference.upsert({
    where: { userId_type_channel: { userId, type, channel: 'app' } },
    create: { userId, type, channel: 'app', enabled },
    update: { enabled },
  })
  return NextResponse.json({ type, enabled })
}
