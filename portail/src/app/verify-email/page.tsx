'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient, authErrorMessage } from '@/lib/auth-client'

function VerifyEmailForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const { error: authError } = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: '/dashboard',
      })
      if (authError) setError(authErrorMessage(authError, "Impossible de renvoyer l'e-mail. Réessayez dans un instant."))
      else setMessage('Un nouvel e-mail de vérification a été envoyé. Pensez à vérifier vos courriers indésirables.')
    } catch {
      setError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main id="contenu" className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-display-sm font-bold">Vérifiez votre adresse e-mail</h1>
          <p className="text-muted-foreground">
            Un lien de vérification vous a été envoyé. Cliquez dessus pour activer votre compte, puis connectez-vous.
          </p>
        </div>

        <Card className="p-6 space-y-5">
          {message && <p role="status" className="rounded-lg bg-success/10 border border-success/20 p-3 text-sm text-foreground">{message}</p>}
          {error && <p role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</p>}

          <form onSubmit={handleResend} className="space-y-4">
            <Input
              id="verify-email"
              label="Adresse e-mail"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Renvoyer l&apos;e-mail
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Déjà vérifié ?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">Se connecter</Link>
        </p>
      </div>
    </main>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass">
        <nav className="container flex h-16 items-center">
          <Link href="/" className="flex items-center">
            <Image src="/logo-horizontal.webp" alt="Eflex — accueil" width={1200} height={312} className="h-8 w-auto" priority />
          </Link>
        </nav>
      </header>
      <Suspense fallback={<div className="flex-1" />}>
        <VerifyEmailForm />
      </Suspense>
    </div>
  )
}
