import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { resolveOrganization } from '@/lib/organizations'
import { prisma } from '@/lib/prisma'
import { OrganizationPanel, type TeamActivity } from '@/components/organization/organization-panel'

export const metadata = { title: 'Équipe' }
export const dynamic = 'force-dynamic'

const TEAM_EVENT_TYPES = [
  'member.added',
  'member.removed',
  'member.updated',
  'invitation.created',
  'invitation.updated',
] as const

function stringValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' ? value : null
}

async function recentTeamActivity(organizationId: string): Promise<TeamActivity[]> {
  const rows = await prisma.event.findMany({
    where: { organizationId, audience: 'org', type: { in: [...TEAM_EVENT_TYPES] } },
    orderBy: { id: 'desc' },
    take: 12,
  })

  const userIds = new Set<string>()
  for (const row of rows) {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const userId = stringValue(payload, 'userId')
    if (userId) userIds.add(userId)
  }

  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, name: true, email: true },
      })
    : []
  const userById = new Map(users.map((user) => [user.id, user]))

  return rows.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const userId = stringValue(payload, 'userId')
    const user = userId ? userById.get(userId) : undefined
    return {
      id: String(row.id),
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      payload: {
        role: stringValue(payload, 'role'),
        status: stringValue(payload, 'status'),
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
      },
    }
  })
}

export default async function OrganizationPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const org = await resolveOrganization(session)
  const teamActivity = org ? await recentTeamActivity(org.organizationId) : []
  return <OrganizationPanel currentUserId={session.user.id} teamActivity={teamActivity} />
}
