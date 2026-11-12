import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export function BillingBlockBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">Action requise sur votre abonnement</p>
        <p className="mt-0.5 text-muted-foreground">{message}</p>
      </div>
      <Link
        href="/dashboard/organization"
        className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Gérer l’abonnement de l’organisation"
      >
        Gérer l’abonnement
      </Link>
    </div>
  )
}
