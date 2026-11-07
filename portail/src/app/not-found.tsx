import Link from 'next/link'
import Image from 'next/image'

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-7 bg-background px-4 text-center">
      <Image src="/logo-horizontal.webp" alt="Eflex" width={1200} height={312} className="h-8 w-auto" priority />

      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Erreur 404</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Cette page n&apos;existe pas</h1>
        <p className="max-w-md text-muted-foreground">
          Le lien est peut-être obsolète ou l&apos;adresse comporte une erreur. Pas d&apos;inquiétude, vos projets sont toujours là.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Retour à l&apos;accueil
        </Link>
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
