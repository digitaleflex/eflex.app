'use client'

import { useEffect, useState } from 'react'

import { oauthErrorMessage } from '@/lib/auth-oauth'

export interface AuthConfig {
  emailEnabled: boolean
  emailVerificationRequired: boolean
  googleEnabled: boolean
  githubEnabled: boolean
  emailCodeEnabled: boolean
}

/**
 * Configuration réelle de l'instance, lue une fois par page. `null` tant que la
 * réponse n'est pas arrivée ; `failed` distingue une indisponibilité réseau
 * d'un simple chargement. Le bouton Google n'apparaît que lorsque le serveur
 * confirme que le fournisseur est configuré.
 */
export function useAuthConfig(): { config: AuthConfig | null; failed: boolean } {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/auth/config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('config')
        return (await response.json()) as Partial<AuthConfig>
      })
      .then((data) => {
        if (!active) return
        setConfig({
          emailEnabled: data.emailEnabled === true,
          emailVerificationRequired: data.emailVerificationRequired === true,
          googleEnabled: data.googleEnabled === true,
          githubEnabled: data.githubEnabled === true,
          emailCodeEnabled: data.emailCodeEnabled === true,
        })
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  return { config, failed }
}

/** Message à afficher si le retour OAuth contient une erreur (annulation incluse). */
export function useOAuthError(): string | null {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setMessage(oauthErrorMessage(new URLSearchParams(window.location.search)))
  }, [])

  return message
}
