'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
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
        <div className="min-w-[11rem]">
          <Select
            label="Plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            options={PLAN_IDS.map((id) => ({ value: id, label: PLANS[id].label }))}
          />
        </div>
        <div className="min-w-[11rem]">
          <Select
            label="Statut"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={STATUSES.map((item) => ({ value: item.value, label: item.label }))}
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <Input
            id={`org-plan-reason-${organizationId}`}
            label="Motif (obligatoire)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </div>
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
