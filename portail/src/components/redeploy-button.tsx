'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Relance un déploiement (file Redis, voir /api/projects/[id]/redeploy).
 * `appId` cible une application précise du mode multi-applications.
 */
export function RedeployButton({
  projectId,
  appId,
  variant = 'outline',
  label,
  srLabel,
}: {
  projectId: string
  appId?: string
  variant?: 'outline' | 'primary'
  label?: string
  /** Contexte supplémentaire pour les lecteurs d'écran (ex. nom de l'application). */
  srLabel?: string
}) {
  const resolvedLabel = label ?? (appId ? 'Redéployer l’application' : 'Redéployer')
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const redeploy = async () => {
    setBusy(true)
    try {
      const query = appId ? `?appId=${encodeURIComponent(appId)}` : ''
      const response = await fetch(`/api/projects/${projectId}/redeploy${query}`, { method: 'POST' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; issues?: Array<{ message: string; action: string }> }
        // Pré-vérification refusée (#164) : message et action concrète plutôt qu'une erreur générique.
        const first = data.issues?.[0]
        toast({
          title: 'Redéploiement impossible',
          description: first ? `${first.message} ${first.action}` : (data.error ?? 'Réessayez dans un instant.'),
          variant: 'error',
        })
      } else {
        const data = (await response.json().catch(() => ({}))) as { warnings?: Array<{ message: string; action: string }> }
        const warning = data.warnings?.[0]
        toast({
          title: 'Déploiement lancé',
          description: warning ? `Attention : ${warning.message} ${warning.action}` : 'Suivez sa progression dans l’onglet Déploiements.',
          variant: warning ? 'info' : 'success',
        })
        router.refresh()
      }
    } catch {
      toast({ title: 'Serveur injoignable', description: 'Vérifiez votre connexion puis réessayez.', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant={variant} size="sm" onClick={redeploy} loading={busy}>
      <RotateCw className="h-4 w-4" aria-hidden="true" />
      {resolvedLabel}
      {srLabel && <span className="sr-only"> {srLabel}</span>}
    </Button>
  )
}
