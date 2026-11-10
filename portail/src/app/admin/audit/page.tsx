import { prisma } from '@/lib/prisma'
import { AuditTail, type AuditEntryView } from '@/components/admin/audit-tail'

export const metadata = { title: "Journal d'audit — Administration Eflex" }
export const dynamic = 'force-dynamic'

const asDetails = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export default async function AuditPage() {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const entries: AuditEntryView[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    organizationId: row.organizationId,
    actorEmail: row.actorEmail,
    details: asDetails(row.details),
    createdAt: row.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Journal d&apos;audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Les 100 dernières actions d&apos;administration, suivies en direct. Ce journal ne peut ni être modifié ni être effacé
          depuis l&apos;interface.
        </p>
      </div>
      <AuditTail initial={entries} />
    </div>
  )
}
