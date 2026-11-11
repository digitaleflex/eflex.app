'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { SystemLink, SystemScreen, systemActionClass } from '@/components/system-screen'

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
    <SystemScreen
      icon={AlertTriangle}
      tone="destructive"
      title="Cette page n’a pas pu s’afficher"
      description={
        <>
          <p>
            Une erreur inattendue a interrompu le chargement de cette page. « Réessayer » relance le
            chargement de la section en erreur.
          </p>
          <p>
            Si vous veniez de lancer une action (déploiement, suppression, modification), vérifiez son
            résultat avant de la relancer.
          </p>
        </>
      }
      reference={error.digest ?? null}
      footer={
        <p>
          Si l’erreur se répète,{' '}
          <Link href="/status" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">
            consultez le statut des services
          </Link>
          .
        </p>
      }
    >
      <button type="button" onClick={reset} className={systemActionClass('primary')}>
        Réessayer
      </button>
      <SystemLink href="/dashboard">Retour à la console</SystemLink>
    </SystemScreen>
  )
}
