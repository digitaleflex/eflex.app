'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isDismissible, selectBanner, type BannerKind } from '@/lib/banner-priority'

interface MaintenanceState {
  enabled: boolean
  message: string | null
  announcement?: string | null
  announcementLevel?: 'info' | 'warning'
}

export interface BillingBlock {
  kind: 'suspension' | 'past_due'
  message: string
}

interface DashboardBannerProps {
  impersonatedUserName?: string | null
  billingBlock?: BillingBlock | null
}

const DISMISS_KEY = 'eflex-dismissed-announcement'

function announcementHash(announcement: string, level: string): string {
  // Empreinte simple et stable pour ne pas remasquer une annonce modifiée.
  const input = `${level}\n${announcement}`
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return String(h)
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

function writeDismissed(hash: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, hash)
  } catch {
    // localStorage indisponible : le dismiss reste local à la session React.
  }
}

/**
 * Emplacement unique des bandeaux du tableau de bord, sous la barre du haut.
 * Priorité : impersonation > suspension > past_due > maintenance > announcement.
 * Une seule bannière visible à la fois.
 */
export function DashboardBanner({ impersonatedUserName, billingBlock }: DashboardBannerProps) {
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null)
  const [dismissedHash, setDismissedHash] = useState<string | null>(null)

  useEffect(() => {
    setDismissedHash(readDismissed())

    let cancelled = false
    fetch('/api/maintenance', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: MaintenanceState) => {
        if (!cancelled) setMaintenance(data)
      })
      .catch(() => {
        // Pas de bannière maintenance/annonce si l'endpoint est indisponible.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const announcement = !maintenance?.enabled ? maintenance?.announcement?.trim() || null : null
  const announcementLevel = maintenance?.announcementLevel === 'warning' ? 'warning' : 'info'
  const currentAnnouncementHash = announcement ? announcementHash(announcement, announcementLevel) : null
  const announcementDismissed = Boolean(
    currentAnnouncementHash && dismissedHash === currentAnnouncementHash,
  )

  const chosen = useMemo(() => {
    const candidates: BannerKind[] = []
    if (impersonatedUserName) candidates.push('impersonation')
    if (billingBlock) candidates.push(billingBlock.kind)
    if (maintenance?.enabled) candidates.push('maintenance')
    if (announcement && !announcementDismissed) candidates.push('announcement')
    return selectBanner(candidates)
  }, [impersonatedUserName, billingBlock, maintenance, announcement, announcementDismissed])

  if (!chosen) return null

  if (chosen === 'impersonation' && impersonatedUserName) {
    return <ImpersonationBannerContent userName={impersonatedUserName} />
  }

  if ((chosen === 'suspension' || chosen === 'past_due') && billingBlock) {
    return <BillingBannerContent message={billingBlock.message} />
  }

  if (chosen === 'maintenance' && maintenance?.enabled) {
    return <MaintenanceBannerContent message={maintenance.message} />
  }

  if (chosen === 'announcement' && announcement && currentAnnouncementHash) {
    return (
      <AnnouncementBannerContent
        message={announcement}
        level={announcementLevel}
        dismissible={isDismissible('announcement')}
        onDismiss={() => {
          writeDismissed(currentAnnouncementHash)
          setDismissedHash(currentAnnouncementHash)
        }}
      />
    )
  }

  return null
}

function ImpersonationBannerContent({ userName }: { userName: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function stop() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/impersonation/stop', { method: 'POST' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Impossible de quitter ce compte pour le moment.')
        return
      }
      window.location.assign('/admin/users')
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      aria-label={`Session d’usurpation active : ${userName}`}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">Vous utilisez le compte de {userName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Session d’administration : vos actions sont enregistrées dans le journal d’audit.
        </p>
      </div>
      {error && (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={busy}
        onClick={() => void stop()}
        aria-label="Quitter la session d’usurpation et revenir à l’administration"
      >
        Revenir à mon compte
      </Button>
    </div>
  )
}

function BillingBannerContent({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
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

function MaintenanceBannerContent({ message }: { message: string | null }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="min-w-0 flex-1">
        <span className="font-medium">Maintenance en cours.</span>{' '}
        <span>{message || 'Certaines fonctionnalités peuvent être momentanément indisponibles.'}</span>
      </p>
      <Link
        href="/status"
        className="shrink-0 font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
      >
        Consulter l’état des services
      </Link>
    </div>
  )
}

function AnnouncementBannerContent({
  message,
  level,
  dismissible,
  onDismiss,
}: {
  message: string
  level: 'info' | 'warning'
  dismissible: boolean
  onDismiss: () => void
}) {
  const warning = level === 'warning'
  return (
    <div
      role={warning ? 'alert' : 'status'}
      className={
        warning
          ? 'flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100'
          : 'flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-foreground'
      }
    >
      <p className="min-w-0 flex-1">
        <span className="font-medium">{warning ? 'Annonce importante : ' : 'Annonce : '}</span>
        <span>{message}</span>
      </p>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-current/20 px-3 text-xs font-medium hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
          aria-label="Fermer cette annonce"
        >
          Fermer
        </button>
      )}
    </div>
  )
}
