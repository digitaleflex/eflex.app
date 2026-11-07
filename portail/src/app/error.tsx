'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[eflex] Erreur applicative', error)
  }, [error])

  return (
    <main id="contenu" className="min-h-screen flex flex-col items-center justify-center gap-7 bg-background px-4 text-center">
      <div className="space-y-3">
        <h1 className="text-display-sm font-bold">Une erreur est survenue</h1>
        <p className="max-w-md text-muted-foreground">
          Nous n&apos;avons pas pu afficher cette page. Réessayez : si le problème persiste, consultez le statut des services.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">Référence : {error.digest}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Réessayer
        </button>
        <Link
          href="/status"
          className="inline-flex h-11 items-center rounded-lg border border-input bg-background px-5 text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Statut des services
        </Link>
      </div>
    </main>
  )
}
