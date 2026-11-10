'use client'

import { useEffect, useRef } from 'react'

/**
 * Captcha Cloudflare Turnstile (facultatif).
 *
 * Activé uniquement si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` est défini au build et
 * `TURNSTILE_SECRET_KEY` au runtime : les deux clés vont de pair. Sans elles,
 * le widget ne s'affiche pas et aucune requête n'est bloquée.
 */
export const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
export const CAPTCHA_ENABLED = Boolean(CAPTCHA_SITE_KEY)

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback?: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'auto' | 'light' | 'dark'
      language?: string
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

/** Charge le script Turnstile une seule fois par page. */
function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Captcha indisponible')))
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Captcha indisponible'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Options de requête à transmettre aux méthodes Better Auth protégées par captcha. */
export function captchaHeaders(token: string | null): { headers: Record<string, string> } | undefined {
  return token ? { headers: { 'x-captcha-response': token } } : undefined
}

export function Turnstile({
  onToken,
  className,
}: {
  onToken: (token: string | null) => void
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!CAPTCHA_ENABLED || !container.current) return
    let cancelled = false

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: CAPTCHA_SITE_KEY,
          language: 'fr',
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))

    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  if (!CAPTCHA_ENABLED) return null
  return <div ref={container} className={className} />
}
