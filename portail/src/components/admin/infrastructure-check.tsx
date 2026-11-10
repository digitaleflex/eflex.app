'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HEALTH_LABELS, formatLatency } from '@/lib/infrastructure-health'
import type { InfrastructureSummary } from '@/app/admin/infrastructure/collect'

const resultTime = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium' })

/**
 * Relance les contrôles côté serveur. La page est rafraîchie ensuite : le
 * résumé donne un retour immédiat même si un rafraîchissement échoue.
 */
export function InfrastructureCheckButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<InfrastructureSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/infrastructure/check', { method: 'POST' })
      const body = (await response.json().catch(() => ({}))) as { summary?: InfrastructureSummary; error?: string }
      if (!response.ok || !body.summary) {
        setError(body.error ?? 'Le contrôle a échoué.')
        return
      }
      setSummary(body.summary)
      router.refresh()
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" loading={loading} onClick={() => void check()}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Relancer les vérifications
      </Button>

      <div aria-live="polite" className="text-xs">
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {summary && !error && (
          <div className="max-w-md space-y-1 text-muted-foreground">
            <p>
              Contrôle terminé à {resultTime.format(new Date(summary.collectedAt))} en{' '}
              {formatLatency(summary.durationMs)} — état{' '}
              <span className="font-medium text-foreground">{HEALTH_LABELS[summary.overall].toLowerCase()}</span>.
            </p>
            <p className="tabular-nums">
              {summary.counts.servers} serveur{summary.counts.servers > 1 ? 's' : ''} ·{' '}
              {summary.counts.applications} application{summary.counts.applications > 1 ? 's' : ''} ·{' '}
              {summary.counts.queueWaiting} en file · {summary.counts.certificatesExpiring} certificat
              {summary.counts.certificatesExpiring > 1 ? 's' : ''} à renouveler
            </p>
            {summary.sources.some((source) => source.level === 'danger' || source.level === 'warning') && (
              <ul className="space-y-0.5">
                {summary.sources
                  .filter((source) => source.level === 'danger' || source.level === 'warning')
                  .map((source) => (
                    <li key={source.key}>
                      <span className="font-medium text-foreground">{source.label}</span> : {HEALTH_LABELS[source.level].toLowerCase()}
                      {source.detail ? ` — ${source.detail}` : ''}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
