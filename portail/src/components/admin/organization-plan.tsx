'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PLANS, PLAN_IDS } from '@/lib/plans'

const STATUSES = [
  { value: 'active', label: 'Actif' },
  { value: 'trialing', label: 'Essai' },
  { value: 'pending', label: 'En attente' },
  { value: 'past_due', label: 'Impayé' },
  { value: 'cancelled', label: 'Résilié' },
] as const

/** Changement manuel du plan d'une organisation (activation après paiement). */
export function AdminOrganizationPlan({
  organizationId,
  initialPlan,
  initialStatus,
  initialPeriodEnd,
}: {
  organizationId: string
  initialPlan: string
  initialStatus: string
  initialPeriodEnd: string | null
}) {
  const router = useRouter()
  const [plan, setPlan] = useState(initialPlan)
  const [status, setStatus] = useState(initialStatus === 'free' ? 'active' : initialStatus)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/organizations/${organizationId}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan', plan, status, reason }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ tone: 'error', text: body.error ?? 'Enregistrement impossible.' })
        return
      }
      setMessage({ tone: 'success', text: 'Abonnement mis à jour.' })
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: 'Impossible de contacter le serveur.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Plan</span>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PLAN_IDS.map((id) => (
              <option key={id} value={id}>{PLANS[id].label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Statut</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {STATUSES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Motif (obligatoire)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <Button type="button" size="sm" loading={saving} disabled={reason.trim().length < 3} onClick={() => void save()}>
          Enregistrer
        </Button>
        <p className="text-xs text-muted-foreground">
          {initialPeriodEnd ? `Période actuelle jusqu’au ${new Date(initialPeriodEnd).toLocaleDateString('fr-FR')}.` : 'Activation : 30 jours par défaut.'}
        </p>
      </div>
    </div>
  )
}
