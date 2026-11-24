'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArchiveRestore, CloudUpload, History, Info, ShieldAlert, ShieldCheck } from 'lucide-react'
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
  offsiteCopied: boolean | null
}

type RestoreState = { importId: string; backupCreatedAt: string; state: 'running' | 'finished' | 'failed' }

interface RestoreProof {
  status: 'running' | 'finished' | 'failed' | null
  executionId: string | null
  backupCreatedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  lastSuccessfulAt: string | null
  lastSuccessfulBackupCreatedAt: string | null
}

interface BackupStatus {
  supported: boolean
  kind: string
  engineLabel?: string
  scheduled: boolean
  offsiteConfigured: boolean
  scheduleOffsite: boolean | null
  frequency: string
  summary: {
    health: Health
    lastSuccessAt: string | null
    lastFailureAt: string | null
    recent: Execution[]
  } | null
  restore: RestoreProof | null
  unsupportedReason?: string | null
  notes?: string[]
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

function offsiteLabel(status: BackupStatus): { text: string; tone: 'muted' | 'warning' } {
  if (status.scheduleOffsite) return { text: 'copie hors serveur planifiée (S3)', tone: 'muted' }
  if (status.offsiteConfigured && status.scheduled) {
    return {
      text: 'copies sur le serveur de la base uniquement (S3 configuré, à activer/vérifier sur la planification)',
      tone: 'warning',
    }
  }
  if (status.offsiteConfigured) {
    return { text: 'copie hors serveur possible (S3 configuré)', tone: 'muted' }
  }
  return { text: 'copies sur le serveur de la base uniquement (pas de copie hors site)', tone: 'warning' }
}

function restoreProofText(restore: RestoreProof | null): string | null {
  if (!restore) return null
  if (restore.status === 'running' && restore.backupCreatedAt) {
    return `Restauration en cours (sauvegarde du ${formatDate(restore.backupCreatedAt)})`
  }
  if (restore.status === 'failed' && restore.finishedAt) {
    return `Dernière restauration consignée : échec le ${formatDate(restore.finishedAt)}`
  }
  if (restore.lastSuccessfulAt) {
    const from = restore.lastSuccessfulBackupCreatedAt
      ? `, depuis la sauvegarde du ${formatDate(restore.lastSuccessfulBackupCreatedAt)}`
      : ''
    return `Dernière restauration réussie consignée le ${formatDate(restore.lastSuccessfulAt)}${from}`
  }
  if (restore.status === 'finished' && restore.finishedAt) {
    return `Dernière restauration consignée le ${formatDate(restore.finishedAt)}`
  }
  return null
}

function executionOffsiteText(execution: Execution, scheduleOffsite: boolean | null): string {
  if (execution.status !== 'success') return '—'
  if (execution.offsiteCopied === true) return 'Copie hors serveur (S3)'
  if (scheduleOffsite) return 'Hors serveur non confirmé'
  return 'Serveur uniquement'
}

function UnsupportedBackupPolicy({ status }: { status: BackupStatus }) {
  const label = status.engineLabel ?? status.kind
  return (
    <section aria-label="Sauvegardes" className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
        Sauvegardes et restauration
      </p>
      <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs space-y-2">
        <p className="font-medium text-foreground">
          Aucun parcours de sauvegarde/restauration intégré EFLEX pour {label}.
        </p>
        {status.unsupportedReason && <p>{status.unsupportedReason}</p>}
        {status.notes && status.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-4">
            {status.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground">
          Aucune sauvegarde automatique ni restauration assistée n’est garantie pour cette ressource. Si des
          données durables sont stockées, mettez en place une stratégie adaptée au moteur (outils natifs,
          export/volume, réplication) et testez régulièrement la restauration dans un environnement isolé.
        </p>
      </div>
    </section>
  )
}

/**
 * Sauvegardes/restauration d'une base managée : état, historique, actions et preuves.
 * Dégradation explicite pour les moteurs sans parcours intégré (ex. Redis/cache).
 */
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

  useEffect(() => {
    if (!status?.restore || status.restore.status !== 'running' || restore) return
    if (!status.restore.backupCreatedAt) return
  }, [status, restore])

  useEffect(() => {
    if (!restore || restore.state !== 'running') return
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${url}/restores/${restore.importId}`, { cache: 'no-store' })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          setRestore({ ...restore, state: 'failed' })
          setFeedback({ tone: 'error', message: body.error ?? 'Suivi de la restauration impossible.' })
          void load()
          return
        }
        if (body.state === 'finished' || body.state === 'failed') {
          setRestore({ ...restore, state: body.state })
          setFeedback(
            body.state === 'finished'
              ? {
                  tone: 'success',
                  message: `Base restaurée depuis la sauvegarde du ${formatDate(restore.backupCreatedAt)}. Vérifiez votre application.`,
                }
              : {
                  tone: 'error',
                  message:
                    'La restauration a échoué. Les données n’ont peut-être pas été modifiées : contactez le support avant de réessayer.',
                },
          )
          void load()
        } else {
          setRestore({ ...restore })
        }
      } catch {
        setRestore({ ...restore })
      }
    }, 3_000)
    return () => window.clearTimeout(timer)
  }, [restore, url, load])

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
    void load()
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
  if (!status) return null
  if (!status.supported) return <UnsupportedBackupPolicy status={status} />

  const summary = status.summary
  const health = summary ? HEALTH[summary.health] : null
  const offsite = offsiteLabel(status)
  const proof = restoreProofText(status.restore)
  const restoreRunning = restore?.state === 'running' || status.restore?.status === 'running'

  return (
    <section aria-label="Sauvegardes" className="mt-3 space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Sauvegardes et restauration
          </p>
          {!status.scheduled ? (
            <p className="text-xs text-muted-foreground">
              Aucune sauvegarde planifiée pour cette base {status.engineLabel ? `(${status.engineLabel})` : ''}.
            </p>
          ) : (
            health && (
              <p className="flex items-center gap-2 text-xs">
                <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', health.dot)} />
                <span className="font-medium">{health.label}</span>
                <span className="text-muted-foreground">· {describeFrequency(status.frequency)}</span>
              </p>
            )
          )}
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

      {status.scheduled && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sauvegarde réussie</p>
            <p className="mt-1 text-xs font-medium">
              {summary?.lastSuccessAt ? formatDate(summary.lastSuccessAt) : 'Aucune réussite'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {summary?.lastFailureAt ? `Dernier échec : ${formatDate(summary.lastFailureAt)}` : 'Aucun échec récent'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Copie hors serveur</p>
            <p className={cn('mt-1 text-xs font-medium', offsite.tone === 'warning' && 'text-warning')}>
              {status.scheduleOffsite ? 'Planifiée (S3)' : status.offsiteConfigured ? 'S3 configuré, à vérifier' : 'Non configurée'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{offsite.text}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Restauration consignée</p>
            <p className="mt-1 text-xs font-medium">
              {status.restore?.lastSuccessfulAt
                ? formatDate(status.restore.lastSuccessfulAt)
                : status.restore?.status === 'failed'
                  ? 'Échec consigné'
                  : 'Aucune preuve'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {proof ?? 'Un test régulier en environnement isolé reste recommandé.'}
            </p>
          </div>
        </div>
      )}

      {status.error && <p className="text-xs text-warning">État indisponible : {status.error}</p>}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          « Sauvegarde réussie » = exécution aboutie. « Copie hors serveur » = copie S3 effective/configurée selon
          l’instance. « Restauration consignée » = preuve enregistrée ; elle ne remplace pas un test régulier en
          environnement isolé.
        </span>
      </p>

      {restoreRunning && restore?.backupCreatedAt && (
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
                <th scope="col" className="py-1 pr-3 font-medium">Sauvegarde</th>
                <th scope="col" className="py-1 pr-3 font-medium">Copie</th>
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
                  <td className={cn('py-1 pr-3', execution.offsiteCopied === true ? 'text-foreground' : 'text-muted-foreground')}>
                    {executionOffsiteText(execution, status.scheduleOffsite)}
                  </td>
                  <td className="py-1 pr-3">{formatBytes(execution.size)}</td>
                  {status.canManage && (
                    <td className="py-1 text-right">
                      {execution.restorable && (
                        <button
                          type="button"
                          disabled={restoreRunning}
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
            ? `Les données actuelles de la base seront remplacées par celles du ${formatDate(confirmRestore.createdAt)}. Tout ce qui a été écrit depuis sera perdu. Conseil : lancez d’abord « Sauvegarder maintenant ». Une restauration réussie sera consignée comme preuve, mais ne remplace pas un test régulier en environnement isolé.`
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
