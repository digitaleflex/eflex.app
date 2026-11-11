import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { allow } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { resolveOrganization } from '@/lib/organizations'
import { memberIds, notify } from '@/lib/notifications'
import { isSupportCategory, isSupportPriority } from '@/lib/support-tickets'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  subject: z.string().trim().min(5, 'Le sujet doit contenir au moins 5 caractères.').max(160),
  category: z.string().optional(),
  priority: z.string().optional(),
  body: z.string().trim().min(20, 'Décrivez le problème en au moins 20 caractères.').max(8000),
  projectId: z.string().cuid().optional().nullable(),
  deploymentId: z.string().cuid().optional().nullable(),
})

export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      project: { select: { id: true, name: true } },
      deployment: { select: { id: true, status: true } },
    },
  })
  return NextResponse.json({ tickets })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!(await allow(`support:create:${session.user.id}`, 5, 60 * 60_000))) {
    return NextResponse.json({ error: 'Trop de tickets soumis récemment. Réessayez dans une heure.' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 })
  }

  const data = parsed.data
  const category = isSupportCategory(data.category ?? 'general') ? (data.category ?? 'general') : 'general'
  const priority = isSupportPriority(data.priority ?? 'normal') ? (data.priority ?? 'normal') : 'normal'

  let organizationId: string | null = null
  let projectId: string | null = null
  let deploymentId: string | null = null

  if (data.projectId) {
    const org = await resolveOrganization(session)
    if (org) {
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, organizationId: org.organizationId },
        select: { id: true, organizationId: true },
      })
      if (project) {
        projectId = project.id
        organizationId = project.organizationId
      }
    }
  } else {
    const org = await resolveOrganization(session)
    organizationId = org?.organizationId ?? null
  }

  if (data.deploymentId && projectId) {
    const dep = await prisma.deployment.findFirst({
      where: { id: data.deploymentId, projectId },
      select: { id: true },
    })
    deploymentId = dep?.id ?? null
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: session.user.id,
      organizationId,
      projectId,
      deploymentId,
      subject: data.subject,
      category,
      priority,
      body: data.body,
      status: 'open',
    },
    select: { id: true, subject: true, status: true, createdAt: true },
  })

  await audit({
    actor: session.user,
    action: 'support.ticket.create',
    target: { type: 'support_ticket', id: ticket.id },
    organizationId,
    details: { category, priority, projectId, deploymentId },
    request,
  }).catch(() => undefined)

  // Notifier les administrateurs de plateforme (best-effort).
  try {
    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } })
    const adminIds = admins.map((a) => a.id).filter((id) => id !== session.user.id)
    if (adminIds.length > 0) {
      await notify({
        userIds: adminIds,
        type: 'support.ticket_created',
        title: `Nouveau ticket de support : ${ticket.subject.slice(0, 80)}`,
        body: `Catégorie : ${category}. Un client a soumis un ticket.`,
        href: `/admin/support/${ticket.id}`,
        dedupeKey: `support-ticket-created:${ticket.id}`,
      })
    }
  } catch {
    // non bloquant
  }

  // Notifier aussi les propriétaires/admins de l'organisation concernée si applicable.
  if (organizationId) {
    try {
      const owners = await memberIds(organizationId, ['owner', 'admin'])
      const recipients = owners.filter((id) => id !== session.user.id)
      if (recipients.length > 0) {
        await notify({
          userIds: recipients,
          type: 'support.ticket_created',
          title: `Nouveau ticket de support : ${ticket.subject.slice(0, 80)}`,
          body: 'Un membre de votre organisation a soumis un ticket de support.',
          href: `/dashboard/support`,
          organizationId,
          dedupeKey: `support-ticket-created-org:${ticket.id}`,
        })
      }
    } catch {
      // non bloquant
    }
  }

  return NextResponse.json({ ticket }, { status: 201 })
}
