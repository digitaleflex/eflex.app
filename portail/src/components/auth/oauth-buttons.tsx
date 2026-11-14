'use client'

import { useState } from 'react'

import { GithubMark } from '@/components/icons/github-mark'
import { Button } from '@/components/ui/button'
import { authErrorMessage, signIn } from '@/lib/auth-client'
import { oauthErrorCallbackURL } from '@/lib/auth-oauth'
import { nextFromLocation } from '@/lib/safe-next'

export type OAuthProvider = 'google' | 'github'

const PROVIDERS: Record<OAuthProvider, { label: string; unavailable: string; unreachable: string }> = {
  google: {
    label: 'Continuer avec Google',
    unavailable: 'La connexion avec Google est indisponible pour le moment.',
    unreachable: 'Impossible de contacter le fournisseur Google. Vérifiez votre connexion et réessayez.',
  },
  github: {
    label: 'Continuer avec GitHub',
    unavailable: 'La connexion avec GitHub est indisponible pour le moment.',
    unreachable: 'Impossible de contacter GitHub. Vérifiez votre connexion et réessayez.',
  },
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 9.99 1 12.48 1 15.23c0 2.74 1.02 5.24 2.81 7.07z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.31l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53" />
    </svg>
  )
}

/**
 * Bouton « Continuer avec … » relié au fournisseur OAuth réel de Better Auth. Aucun succès simulé :
 * en cas d'échec ou d'annulation, le message est remonté à la page, qui l'affiche dans sa région live.
 * `lastUsed` pose le badge « Dernière utilisée » (cookie posé par le plugin `lastLoginMethod`).
 */
export function OAuthButton({
  provider,
  primary = false,
  lastUsed = false,
  disabled,
  onError,
  callbackURL,
}: {
  provider: OAuthProvider
  /** Le premier fournisseur proposé est plein (navy) ; les autres sont en contour. */
  primary?: boolean
  lastUsed?: boolean
  disabled?: boolean
  onError: (message: string) => void
  callbackURL?: string
}) {
  const [loading, setLoading] = useState(false)
  const copy = PROVIDERS[provider]

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    const next = callbackURL ?? nextFromLocation()
    try {
      const { error } = await signIn.social({
        provider,
        callbackURL: next,
        // Le paramètre `next` est déjà validé ; le serveur le revalide aussi.
        errorCallbackURL:
          typeof window === 'undefined' ? '/login' : oauthErrorCallbackURL(window.location.pathname, next, provider),
      })
      if (error) onError(authErrorMessage(error, copy.unavailable))
    } catch {
      onError(copy.unreachable)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant={primary ? 'primary' : 'outline'}
        size="lg"
        className={
          primary
            ? 'w-full justify-center gap-3 bg-eflexnavy text-white shadow-none hover:bg-eflexnavy/90'
            : 'w-full justify-center gap-3 font-medium'
        }
        onClick={() => void handleClick()}
        loading={loading}
        disabled={disabled}
      >
        {!loading && (provider === 'google' ? <GoogleMark /> : <GithubMark className="h-5 w-5" />)}
        {copy.label}
      </Button>
      {lastUsed && (
        <span className="pointer-events-none absolute -top-2.5 right-3 rounded-full border border-primary/25 bg-background px-2 py-0.5 text-xs font-semibold text-primary">
          Dernière utilisée
        </span>
      )}
    </div>
  )
}
