import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { platformDomain, validateCustomDomain } from '@/lib/custom-domain'
import { effectivePlan } from '@/lib/billing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ hostname: z.string().trim().min(1).max(300) })

function serialize(domain: {
  id: string
  hostname: string
  verifiedAt: Date | null
  tlsValid: boolean | null
  tlsExpiresAt: Date | null
  tlsCheckedAt: Date | null
  createdAt: Date
}) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
    tlsValid: domain.tlsValid,
    tlsExpiresAt: domain.tlsExpiresAt?.toISOString() ?? null,
    tlsCheckedAt: domain.tlsCheckedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
  }
}

/** Liste le domaine plateforme et les domaines personnalisés du projet. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: {
      id: true,
      domain: true,
      domains: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  const plan = await effectivePlan(org.organizationId)

  return NextResponse.json(
    {
      primary: project.domain,
      target: platformDomain(),
      max: plan.customDomainLimit,
      plan: plan.id,
      domains: project.domains.map(serialize),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

/** Ajoute un domaine personnalisé (non actif tant que le DNS n'est pas vérifié). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de modifier les domaines.' }, { status: 403 })
  }

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: { id: true, domain: true, _count: { select: { domains: true } } },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Domaine invalide.' }, { status: 400 })
  }

  const validation = validateCustomDomain(parsed.data.hostname)
  if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 })
  const hostname = validation.hostname

  if (hostname === project.domain) {
    return NextResponse.json({ error: 'Ce domaine est déjà le domaine principal du projet.' }, { status: 409 })
  }
  const plan = await effectivePlan(org.organizationId)
  if (project._count.domains >= plan.customDomainLimit) {
    return NextResponse.json(
      { error: `Le plan ${plan.label} est limité à ${plan.customDomainLimit} domaines personnalisés par projet.`, code: 'plan_limit' },
      { status: 422 },
    )
  }

  try {
    const domain = await prisma.projectDomain.create({
      data: { projectId: project.id, hostname },
    })
    return NextResponse.json(
      {
        domain: serialize(domain),
        target: platformDomain(),
        instructions: `Créez un enregistrement CNAME « ${hostname} » vers « ${platformDomain() ?? 'eflex.app'} », puis cliquez sur Vérifier.`,
      },
      { status: 201 },
    )
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Ce domaine est déjà utilisé par un autre projet.' }, { status: 409 })
    }
    console.error('[domains] ajout impossible', error)
    return NextResponse.json({ error: 'Impossible d’ajouter ce domaine.' }, { status: 500 })
  }
}
