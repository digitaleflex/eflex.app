'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type StreamLine = { n: number; text: string; ts?: string }
export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'done' | 'error'

const MAX_LINES = 5_000

/**
 * Suit un flux SSE de journaux. EventSource se reconnecte seul avec `Last-Event-ID`
 * (le serveur reprend alors après la dernière ligne reçue) ; on dédoublonne par rang.
 * Au-delà de MAX_LINES, les plus anciennes sont retirées (`dropped` les compte).
 */
export function useLogStream(url: string | null) {
  const [lines, setLines] = useState<StreamLine[]>([])
  const [state, setState] = useState<StreamState>('connecting')
  const [status, setStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dropped, setDropped] = useState(0)
  const lastN = useRef(-1)

  const reset = useCallback(() => {
    setLines([])
    setDropped(0)
    setStatus(null)
    setNotice(null)
    lastN.current = -1
  }, [])

  useEffect(() => {
    if (!url) return
    reset()
    setState('connecting')
    const source = new EventSource(url)

    source.addEventListener('open', () => {
      setState('live')
      setNotice(null)
    })
    source.addEventListener('log', (e) => {
      const { lines: incoming } = JSON.parse((e as MessageEvent<string>).data) as { lines: StreamLine[] }
      const fresh = incoming.filter((l) => l.n > lastN.current)
      if (fresh.length === 0) return
      lastN.current = fresh[fresh.length - 1]!.n
      setLines((prev) => {
        const next = prev.concat(fresh)
        if (next.length <= MAX_LINES) return next
        setDropped((d) => d + next.length - MAX_LINES)
        return next.slice(next.length - MAX_LINES)
      })
    })
    source.addEventListener('status', (e) => setStatus((JSON.parse((e as MessageEvent<string>).data) as { status: string }).status))
    source.addEventListener('warn', (e) => setNotice((JSON.parse((e as MessageEvent<string>).data) as { message: string }).message))
    source.addEventListener('end', () => {
      source.close()
      setState('done')
    })
    source.onerror = () => {
      // CONNECTING : le navigateur réessaie ; CLOSED : refus définitif (401, 404, 429…).
      setState(source.readyState === EventSource.CLOSED ? 'error' : 'reconnecting')
    }
    return () => source.close()
  }, [url, reset])

  return { lines, state, status, notice, dropped }
}
