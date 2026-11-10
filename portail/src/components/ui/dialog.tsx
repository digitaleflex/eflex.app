'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Actions alignées à droite ; le bouton annuler est fourni par l'appelant. */
  footer?: ReactNode
  size?: keyof typeof sizes
  /** Libellé du bouton de fermeture, en français. */
  closeLabel?: string
  className?: string
}

/**
 * Dialogue modal basé sur l'élément natif `<dialog>` : piège de focus, touche Échap,
 * retour du focus au déclencheur et `aria-modal` sont gérés par le navigateur.
 * Fermeture par Échap, clic sur le fond ou bouton dédié.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Fermer',
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Échap : le parent garde la source de vérité de l'état ouvert.
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-xl border border-border bg-surface-raised p-0 text-surface-raised-foreground shadow-lg backdrop:bg-black/50',
        sizes[size],
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {children && <div className="space-y-4 px-5 pb-4">{children}</div>}
      {footer && <div className="flex flex-col-reverse gap-2 border-t border-border p-5 sm:flex-row sm:justify-end">{footer}</div>}
    </dialog>
  )
}
