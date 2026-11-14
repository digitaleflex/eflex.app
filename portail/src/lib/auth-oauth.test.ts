import { describe, expect, it } from 'vitest'

import { oauthErrorCallbackURL, oauthErrorMessage, sanitizeOAuthRedirect } from '@/lib/auth-oauth'

describe('oauthErrorMessage', () => {
  it('ignore un retour qui n’est pas marqué comme erreur OAuth', () => {
    expect(oauthErrorMessage(new URLSearchParams('error=access_denied'))).toBeNull()
    expect(oauthErrorMessage(new URLSearchParams(''))).toBeNull()
  })

  it('affiche un message dédié à l’annulation', () => {
    expect(oauthErrorMessage(new URLSearchParams('oauth=error&error=access_denied'))).toBe(
      'Connexion avec Google annulée.',
    )
  })

  it('reste générique pour les autres erreurs et n’expose pas error_description', () => {
    const message = oauthErrorMessage(
      new URLSearchParams('oauth=error&error=server_error&error_description=secret-interne'),
    )
    expect(message).toMatch(/échoué/)
    expect(message).not.toContain('secret-interne')
  })

  it('nomme GitHub quand le retour vient de GitHub', () => {
    expect(oauthErrorMessage(new URLSearchParams('oauth=error&error=access_denied&provider=github'))).toBe(
      'Connexion avec GitHub annulée.',
    )
  })

  it('gère l’indisponibilité de la création de compte', () => {
    expect(oauthErrorMessage(new URLSearchParams('oauth=error&error=signup_disabled'))).toMatch(/désactivée/)
  })
})

describe('oauthErrorCallbackURL', () => {
  it('garde la destination validée et le fournisseur concerné', () => {
    expect(oauthErrorCallbackURL('/login', '/dashboard', 'github')).toBe(
      '/login?oauth=error&next=%2Fdashboard&provider=github',
    )
    expect(oauthErrorCallbackURL('/login', '/dashboard')).toBe('/login?oauth=error&next=%2Fdashboard')
  })
})

describe('sanitizeOAuthRedirect', () => {
  it('conserve un chemin interne avec ses paramètres', () => {
    expect(sanitizeOAuthRedirect('/dashboard/projects/1?tab=logs')).toBe('/dashboard/projects/1?tab=logs')
  })

  it('refuse une redirection externe, protocol-relative ou avec antislash', () => {
    expect(sanitizeOAuthRedirect('https://exemple.test/piege')).toBe('/dashboard')
    expect(sanitizeOAuthRedirect('//exemple.test/piege')).toBe('/dashboard')
    expect(sanitizeOAuthRedirect('/\\exemple.test/piege')).toBe('/dashboard')
    expect(sanitizeOAuthRedirect('javascript:alert(1)')).toBe('/dashboard')
  })

  it('applique le repli demandé et ignore les valeurs non textuelles', () => {
    expect(sanitizeOAuthRedirect('https://exemple.test', '/login')).toBe('/login')
    expect(sanitizeOAuthRedirect(undefined)).toBeNull()
    expect(sanitizeOAuthRedirect(42)).toBeNull()
  })
})

describe('oauthErrorCallbackURL', () => {
  it('revient sur la page courante et conserve next', () => {
    const url = oauthErrorCallbackURL('/login', '/dashboard/projects/1?tab=logs')
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    expect(url.startsWith('/login?')).toBe(true)
    expect(params.get('oauth')).toBe('error')
    expect(params.get('next')).toBe('/dashboard/projects/1?tab=logs')
  })
})
