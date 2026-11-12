'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Overall = 'ok' | 'degraded' | 'down'

const META: Record<Overall, { label: string; dot: string; text: string }> = {
  ok: { label: 'Opérationnel', dot: 'bg-success', text: 'text-success' },
  degraded: { label: 'Dégradé', dot: 'bg-warning', text: 'text-warning' },
  down: { label: 'Incident', dot: 'bg-destructive', text: 'text-destructive' },
}

/** État public simplifié de la plateforme (distinct de la connexion temps réel). */
export function PlatformStatusIndicator({ className }: { className?: string }) {
  const [state, setState] = useState<Overall | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { status?: Overall }) => {
        if (!cancelled && (d.status === 'ok' || d.status === 'degraded' || d.status === 'down')) setState(d.status)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  if (!state) return null
  const m = META[state]
  return (
    <Link
      href="/status"
      className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded', className)}
      title="État des services"
    >
      <span className={cn('h-2 w-2 rounded-full', m.dot)} aria-hidden="true" />
      <span>Services : <span className={cn('font-medium', m.text)}>{m.label}</span></span>
    </Link>
  )
}
