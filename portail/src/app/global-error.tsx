'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#f7f7f9] px-4 text-center font-sans text-[#0a0a0a]">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">Une erreur est survenue</h1>
          <p className="text-sm text-[#6b6b6b]">
            Eflex n&apos;a pas pu charger cette page. Réessayez dans quelques instants.
          </p>
          {error.digest && <p className="font-mono text-xs text-[#6b6b6b]">Référence : {error.digest}</p>}
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-lg bg-[#2563EB] px-5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
        >
          Réessayer
        </button>
      </body>
    </html>
  )
}
