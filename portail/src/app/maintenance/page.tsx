import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Maintenance en cours — Eflex',
  description: 'La plateforme Eflex est momentanément en maintenance.',
}

export default function MaintenancePage() {
  const message = process.env.MAINTENANCE_MESSAGE

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-background px-4 text-center">
      <Image src="/logo-horizontal.webp" alt="Eflex" width={1200} height={312} className="h-8 w-auto" priority />

      <div className="max-w-lg space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600" aria-hidden>
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
          </svg>
        </div>
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Maintenance</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Nous revenons très vite</h1>
        <p className="text-muted-foreground">
          {message ||
            'Une opération de maintenance est en cours sur la plateforme Eflex. Les services seront de retour dès que possible.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/status"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Voir le statut des services
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-lg border border-input bg-background px-5 text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Réessayer
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Cette page est servie avec le code HTTP 503 pendant la maintenance.
      </p>
    </main>
  )
}
