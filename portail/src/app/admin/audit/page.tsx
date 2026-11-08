import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'

export const metadata = { title: "Journal d'audit — Administration Eflex" }

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const LABEL: Record<string, string> = {
  'user.ban': 'Compte suspendu',
  'user.unban': 'Compte réactivé',
}

export default async function AuditPage() {
  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Journal d&apos;audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Les 100 dernières actions d&apos;administration. Ce journal ne peut ni être modifié ni être effacé depuis l&apos;interface.</p>
      </div>
      <Card>
        {entries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">Aucune action enregistrée</p>
            <p className="mt-1 text-sm text-muted-foreground">Les suspensions, réactivations et autres actions d&apos;administration apparaîtront ici.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => {
              const details = (e.details ?? {}) as Record<string, unknown>
              return (
                <li key={e.id} className="space-y-1 p-4">
                  <p className="text-sm font-medium">{LABEL[e.action] ?? e.action}{typeof details.targetEmail === 'string' && ` — ${details.targetEmail}`}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={e.createdAt.toISOString()}>{dateTime.format(e.createdAt)}</time> · par {e.actorEmail}
                  </p>
                  {typeof details.reason === 'string' && <p className="text-sm text-muted-foreground">Motif : {details.reason}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
