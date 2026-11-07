'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface MaintenanceState {
  enabled: boolean
  message: string | null
}

/**
 * Bannière globale. L'état est interrogé côté client : les pages statiques
 * (accueil, connexion…) sont générées au build et ne peuvent pas lire une
 * variable d'environnement modifiée à l'exécution.
 */
export function MaintenanceBanner() {
  const [state, setState] = useState<MaintenanceState | null>(null)

  useEffect(() => {
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
  }, [])

  if (!state?.enabled) return null

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
