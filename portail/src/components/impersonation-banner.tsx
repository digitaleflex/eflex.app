'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Bandeau visible pendant une usurpation : rappelle en permanence que la
 * session appartient à un autre compte et permet de revenir au compte admin.
 */
export function ImpersonationBanner({ userName }: { userName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function stop() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/impersonation/stop', { method: 'POST' })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Impossible de quitter ce compte pour le moment.')
        return
      }
      router.push('/admin/users')
      router.refresh()
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      aria-label={`Session d’usurpation active : ${userName}`}
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <Eye className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">Vous utilisez le compte de {userName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Session d’administration : vos actions sont enregistrées dans le journal d’audit.
        </p>
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={busy}
        onClick={() => void stop()}
        aria-label="Quitter la session d’usurpation et revenir à l’administration"
      >
        Revenir à mon compte
      </Button>
    </div>
  )
}
