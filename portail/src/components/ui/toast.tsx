'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

export type ToastVariant = 'info' | 'success' | 'error'
export type ToastInput = { title: string; description?: string; variant?: ToastVariant; href?: string; actionLabel?: string }
type ToastItem = ToastInput & { id: number; variant: ToastVariant }

const Ctx = createContext<{ toast: (t: ToastInput) => void } | null>(null)

const AUTO_DISMISS_MS = 7_000
const MAX_VISIBLE = 3

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const
const TONE = {
  info: 'border-border',
  success: 'border-success/40',
  error: 'border-destructive/50',
} as const
const ICON_TONE = { info: 'text-primary', success: 'text-success', error: 'text-destructive' } as const

/**
 * Notifications éphémères. Messages d'information et de succès : région `status` (annonce polie),
 * disparition après 7 s, suspendue au survol et au focus. Erreurs : région `alert`, jamais
 * retirées automatiquement. Fermeture au clavier (bouton, ou Échap quand le focus est dans la zone).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), [])
  const toast = useCallback((input: ToastInput) => {
    const item: ToastItem = { ...input, variant: input.variant ?? 'info', id: nextId.current++ }
    setItems((all) => [...all, item].slice(-MAX_VISIBLE))
  }, [])
  const value = useMemo(() => ({ toast }), [toast])

  const polite = items.filter((t) => t.variant !== 'error')
  const assertive = items.filter((t) => t.variant === 'error')

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-end gap-2 lg:bottom-4 lg:left-auto lg:right-4 lg:w-96"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && items.length > 0) dismiss(items[items.length - 1]!.id)
        }}
      >
        <div role="status" aria-live="polite" className="flex w-full flex-col items-end gap-2">
          {polite.map((t) => <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />)}
        </div>
        <div role="alert" className="flex w-full flex-col items-end gap-2">
          {assertive.map((t) => <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />)}
        </div>
      </div>
    </Ctx.Provider>
  )
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [paused, setPaused] = useState(false)
  const Icon = ICON[item.variant]

  useEffect(() => {
    if (item.variant === 'error' || paused) return
    const timer = setTimeout(onClose, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [item.variant, paused, onClose])

  return (
    <div
      className={`pointer-events-auto flex w-full gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg ${TONE[item.variant]}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ICON_TONE[item.variant]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold">{item.title}</p>
        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
        {item.href && (
          <Link
            href={item.href}
            onClick={onClose}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
          >
            {item.actionLabel ?? 'Voir'}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer la notification"
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  // Hors fournisseur : sans effet, pour ne pas casser un composant rendu isolément.
  return ctx ?? { toast: () => undefined }
}
