import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response

  const url = new URL(request.url)
  const status = url.searchParams.get('status')?.trim()
  const where = status ? { status } : {}

  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true, slug: true } },
      project: { select: { id: true, name: true } },
      deployment: { select: { id: true, status: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })
  return NextResponse.json({ tickets })
}
