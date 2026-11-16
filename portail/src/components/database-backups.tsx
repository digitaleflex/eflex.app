'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArchiveRestore, CloudUpload, History, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

type Health = 'ok' | 'running' | 'never' | 'stale' | 'failed'

interface Execution {
  id: string
  status: 'success' | 'failed' | 'running' | 'unknown'
  size: number | null
  createdAt: string
  restorable: boolean
}

type RestoreState = { importId: string; backupCreatedAt: string; state: 'running' | 'finished' | 'failed' }

interface BackupStatus {
  supported: boolean
  scheduled: boolean
  offsiteConfigured: boolean
  frequency: string
  summary: {
    health: Health
    lastSuccessAt: string | null
    lastFailureAt: string | null
    offsite: boolean
    recent: Execution[]
  } | null
  error: string | null
  canManage: boolean
}

const HEALTH: Record<Health, { label: string; dot: string }> = {
  ok: { label: 'Sauvegardes à jour', dot: 'bg-success' },
  running: { label: 'Sauvegarde en cours', dot: 'bg-warning' },
  never: { label: 'Première sauvegarde attendue', dot: 'bg-muted-foreground/50' },
  stale: { label: 'Dernière sauvegarde trop ancienne', dot: 'bg-destructive' },
  failed: { label: 'Dernière sauvegarde en échec', dot: 'bg-destructive' },
}

const EXECUTION: Record<Execution['status'], string> = {
  success: 'Réussie',
  failed: 'Échec',
  running: 'En cours',
  unknown: 'Inconnu',
}

const FREQUENCY_LABELS: Record<string, string> = {
  hourly: 'toutes les heures',
  daily: 'chaque jour',
  weekly: 'chaque semaine',
  monthly: 'chaque mois',
  yearly: 'chaque année',
}

/** « 0 2 * * * » → « chaque jour à 02:00 (UTC) » ; une expression plus complexe reste affichée telle quelle. */
export function describeFrequency(frequency: string): string {
  if (FREQUENCY_LABELS[frequency]) return FREQUENCY_LABELS[frequency]
  const daily = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(frequency.trim())
  if (daily) {
    const minute = Number(daily[1])
    const hour = Number(daily[2])
    if (minute < 60 && hour < 24) {
      return `chaque jour à ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (UTC)`
    }
  }
  return `selon la planification « ${frequency} »`
}

