'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

/**
 * Annule le déploiement en cours (route POST …/cancel). Affiché uniquement
 * pour un déploiement actif ; confirmation explicite avant l'action.
 */
export function CancelDeploymentButton({
  projectId,
  deploymentId,
  className,
}: {
  projectId: string
  deploymentId: string
  className?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  const cancel = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/deployments/${deploymentId}/cancel`, {
        method: 'POST',
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string; warning?: string }
      if (!response.ok) {
        toast({
          title: 'Annulation impossible',
          description: data.error ?? 'Réessayez dans un instant.',
          variant: 'error',
        })
        return
      }
      toast({
        title: 'Déploiement annulé',
        description:
          data.warning ??
          'La version actuellement en ligne reste disponible. Vous pouvez relancer un déploiement quand vous le souhaitez.',
        variant: data.warning ? 'error' : 'success',
      })
      router.refresh()
    } catch {
      toast({
        title: 'Serveur injoignable',
        description: 'Vérifiez votre connexion puis réessayez.',
        variant: 'error',
      })
    } finally {
      setOpen(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Ban className="h-4 w-4" aria-hidden="true" />
        Annuler le déploiement
      </Button>
      <ConfirmDialog
        open={open}
        title="Annuler le déploiement ?"
        description="La construction en cours sera interrompue. La version actuellement en ligne reste disponible ; vous pourrez relancer un déploiement ensuite."
        confirmLabel="Annuler le déploiement"
        cancelLabel="Continuer le déploiement"
        destructive
        onConfirm={cancel}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
