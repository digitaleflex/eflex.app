'use client'

import { nextFromLocation, withNext } from '@/lib/safe-next'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/theme-switcher'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { CAPTCHA_ENABLED, Turnstile, captchaHeaders } from '@/components/auth/turnstile'
import { authErrorMessage, signIn, signUp } from '@/lib/auth-client'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // Masqué par défaut : le bouton Google n'apparaît que si l'instance a des
  // identifiants OAuth, sinon Better Auth renvoie PROVIDER_NOT_FOUND.
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const errorId = 'register-error'

  useEffect(() => {
    let active = true
    fetch('/api/auth/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((config: { googleEnabled?: boolean }) => {
        if (active) setGoogleEnabled(config.googleEnabled === true)
      })
      .catch(() => {
        // Endpoint indisponible : on garde le bouton plutôt que de retirer
        // silencieusement une méthode de connexion qui pourrait fonctionner.
        if (active) setGoogleEnabled(true)
      })
    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (CAPTCHA_ENABLED && !captchaToken) {
        setError('Complétez la vérification anti-robot avant de continuer.')
        return
      }
      // Le compte est créé puis la session ouverte dans la foulée.
      const { error: authError } = await signUp.email(
        { name: name.trim(), email: email.trim(), password },
        captchaHeaders(captchaToken),
      )
      if (authError) {
        setError(authErrorMessage(authError, 'Impossible de créer le compte. Réessayez dans un instant.'))
        return
      }
      // Si la vérification d'e-mail est active, aucun session n'est créée à
      // l'inscription : on dirige vers la page qui explique quoi faire.
      try {
        const config = await fetch('/api/auth/config', { cache: 'no-store' }).then((r) => r.json())
        if (config.emailVerificationRequired) {
          router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`)
          return
        }
      } catch {
        // En cas d'indisponibilité de ce petit endpoint, on garde le parcours
        // historique plutôt que de bloquer l'inscription.
      }
      router.push(nextFromLocation())
      router.refresh()
    } catch {
      setError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass">
        <nav className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/logo-horizontal.webp" alt="Eflex — accueil" width={1200} height={312} className="h-8 w-auto" priority />
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main id="contenu" tabIndex={-1} className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Créer un compte</h1>
            <p className="text-muted-foreground">Déployez votre premier projet en quelques minutes.</p>
          </div>

          <Card className="p-6 space-y-6">
            {googleEnabled && (
              <>
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-center gap-3 font-normal"
              onClick={async () => {
                setError('')
                const { error: authError } = await signIn.social({ provider: 'google', callbackURL: nextFromLocation() })
                if (authError) setError(authErrorMessage(authError, 'La connexion avec Google est indisponible pour le moment.'))
              }}
              disabled={loading}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 9.99 1 12.48 1 15.23c0 2.74 1.02 5.24 2.81 7.07z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.31l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53" />
              </svg>
              Continuer avec Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>
              </>
            )}

            {error && (
              <div id={errorId} role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input id="name" label="Nom" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} required />
              <Input id="email" label="Adresse e-mail" type="email" placeholder="vous@exemple.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} required />
              <Input
                id="password"
                label="Mot de passe"
                type="password"
                autoComplete="new-password"
                hint="Entre 8 et 72 caractères."
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {CAPTCHA_ENABLED && <Turnstile onToken={setCaptchaToken} />}
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Créer mon compte
              </Button>
            </form>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte ?{' '}
            <Link suppressHydrationWarning href={withNext('/login')} className="font-medium text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
