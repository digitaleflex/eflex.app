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
  label = 'Redéployer',
  srLabel,
}: {
  projectId: string
  appId?: string
  variant?: 'outline' | 'primary'
  label?: string
  /** Contexte supplémentaire pour les lecteurs d'écran (ex. nom de l'application). */
  srLabel?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const redeploy = async () => {
    setBusy(true)
    try {
      const query = appId ? `?appId=${encodeURIComponent(appId)}` : ''
      const response = await fetch(`/api/projects/${projectId}/redeploy${query}`, { method: 'POST' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        toast({ title: 'Redéploiement impossible', description: data.error ?? 'Réessayez dans un instant.', variant: 'error' })
      } else {
        toast({ title: 'Déploiement lancé', description: 'Suivez sa progression dans l’onglet Déploiements.', variant: 'success' })
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
      {label}
      {srLabel && <span className="sr-only"> {srLabel}</span>}
    </Button>
  )
}
