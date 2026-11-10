'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'

/**
 * Retour arrière : recrée la version d'un déploiement réussi déjà en ligne
 * (route POST …/rollback). Le commit est fourni par la page ; la confirmation
 * rappelle que les variables actuelles sont réutilisées et que la base n'est
 * pas remise dans son état d'alors.
 */
export function RollbackDeploymentButton({
  projectId,
  deploymentId,
  commitSha,
  createdAtLabel,
  className,
}: {
  projectId: string
  deploymentId: string
  /** Commit complet (40 caractères) : affiché en version courte. */
  commitSha: string
  /** Date déjà formatée côté serveur : évite tout décalage d'hydratation. */
  createdAtLabel: string
  className?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const shortSha = commitSha.slice(0, 7)

  const rollback = async () => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/deployments/${deploymentId}/rollback`,
        { method: 'POST' },
      )
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        toast({
          title: 'Retour arrière impossible',
          description: data.error ?? 'Réessayez dans un instant.',
          variant: 'error',
        })
        return
      }
      toast({
        title: 'Retour arrière lancé',
        description: `La version ${shortSha} est en cours de reconstruction. Suivez sa progression dans les journaux du déploiement.`,
        variant: 'success',
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
        <History className="h-4 w-4" aria-hidden="true" />
        Redéployer cette version
        <span className="sr-only"> du commit {shortSha}</span>
      </Button>
      <ConfirmDialog
        open={open}
        title="Revenir à cette version ?"
        description={
          <>
            La version <code className="font-mono">{shortSha}</code> du {createdAtLabel} sera
            reconstruite et remise en ligne à la place de la version actuelle. Les variables
            d’environnement actuelles seront utilisées et les migrations de base de données ne sont
            pas annulées.
          </>
        }
        confirmLabel="Redéployer cette version"
        cancelLabel="Conserver la version actuelle"
        onConfirm={rollback}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
