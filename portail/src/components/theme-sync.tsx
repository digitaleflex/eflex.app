'use client'

import { useEffect } from 'react'
import { applyTheme, readTheme } from '@/lib/theme'

/**
 * Suit les changements de préférence système quand le thème choisi est « système ».
 * Le premier rendu est déjà géré par `themeBootScript`, avant peinture.
 */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      if (readTheme() === 'system') applyTheme('system')
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return null
}
