'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function UserActions({ id, name, banned }: { id: string; name: string; banned: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('')
  const [error, setError] = useState('')
  const [impersonating, setImpersonating] = useState(false)
  const reasonId = useId()
  const daysId = useId()

  const call = async (init: RequestInit) => {
    setError('')
    const res = await fetch(`/api/admin/users/${id}/ban`, { headers: { 'content-type': 'application/json' }, ...init })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? 'Action impossible pour le moment. Réessayez.')
      return false
    }
    setOpen(false)
    setReason('')
    setDays('')
    router.refresh()
    return true
  }

  const impersonate = async () => {
    setError('')
    setImpersonating(true)
    try {
      const res = await fetch(`/api/admin/users/${id}/impersonate`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? "Impossible d'ouvrir ce compte pour le moment.")
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setImpersonating(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {!banned && (
        <Button variant="ghost" size="sm" loading={impersonating} onClick={() => void impersonate()}>
          Prendre la main<span className="sr-only"> sur le compte de {name}</span>
        </Button>
      )}
      {banned ? (
        <Button variant="outline" size="sm" onClick={() => void call({ method: 'DELETE' })}>
          Réactiver<span className="sr-only"> le compte de {name}</span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Suspendre<span className="sr-only"> le compte de {name}</span>
        </Button>
      )}
      {error && <p role="alert" className="max-w-56 text-xs sm:text-right text-destructive">{error}</p>}

      <ConfirmDialog
        open={open}
        destructive
        title={`Suspendre le compte de ${name} ?`}
        description="La personne est déconnectée immédiatement et ne peut plus se reconnecter tant que le compte n'est pas réactivé. Ses applications restent en ligne."
        confirmLabel="Suspendre le compte"
        confirmDisabled={reason.trim().length < 5}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          await call({ method: 'POST', body: JSON.stringify({ reason: reason.trim(), ...(days ? { days: Number(days) } : {}) }) })
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">Motif (enregistré dans le journal d&apos;audit)</label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={300}
            required
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={daysId} className="text-sm font-medium">Durée en jours (vide = jusqu&apos;à réactivation)</label>
          <input
            id={daysId}
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </ConfirmDialog>
    </div>
  )
}
