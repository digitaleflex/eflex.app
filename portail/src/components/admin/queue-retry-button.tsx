'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/**
 * Relance sûre du job BullMQ (admin) : utile si le job est manquant, en échec
 * côté file ou dans un état résiduel alors que le déploiement n'est pas terminé.
 */
export function QueueRetryButton({
  projectId,
  deploymentId,
  projectName,
  disabled,
}: {
  projectId: string
  deploymentId: string
  projectName: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function run() {
    setBusy(true)
    setFeedback('')
    try {
      const response = await fetch(
        `/api/admin/projects/${projectId}/deployments/${deploymentId}/queue/retry`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      )
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!response.ok) {
        setFeedback(data.error ?? 'Relance impossible.')
        return
      }
      setFeedback(data.message ?? 'Job relancé.')
      setOpen(false)
      router.refresh()
    } catch {
      setFeedback('Impossible de contacter le serveur.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled || busy}>
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Relancer le job<span className="sr-only"> de {projectName}</span>
      </Button>
      <ConfirmDialog
        open={open}
        title={`Relancer le job de ${projectName} ?`}
        description="Relance uniquement le traitement dans la file BullMQ (retry, promotion d’un job différé ou ré-enfilement). À utiliser si le job est manquant, en échec côté file, différé ou résiduel, sans écraser un déploiement déjà terminé ni déplacer un job actif."
        confirmLabel="Relancer le job"
        confirmDisabled={busy}
        onCancel={() => setOpen(false)}
        onConfirm={run}
      >
        {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}
      </ConfirmDialog>
    </>
  )
}