'use client'

import { useConnectionState } from '@/hooks/events-provider'

const LABEL = { connecting: 'Connexion…', live: 'En direct', reconnecting: 'Reconnexion…', ended: 'Hors ligne' } as const

/** Pastille discrète : l'état de la connexion temps réel (texte + couleur, jamais la couleur seule). */
export function ConnectionBadge({ className }: { className?: string }) {
  const state = useConnectionState()
  if (!state) return null
  const dot = state === 'live' ? 'bg-success' : state === 'ended' ? 'bg-destructive' : 'bg-warning'
  return (
    <p role="status" className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ''}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
      {LABEL[state]}
    </p>
  )
}
