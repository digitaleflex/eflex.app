'use client'

import { cn } from '@/lib/utils'
import { runtimeDatabaseApiLabel, type RuntimeView } from '@/lib/services-hub'

function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        tone === 'ok' && 'bg-success',
        tone === 'warn' && 'bg-warning',
        tone === 'bad' && 'bg-destructive',
      )}
    />
  )
}

const formatDateTime = (ts: number) =>
  new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Contexte des capacités réelles de l’instance (Coolify) pour interpréter le catalogue. */
export function InstanceCapabilitiesPanel({ runtime }: { runtime: RuntimeView | null }) {
  if (!runtime) return null
  const api = runtimeDatabaseApiLabel(runtime)
  const checkedAt = typeof runtime.checkedAt === 'number' ? runtime.checkedAt : null

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Capacités de l’instance</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Disponibilité détectée sur l’hébergement (Coolify) : elle détermine ce qui est créable et supporté ici.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-2">
            <Dot tone={runtime.reachable ? 'ok' : 'bad'} />
            Instance {runtime.reachable ? 'joignable' : 'injoignable'}
          </span>
          <span className="inline-flex items-center gap-2">
            <Dot tone={api.tone} />
            API bases managées : {api.label}
          </span>
        </div>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono tabular-nums text-foreground">{runtime.version ?? 'inconnue'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Dernière vérification</dt>
          <dd className="tabular-nums text-foreground">{checkedAt ? formatDateTime(checkedAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fiabilité</dt>
          <dd className="text-foreground">
            {!runtime.reachable
              ? 'Limitée (instance injoignable)'
              : runtime.databaseApiAvailable === false
                ? 'Limitée (API bases indisponible)'
                : runtime.databaseApiAvailable == null
                  ? 'Partielle (API non confirmée)'
                  : 'Détectée sur l’instance'}
          </dd>
        </div>
      </dl>

      {!runtime.reachable && (
        <p role="status" className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
          L’instance d’hébergement ne répond pas. Les statuts affichés et la création de ressources peuvent être
          temporairement indisponibles ou échouer.
        </p>
      )}
      {runtime.reachable && runtime.databaseApiAvailable === false && (
        <p role="status" className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
          L’API des bases managées n’est pas disponible sur cette instance : le provisionnement de nouvelles bases est
          indisponible.
        </p>
      )}
      {runtime.reachable && runtime.databaseApiAvailable == null && (
        <p role="status" className="rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
          La disponibilité de l’API des bases managées n’a pas pu être confirmée. Les capacités affichées peuvent évoluer
          après vérification.
        </p>
      )}
    </div>
  )
}
