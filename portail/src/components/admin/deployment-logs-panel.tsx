'use client'

import { useState } from 'react'
import { Eye, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LogRange {
  first: string
  last: string
  durationMs: number
}

const clock = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })

function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${String(seconds).padStart(2, '0')} s`
}

/**
 * Journaux d'un déploiement côté administration (issue #28).
 * Le chargement des journaux d'hébergement est explicite : chaque lecture écrit
 * une entrée d'audit. Les secrets connus sont masqués côté serveur.
 */
export function AdminDeploymentLogs({
  projectId,
  deploymentId,
  storedSummary,
  hasBuild,
}: {
  projectId: string
  deploymentId: string
  storedSummary: string
  hasBuild: boolean
}) {
  const [live, setLive] = useState<{ logs: string; source: string } | null>(null)
  const [range, setRange] = useState<LogRange | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/admin/projects/${projectId}/deployments/${deploymentId}/logs`,
        { cache: 'no-store' },
      )
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        logs?: string
        source?: string
        truncated?: boolean
        warning?: string | null
        range?: LogRange | null
      }
      if (!response.ok) {
        setError(data.error ?? 'Journaux indisponibles.')
        return
      }
      setLive({ logs: data.logs ?? '', source: data.source ?? 'stored' })
      setRange(data.range ?? null)
      const notices = [data.warning, data.truncated ? 'Journal tronqué aux derniers 20 000 caractères.' : null]
        .filter((notice): notice is string => Boolean(notice))
      setWarning(notices.length > 0 ? notices.join(' ') : null)
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-labelledby="admin-deployment-logs" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-deployment-logs" className="flex items-center gap-2 font-semibold">
            <TerminalSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            Journaux
          </h2>
          <p className="text-sm text-muted-foreground">
            Les valeurs des variables du projet sont masquées. Chaque lecture des journaux d’hébergement est
            enregistrée dans le journal d’audit.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={loading}
          disabled={!hasBuild}
          onClick={() => void load()}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Afficher les journaux d’hébergement
        </Button>
      </div>

      {!hasBuild && (
        <p className="text-sm text-muted-foreground">
          Ce déploiement n’a pas encore d’identifiant de build : seul l’extrait enregistré est disponible.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {warning && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          {warning}
        </p>
      )}
      {range && (
        <p className="text-xs text-muted-foreground tabular-nums">
          Durée d’après les horodatages du journal : {duration(range.durationMs)} (du{' '}
          {clock.format(new Date(range.first))} au {clock.format(new Date(range.last))}).
        </p>
      )}

      {live ? (
        <pre
          aria-label="Journaux du déploiement"
          className="max-h-[32rem] min-h-48 overflow-auto rounded-xl border border-border bg-eflexnavy p-4 font-mono text-xs leading-relaxed text-white/90"
        >
          {live.logs || 'Aucune ligne de journal disponible.'}
        </pre>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Extrait enregistré en base</p>
          <pre
            aria-label="Extrait de journal enregistré"
            className="max-h-80 min-h-24 overflow-auto rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed"
          >
            {storedSummary || 'Aucun extrait enregistré pour ce déploiement.'}
          </pre>
        </div>
      )}
    </section>
  )
}