export function formatBytes(size: number | null): string {
  if (size === null || size < 0) return '—'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Sauvegardes d'une base PostgreSQL managée : état, historique, sauvegarde immédiate. */
export function DatabaseBackups({ projectId, databaseId }: { projectId: string; databaseId: string }) {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<Execution | null>(null)
  const [restore, setRestore] = useState<RestoreState | null>(null)

  const url = `/api/projects/${projectId}/databases/${databaseId}/backups`

  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'État des sauvegardes indisponible.' })
        return
      }
      setStatus(body as BackupStatus)
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  // Suivi de la restauration en cours, toutes les 3 s, jusqu'à son issue.
  useEffect(() => {
    if (!restore || restore.state !== 'running') return
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${url}/restores/${restore.importId}`, { cache: 'no-store' })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          setRestore({ ...restore, state: 'failed' })
          setFeedback({ tone: 'error', message: body.error ?? 'Suivi de la restauration impossible.' })
          return
        }
        if (body.state === 'finished' || body.state === 'failed') {
          setRestore({ ...restore, state: body.state })
          setFeedback(
            body.state === 'finished'
              ? { tone: 'success', message: `Base restaurée depuis la sauvegarde du ${formatDate(restore.backupCreatedAt)}. Vérifiez votre application.` }
              : { tone: 'error', message: 'La restauration a échoué. Les données n’ont peut-être pas été modifiées : contactez le support avant de réessayer.' },
          )
        } else {
          setRestore({ ...restore })
        }
      } catch {
        setRestore({ ...restore })
      }
    }, 3_000)
    return () => window.clearTimeout(timer)
  }, [restore, url])

  async function startRestore(execution: Execution) {
    setFeedback(null)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', executionId: execution.id }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => ({})) : {}
    setConfirmRestore(null)
    if (!response || !response.ok) {
      setFeedback({ tone: 'error', message: body.error ?? 'Impossible de lancer la restauration.' })
      return
    }
    setRestore({ importId: String(body.importId), backupCreatedAt: execution.createdAt, state: 'running' })
    setFeedback({ tone: 'success', message: body.message ?? 'Restauration lancée.' })
  }

  async function act(action: 'enable' | 'run') {
    setWorking(true)
    setFeedback(null)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Action impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: body.message ?? 'C’est fait.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground">Chargement des sauvegardes…</p>
  if (!status?.supported) return null

  const summary = status.summary
  const health = summary ? HEALTH[summary.health] : null
  const offsite = summary ? summary.offsite : status.offsiteConfigured

  return (
    <section aria-label="Sauvegardes" className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Sauvegardes
          </p>
          {!status.scheduled ? (
            <p className="text-xs text-muted-foreground">Aucune sauvegarde planifiée pour cette base.</p>
          ) : (
            <>
              {health && (
                <p className="flex items-center gap-2 text-xs">
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', health.dot)} />
                  <span className="font-medium">{health.label}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {summary?.lastSuccessAt
                  ? `Dernière réussie le ${formatDate(summary.lastSuccessAt)}`
                  : 'Aucune sauvegarde réussie pour l’instant'}
                {' · '}
                {describeFrequency(status.frequency)}
                {' · '}
                {offsite ? 'copie hors serveur' : 'copies sur le serveur de la base uniquement'}
              </p>
            </>
          )}
          {status.error && <p className="text-xs text-warning">État indisponible : {status.error}</p>}
        </div>
        {status.canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={working}
            onClick={() => void act(status.scheduled ? 'run' : 'enable')}
          >
            {status.scheduled ? (
              <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {status.scheduled ? 'Sauvegarder maintenant' : 'Activer les sauvegardes'}
          </Button>
        )}
      </div>

      {restore?.state === 'running' && (
        <p role="status" className="flex items-center gap-2 text-xs font-medium">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          Restauration en cours depuis la sauvegarde du {formatDate(restore.backupCreatedAt)}…
        </p>
      )}

      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={cn('text-xs', feedback.tone === 'error' ? 'text-destructive' : 'text-foreground')}
        >
          {feedback.message}
        </p>
      )}

      {summary && summary.recent.length > 0 && (
        <details className="group text-xs">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Historique ({summary.recent.length})
          </summary>
          <table className="mt-1 w-full text-left">
            <caption className="sr-only">Dernières sauvegardes de la base</caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                <th scope="col" className="py-1 pr-3 font-medium">Résultat</th>
                <th scope="col" className="py-1 pr-3 font-medium">Taille</th>
                {status.canManage && (
                  <th scope="col" className="py-1 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {summary.recent.map((execution) => (
                <tr key={execution.id} className="border-t border-border">
                  <td className="py-1 pr-3">{execution.createdAt ? formatDate(execution.createdAt) : '—'}</td>
                  <td className={cn('py-1 pr-3', execution.status === 'failed' && 'text-destructive')}>
                    {EXECUTION[execution.status]}
                  </td>
                  <td className="py-1 pr-3">{formatBytes(execution.size)}</td>
                  {status.canManage && (
                    <td className="py-1 text-right">
                      {execution.restorable && (
                        <button
                          type="button"
                          disabled={restore?.state === 'running'}
                          onClick={() => setConfirmRestore(execution)}
                          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <History className="h-3.5 w-3.5" aria-hidden="true" />
                          Restaurer
                          <span className="sr-only"> la sauvegarde du {formatDate(execution.createdAt)}</span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <ConfirmDialog
        open={confirmRestore !== null}
        title="Restaurer cette sauvegarde ?"
        description={
          confirmRestore
            ? `Les données actuelles de la base seront remplacées par celles du ${formatDate(confirmRestore.createdAt)}. Tout ce qui a été écrit depuis sera perdu. Conseil : lancez d’abord « Sauvegarder maintenant ».`
            : ''
        }
        confirmLabel="Restaurer"
        destructive
        requireText="RESTAURER"
        onConfirm={() => (confirmRestore ? startRestore(confirmRestore) : undefined)}
        onCancel={() => setConfirmRestore(null)}
      />
    </section>
  )
}
