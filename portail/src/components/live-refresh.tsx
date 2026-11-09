'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEvents } from '@/hooks/events-provider'

/**
 * Rafraîchit la page serveur quand un événement concerné arrive (remplace l'interrogation).
 * Les rafales sont regroupées : au plus un rafraîchissement par `delayMs`.
 */
export function LiveRefresh({ types, projectId, delayMs = 400 }: { types: readonly string[]; projectId?: string; delayMs?: number }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEvents(types, (event) => {
    if (projectId && event.projectId !== projectId) return
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      router.refresh()
    }, delayMs)
  })
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return null
}
