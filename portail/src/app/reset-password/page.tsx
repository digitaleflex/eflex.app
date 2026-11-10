'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/theme-switcher'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient, authErrorMessage } from '@/lib/auth-client'

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const errorId = 'reset-password-error'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    try {
      const { error: authError } = await authClient.resetPassword({ newPassword: password, token: token ?? undefined })
      if (authError) {
        setError(authErrorMessage(authError, 'Ce lien est invalide ou expiré. Demandez-en un nouveau.'))
      } else {
        setDone(true)
      }
    } catch {
      setError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main id="contenu" tabIndex={-1} className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-display-sm font-bold">Nouveau mot de passe</h1>
          <p className="text-muted-foreground">Choisissez un mot de passe de 8 à 72 caractères.</p>
        </div>

        <Card className="p-6 space-y-5">
          {done ? (
            <div role="status" className="space-y-4">
              <p className="text-sm text-foreground">Votre mot de passe a été mis à jour. Vous pouvez vous connecter.</p>
              <Button size="lg" className="w-full" onClick={() => router.push('/login')}>Se connecter</Button>
            </div>
          ) : !token ? (
            <div role="alert" className="space-y-4 text-sm">
              <p className="text-destructive">Ce lien est invalide ou expiré.</p>
              <Link href="/forgot-password" className="font-medium text-primary hover:underline">Demander un nouveau lien</Link>
            </div>
          ) : (
            <>
              {error && <p id={errorId} role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</p>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="new-password"
                  label="Nouveau mot de passe"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
                <Input
                  id="confirm-password"
                  label="Confirmer le mot de passe"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
                <Button type="submit" size="lg" className="w-full" loading={loading}>
                  Enregistrer le mot de passe
                </Button>
              </form>
            </>
          )}
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">Retour à la connexion</Link>
        </p>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
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
      <Suspense fallback={<div className="flex-1" />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
