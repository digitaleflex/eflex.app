'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface MaintenanceState {
  enabled: boolean
  message: string | null
  announcement?: string | null
  announcementLevel?: 'info' | 'warning'
}

/**
 * Bannière globale. L'état est interrogé côté client : les pages statiques
 * (accueil, connexion…) sont générées au build et ne peuvent pas lire un
 * réglage modifié à l'exécution.
 *
 * En maintenance, le bandeau de maintenance remplace l'annonce ; hors
 * maintenance, l'annonce configurée dans `/admin/infrastructure` s'affiche.
 *
 * Masquée sur les routes `/dashboard` : le tableau de bord possède son propre
 * emplacement unique priorisé (impersonation/suspension/past_due/maintenance/annonce).
 */
export function MaintenanceBanner() {
  const pathname = usePathname()
  const inDashboard = pathname?.startsWith('/dashboard') ?? false
  const [state, setState] = useState<MaintenanceState | null>(null)

  useEffect(() => {
    if (inDashboard) return
    let cancelled = false
    fetch('/api/maintenance', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: MaintenanceState) => {
        if (!cancelled) setState(data)
      })
      .catch(() => {
        // Pas de bannière si l'endpoint est indisponible.
      })
    return () => {
      cancelled = true
    }
  }, [inDashboard])

  if (inDashboard || !state) return null

  if (state.enabled) {
    return (
      <div
        role="status"
        className="sticky top-0 z-[60] border-b border-amber-500/30 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
      >
        <span className="font-medium">Maintenance en cours.</span>{' '}
        {state.message || 'Le service peut être momentanément indisponible.'}{' '}
        <Link href="/status" className="font-medium underline underline-offset-2 hover:no-underline">
          Voir le statut des services
        </Link>
      </div>
    )
  }

  if (!state.announcement) return null

  const warning = state.announcementLevel === 'warning'
  return (
    <div
      role="status"
      className={
        warning
          ? 'sticky top-0 z-[60] border-b border-amber-500/30 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100'
          : 'sticky top-0 z-[60] border-b border-primary/20 bg-primary/5 px-4 py-2.5 text-center text-sm text-foreground'
      }
    >
      {state.announcement}
    </div>
  )
}
