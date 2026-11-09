'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/** Relance un déploiement (file Redis, voir /api/projects/[id]/redeploy). Le retour passe par un toast. */
export function RedeployButton({ projectId, variant = 'outline' }: { projectId: string; variant?: 'outline' | 'primary' }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const redeploy = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/redeploy`, { method: 'POST' })
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
      Redéployer
    </Button>
  )
}
