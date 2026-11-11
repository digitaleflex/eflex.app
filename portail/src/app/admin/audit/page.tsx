import { Filter, RotateCcw } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { redact } from '@/lib/audit'
import { AuditTail, type AuditEntryView } from '@/components/admin/audit-tail'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { Select } from '@/components/ui/select'
import { formatInteger } from '@/lib/table'
import {
  AUDIT_PAGE_SIZE,
  AUDIT_ACTION_OPTIONS,
  AUDIT_PERIOD_OPTIONS,
  auditHrefTemplate,
  auditWhere,
  isAuditFiltered,
  parseAuditQuery,
} from '@/lib/admin-audit'

export const metadata = { title: "Journal d'audit — Administration Eflex" }
export const dynamic = 'force-dynamic'

const asDetails = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; acteur?: string; cible?: string; jours?: string; page?: string }>
}) {
  await requireAdminPage()
  const query = parseAuditQuery(await searchParams)
  const where = auditWhere(query)
  const filtered = isAuditFiltered(query)

  const [total, totalAll] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count(),
  ])
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))
  const page = Math.min(query.page, pages)

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
    // Ni adresse IP ni agent utilisateur : inutiles à la lecture du journal, donc non chargés.
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      organizationId: true,
      actorEmail: true,
      details: true,
      createdAt: true,
    },
  })

  const entries: AuditEntryView[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    organizationId: row.organizationId,
    actorEmail: row.actorEmail,
    details: asDetails(redact(row.details)),
    createdAt: row.createdAt.toISOString(),
  }))

  const periodLabel =
    AUDIT_PERIOD_OPTIONS.find((option) => option.days === query.days)?.label ?? 'Toute la période'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal d’audit"
        description="Chaque action d’administration est enregistrée avec son acteur, sa cible, sa date et un motif éventuel. Le journal ne peut être ni modifié ni effacé depuis l’interface."
        actions={
          filtered ? (
            <LinkButton href="/admin/audit">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Réinitialiser les filtres
            </LinkButton>
          ) : undefined
        }
      />

      <form
        role="search"
        method="get"
        action="/admin/audit"
        className="space-y-4 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Filtrer le journal</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select
            name="action"
            label="Action"
            defaultValue={query.action ?? ''}
            placeholder="Toutes les actions"
            options={AUDIT_ACTION_OPTIONS}
          />
          <Input
            id="audit-acteur"
            name="acteur"
            type="search"
            label="Acteur"
            defaultValue={query.actor}
            placeholder="ex. admin@eflex.app"
            hint="Adresse e-mail, même partielle."
          />
          <Input
            id="audit-cible"
            name="cible"
            type="search"
            label="Cible"
            defaultValue={query.target}
            placeholder="ex. projet, organisation ou identifiant"
            hint="Type ou identifiant de la cible."
          />
          <Select
            name="jours"
            label="Période"
            defaultValue={String(query.days)}
            options={AUDIT_PERIOD_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Appliquer les filtres
          </Button>
          {filtered ? (
            <LinkButton href="/admin/audit">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Tout effacer
            </LinkButton>
          ) : null}
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {filtered
              ? `${formatInteger(total)} entrée${total > 1 ? 's' : ''} correspondante${total > 1 ? 's' : ''} sur ${formatInteger(totalAll)} · ${periodLabel.toLowerCase()}`
              : `${formatInteger(total)} entrée${total > 1 ? 's' : ''} au total · ${periodLabel.toLowerCase()}`}
          </p>
        </div>
      </form>

      <AuditTail initial={entries} filters={query} />

      <Pagination page={page} pages={pages} hrefTemplate={auditHrefTemplate(query)} label="Pagination du journal d’audit" />
    </div>
  )
}
