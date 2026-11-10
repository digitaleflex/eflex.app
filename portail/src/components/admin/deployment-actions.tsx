'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type Feedback = { tone: 'success' | 'error'; text: string }

/**
 * Actions d'administration sur un déploiement (issue #28) : déblocage (passage
 * en échec avec le motif imposé « interrompu par un administrateur ») et
 * annulation propre. Les deux actions sont auditées.
 */
export function AdminDeploymentActions({
  projectId,
  deploymentId,
  active,
}: {
  projectId: string
  deploymentId: string
  active: boolean
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<'unblock' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const reasonId = useId()
  const commentId = useId()

  if (!active) return null

  async function run(url: string, body: unknown, success: string) {
    setBusy(true)
    setFeedback(null)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string; warning?: string }
      if (!response.ok) {
        setFeedback({ tone: 'error', text: data.error ?? 'Action impossible pour le moment.' })
        return
      }
      setFeedback({ tone: data.warning ? 'error' : 'success', text: data.warning ?? success })
      setDialog(null)
      setReason('')
      setComment('')
      router.refresh()
    } catch {
      setFeedback({ tone: 'error', text: 'Impossible de contacter le serveur.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            setFeedback(null)
            setDialog('unblock')
          }}
        >
          <Unplug className="h-4 w-4" aria-hidden="true" />
          Débloquer
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setReason('')
            setFeedback(null)
            setDialog('cancel')
          }}
        >
          <Ban className="h-4 w-4" aria-hidden="true" />
          Annuler proprement
        </Button>
      </div>

      {feedback && (
        <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={feedback.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>
          {feedback.text}
        </p>
      )}

      <ConfirmDialog
        open={dialog === 'unblock'}
        destructive
        title="Débloquer ce déploiement ?"
        description="Le job en attente est retiré et l’hébergement est invité à interrompre le build. Le déploiement passe en échec avec le motif « Déploiement interrompu par un administrateur. » : la file est libérée et le projet peut être relancé."
        confirmLabel="Débloquer le déploiement"
        onCancel={() => setDialog(null)}
        confirmDisabled={busy}
        onConfirm={async () => {
          await run(
            `/api/admin/projects/${projectId}/deployments/${deploymentId}/unblock`,
            { comment: comment.trim() || undefined },
            'Déploiement débloqué : il est passé en échec.',
          )
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor={commentId} className="text-sm font-medium">
            Commentaire interne (facultatif)
          </label>
          <textarea
            id={commentId}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            maxLength={300}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {feedback?.tone === 'error' && <p role="alert" className="text-sm text-destructive">{feedback.text}</p>}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'cancel'}
        destructive
        title="Annuler ce déploiement ?"
        description="Le job en file est retiré et l’hébergement est invité à interrompre la construction. Le déploiement passe en « Annulé » ; la version en ligne reste disponible."
        confirmLabel="Annuler le déploiement"
        cancelLabel="Continuer le déploiement"
        confirmDisabled={busy || reason.trim().length < 5}
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          await run(
            `/api/admin/projects/${projectId}/deployments/${deploymentId}/cancel`,
            { reason: reason.trim() },
            'Déploiement annulé.',
          )
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">
            Motif (enregistré dans le journal d’audit)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={300}
            required
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {feedback?.tone === 'error' && <p role="alert" className="text-sm text-destructive">{feedback.text}</p>}
      </ConfirmDialog>
    </div>
  )
}
