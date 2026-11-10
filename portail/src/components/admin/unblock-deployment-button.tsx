'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/**
 * Bouton « Débloquer » de la file des déploiements (issue #28). Une seule
 * confirmation : le motif est imposé (« interrompu par un administrateur »)
 * et l'action est auditée côté serveur.
 */
export function UnblockDeploymentButton({
  projectId,
  deploymentId,
  projectName,
}: {
  projectId: string
  deploymentId: string
  projectName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function unblock() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/admin/projects/${projectId}/deployments/${deploymentId}/unblock`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      )
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Déblocage impossible.')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Unplug className="h-4 w-4" aria-hidden="true" />
        Débloquer<span className="sr-only"> le déploiement de {projectName}</span>
      </Button>
      {error && !open && (
        <p role="alert" className="max-w-64 text-xs text-destructive sm:text-right">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        destructive
        title={`Débloquer le déploiement de ${projectName} ?`}
        description="Le job en attente est retiré et l’hébergement est invité à interrompre le build. Le déploiement passe en échec avec le motif « Déploiement interrompu par un administrateur. »."
        confirmLabel="Débloquer"
        confirmDisabled={busy}
        onCancel={() => setOpen(false)}
        onConfirm={unblock}
      >
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </ConfirmDialog>
    </div>
  )
}
