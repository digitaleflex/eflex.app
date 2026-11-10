'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Play, RotateCw, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { statusInfo } from '@/lib/project-status'

type Feedback = { tone: 'success' | 'error'; text: string }

type Pending =
  | { kind: 'runtime'; action: 'stop' | 'restart' }
  | { kind: 'delete' }
  | { kind: 'cancel' }
  | null

/**
 * Opérations d'administration sur un projet (issue #28). Chaque action appelle
 * une route `api/admin/projects/**` auditée ; les actions destructrices exigent
 * un motif et, pour la suppression d'infrastructure, la saisie du nom du projet.
 */
export function AdminProjectActions({
  projectId,
  projectName,
  hasApplication,
  activeDeploymentId,
  activeDeploymentStatus,
}: {
  projectId: string
  projectName: string
  hasApplication: boolean
  activeDeploymentId: string | null
  activeDeploymentStatus: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState<Pending>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const runtimeReasonId = useId()
  const cancelReasonId = useId()
  const deleteReasonId = useId()

  const reasonTooShort = reason.trim().length < 5

  async function send(url: string, init: RequestInit, success: string): Promise<boolean> {
    setFeedback(null)
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        warning?: string
        message?: string
      }
      if (!response.ok) {
        setFeedback({ tone: 'error', text: data.error ?? 'Action impossible pour le moment.' })
        return false
      }
      setFeedback({
        tone: data.warning ? 'error' : 'success',
        text: data.warning ?? data.message ?? success,
      })
      setPending(null)
      setReason('')
      router.refresh()
      return true
    } catch {
      setFeedback({ tone: 'error', text: 'Impossible de contacter le serveur.' })
      return false
    }
  }

  async function runtime(action: 'start' | 'stop' | 'restart') {
    setBusy(`runtime-${action}`)
    await send(
      `/api/admin/projects/${projectId}/runtime`,
      { method: 'POST', body: JSON.stringify({ action, ...(reason.trim() ? { reason: reason.trim() } : {}) }) },
      action === 'start' ? 'Application démarrée.' : action === 'stop' ? 'Application arrêtée.' : 'Application redémarrée.',
    )
    setBusy(null)
  }

  async function redeploy() {
    setBusy('redeploy')
    await send(
      `/api/admin/projects/${projectId}/redeploy`,
      { method: 'POST', body: JSON.stringify({}) },
      'Déploiement relancé : suivez-le dans la file des déploiements.',
    )
    setBusy(null)
  }

  const reasonField = (id: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Motif (enregistré dans le journal d’audit)
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        maxLength={300}
        required
        className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="text-xs text-muted-foreground">5 caractères minimum.</p>
    </div>
  )

  const errorInDialog = feedback?.tone === 'error' && pending !== null ? (
    <p role="alert" className="text-sm text-destructive">
      {feedback.text}
    </p>
  ) : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={busy === 'redeploy'}
          onClick={() => void redeploy()}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Redéployer
        </Button>
        {hasApplication && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={busy === 'runtime-start'}
              onClick={() => void runtime('start')}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Démarrer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReason('')
                setFeedback(null)
                setPending({ kind: 'runtime', action: 'stop' })
              }}
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              Arrêter
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReason('')
                setFeedback(null)
                setPending({ kind: 'runtime', action: 'restart' })
              }}
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Redémarrer
            </Button>
          </>
        )}
        {activeDeploymentId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setReason('')
              setFeedback(null)
              setPending({ kind: 'cancel' })
            }}
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            Annuler le déploiement
            {activeDeploymentStatus && <span className="sr-only"> ({statusInfo(activeDeploymentStatus).label})</span>}
          </Button>
        )}
        {hasApplication && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setReason('')
              setFeedback(null)
              setPending({ kind: 'delete' })
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Supprimer l’application
          </Button>
        )}
      </div>

      {feedback && (
        <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={feedback.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>
          {feedback.text}
        </p>
      )}

      <ConfirmDialog
        open={pending?.kind === 'runtime'}
        destructive
        title={pending?.kind === 'runtime' && pending.action === 'stop' ? `Arrêter l’application de ${projectName} ?` : `Redémarrer l’application de ${projectName} ?`}
        description={
          pending?.kind === 'runtime' && pending.action === 'stop'
            ? 'Le site sera indisponible immédiatement. Le projet, ses domaines et son historique sont conservés : vous pourrez le redémarrer depuis cet écran.'
            : 'Le conteneur va redémarrer : une courte coupure est possible pendant la mise en route.'
        }
        confirmLabel={pending?.kind === 'runtime' && pending.action === 'stop' ? 'Arrêter l’application' : 'Redémarrer'}
        confirmDisabled={reasonTooShort}
        onCancel={() => setPending(null)}
        onConfirm={() => (pending?.kind === 'runtime' ? runtime(pending.action) : undefined)}
      >
        {reasonField(runtimeReasonId)}
        {errorInDialog}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === 'cancel'}
        destructive
        title="Annuler le déploiement en cours ?"
        description="Le job en file est retiré et l’hébergement est invité à interrompre la construction. La version actuellement en ligne reste disponible."
        confirmLabel="Annuler le déploiement"
        cancelLabel="Continuer le déploiement"
        confirmDisabled={reasonTooShort}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          if (!activeDeploymentId) return
          await send(
            `/api/admin/projects/${projectId}/deployments/${activeDeploymentId}/cancel`,
            { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) },
            'Déploiement annulé.',
          )
        }}
      >
        {reasonField(cancelReasonId)}
        {errorInDialog}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === 'delete'}
        destructive
        title="Supprimer l’application sur l’infrastructure ?"
        description="L’application Coolify et ses conteneurs sont supprimés. Le projet, ses variables et son historique restent en base ; la référence d’application est effacée. Cette action est irréversible côté hébergement."
        confirmLabel="Supprimer l’application"
        requireText={projectName}
        confirmDisabled={reasonTooShort}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          await send(
            `/api/admin/projects/${projectId}/infrastructure`,
            { method: 'DELETE', body: JSON.stringify({ confirmName: projectName, reason: reason.trim() }) },
            'Application supprimée de l’infrastructure.',
          )
        }}
      >
        {reasonField(deleteReasonId)}
        {errorInDialog}
      </ConfirmDialog>
    </div>
  )
}
