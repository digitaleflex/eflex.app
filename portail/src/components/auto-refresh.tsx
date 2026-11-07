'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Recharge les données du serveur à intervalle régulier tant que `active` est vrai. */
export function AutoRefresh({ active, everyMs = 5_000, maxMs = 30 * 60_000 }: { active: boolean; everyMs?: number; maxMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    const start = Date.now()
    const id = setInterval(() => {
      if (Date.now() - start > maxMs) return clearInterval(id)
      if (document.visibilityState === 'visible') router.refresh()
    }, everyMs)
    return () => clearInterval(id)
  }, [active, everyMs, maxMs, router])

  return null
}
