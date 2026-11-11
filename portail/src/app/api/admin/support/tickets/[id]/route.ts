import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { notify } from '@/lib/notifications'
import { isSupportPriority, isSupportStatus, supportStatusLabel } from '@/lib/support-tickets'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  adminNote: z.string().max(4000).optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
})

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  const { id } = await params
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true, slug: true } },
      project: { select: { id: true, name: true, slug: true } },
      deployment: { select: { id: true, status: true, commitSha: true, logsSummary: true, createdAt: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })
  return NextResponse.json({ ticket })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 })
  }

  const existing = await prisma.supportTicket.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 })

  const data = parsed.data
  const nextStatus = data.status && isSupportStatus(data.status) ? data.status : undefined
  const nextPriority = data.priority && isSupportPriority(data.priority) ? data.priority : undefined
  const resolvedAt = nextStatus && (nextStatus === 'resolved' || nextStatus === 'closed') ? new Date() : nextStatus ? null : undefined

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextPriority ? { priority: nextPriority } : {}),
      ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
      ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
      ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    },
    select: { id: true, status: true, priority: true, userId: true, subject: true },
  })

  await audit({
    actor: admin.session.user,
    action: 'support.ticket.update',
    target: { type: 'support_ticket', id: ticket.id },
    organizationId: existing.organizationId,
    details: { status: ticket.status, priority: ticket.priority },
    request,
  }).catch(() => undefined)

  if (nextStatus && nextStatus !== existing.status) {
    await notify({
      userIds: [ticket.userId],
      type: 'support.ticket_updated',
      title: `Ticket mis à jour : ${supportStatusLabel(ticket.status)}`,
      body: ticket.subject.slice(0, 120),
      href: '/dashboard/support',
      dedupeKey: `support-ticket-updated:${ticket.id}:${ticket.status}`,
    }).catch(() => undefined)
  }

  return NextResponse.json({ ticket })
}
