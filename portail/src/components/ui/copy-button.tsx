'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CopyButtonProps = {
  value: string
  /** Texte visible ou seulement lu (ex. « Copier l'identifiant »). */
  label?: string
  copiedLabel?: string
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'icon'
  className?: string
}

const RESET_MS = 2_000

/** Copie dans le presse-papiers, avec repli pour les contextes non sécurisés. */
async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // On tente le repli ci-dessous (permission refusée, iframe sans focus…).
  }
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(area)
  }
}

export function CopyButton({ value, label = 'Copier', copiedLabel = 'Copié', variant = 'outline', size = 'sm', className }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const copy = async () => {
    const ok = await writeClipboard(value)
    setState(ok ? 'copied' : 'error')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), RESET_MS)
  }

  const Icon = state === 'copied' ? Check : Copy
  const iconOnly = size === 'icon'

  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => void copy()}
        className="gap-1.5"
        aria-label={iconOnly ? (state === 'copied' ? copiedLabel : label) : undefined}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {!iconOnly && <span>{state === 'copied' ? copiedLabel : label}</span>}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Copié dans le presse-papiers.' : state === 'error' ? 'Copie impossible : sélectionnez le texte manuellement.' : ''}
      </span>
    </span>
  )
}
