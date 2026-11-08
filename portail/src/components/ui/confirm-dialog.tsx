'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ConfirmDialogProps = {
  open: boolean
  title: string
  /** Conséquence de l'action, en clair (« Les 3 projets seront supprimés… »). */
  description: React.ReactNode
  /** Verbe d'action : « Retirer le membre », jamais « OK ». */
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  /** Si renseigné, l'utilisateur doit saisir ce texte pour activer le bouton. */
  requireText?: string
  /** Champs supplémentaires (ex. motif obligatoire). */
  children?: React.ReactNode
  /** Désactive la confirmation tant que les champs supplémentaires sont invalides. */
  confirmDisabled?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

/**
 * Dialogue de confirmation basé sur l'élément natif <dialog> : le navigateur gère le piège de
 * focus, la touche Échap, le retour du focus et `aria-modal`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annuler',
  destructive = false,
  requireText,
  children,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setTyped('')
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const blocked = confirmDisabled || (requireText !== undefined && typed !== requireText)

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        // Échap : on laisse le parent décider (l'état `open` reste la source de vérité).
        e.preventDefault()
        if (!busy) onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50"
    >
      <form
        method="dialog"
        className="space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          if (blocked || busy) return
          setBusy(true)
          try {
            await onConfirm()
          } finally {
            setBusy(false)
          }
        }}
      >
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <div id={descId} className="text-sm text-muted-foreground">{description}</div>
        {children}
        {requireText !== undefined && (
          <Input
            id={`${titleId}-confirm`}
            label={`Saisissez « ${requireText} » pour confirmer`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button type="submit" variant={destructive ? 'destructive' : 'primary'} disabled={blocked} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
