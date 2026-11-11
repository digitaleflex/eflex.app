'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CalendarPlus, Gauge, RotateCcw, ShieldCheck, Sparkles, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PLANS, PLAN_IDS } from '@/lib/plans'

type Feedback = { tone: 'success' | 'error'; text: string } | null
type Status = 'active' | 'trialing' | 'pending' | 'past_due' | 'cancelled'

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'active', label: 'Actif' },
  { value: 'trialing', label: 'Période d’essai' },
  { value: 'pending', label: 'En attente' },
  { value: 'past_due', label: 'Impayé' },
  { value: 'cancelled', label: 'Résilié' },
]

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Action impossible.')
  return data
}

/** Actions auditées sur une organisation : plan, période, quotas, suspension. */
export function OrganizationAdminActions({
  organizationId,
  plan,
  status,
  suspended,
  reason: initialReason,
  manualOverride,
  projectLimitOverride,
  memberLimitOverride,
}: {
  organizationId: string
  plan: string
  status: string
  suspended: boolean
  reason: string | null
  manualOverride: boolean
  projectLimitOverride: number | null
  memberLimitOverride: number | null
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [planValue, setPlanValue] = useState(plan)
  const [statusValue, setStatusValue] = useState<Status>((status === 'free' ? 'active' : status) as Status)
  const [planReason, setPlanReason] = useState('')
  const [days, setDays] = useState('30')
  const [extendReason, setExtendReason] = useState('')
  const [projectLimit, setProjectLimit] = useState(projectLimitOverride?.toString() ?? '')
  const [memberLimit, setMemberLimit] = useState(memberLimitOverride?.toString() ?? '')
  const [quotaDays, setQuotaDays] = useState('30')
  const [quotaReason, setQuotaReason] = useState('')
  const [suspensionReason, setSuspensionReason] = useState(initialReason ?? '')

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key)
    setFeedback(null)
    try {
      await action()
      setFeedback({ tone: 'success', text: success })
      router.refresh()
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Action impossible.' })
    } finally {
      setBusy(null)
    }
  }

  const changePlan = () =>
    run(
      'plan',
      () =>
        post(`/api/admin/organizations/${organizationId}/subscription`, {
          action: 'plan',
          plan: planValue,
          status: statusValue,
          reason: planReason,
        }),
      'Plan et statut mis à jour. Le prorata éventuel est crédité pour le prochain paiement.',
    )

  const extend = () =>
    run(
      'extend',
      () =>
        post(`/api/admin/organizations/${organizationId}/subscription`, {
          action: 'extend',
          days: Number(days),
          reason: extendReason,
        }),
      'Période prolongée.',
    )

  const overrideQuota = () =>
    run(
      'quota',
      () =>
        post(`/api/admin/organizations/${organizationId}/subscription`, {
          action: 'quota',
          ...(projectLimit.trim() ? { projectLimit: Number(projectLimit) } : {}),
          ...(memberLimit.trim() ? { memberLimit: Number(memberLimit) } : {}),
          until: new Date(Date.now() + Number(quotaDays) * 86_400_000).toISOString(),
          reason: quotaReason,
        }),
      'Quota relevé temporairement.',
    )

  const clearOverride = () =>
    run(
      'clear',
      () =>
        post(`/api/admin/organizations/${organizationId}/subscription`, {
          action: 'clear-override',
          reason: 'Retour au plan et aux quotas standard',
        }),
      'Verrou manuel et quotas dérogatoires levés.',
    )

  const toggleSuspension = () =>
    run(
      'suspend',
      () =>
        post(`/api/admin/organizations/${organizationId}/suspension`, {
          suspended: !suspended,
          reason: suspensionReason,
        }),
      suspended ? 'Organisation réactivée.' : 'Organisation suspendue : créations et déploiements gelés.',
    )

  return (
    <div className="space-y-5">
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={
            feedback.tone === 'error'
              ? 'rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-foreground'
          }
        >
          {feedback.text}
        </p>
      )}

      <section aria-labelledby="admin-plan-title" className="space-y-3 rounded-lg border border-border p-4">
        <h3 id="admin-plan-title" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Changer le plan manuellement
        </h3>
        <p className="text-xs text-muted-foreground">
          Un changement manuel est audité, exige un motif et protège le plan contre un webhook de paiement portant sur
          un autre plan. Un changement de plan en cours de période crédite la valeur restante au prorata (jours / 30).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Plan</span>
            <select
              value={planValue}
              onChange={(e) => setPlanValue(e.target.value)}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {PLAN_IDS.map((id) => <option key={id} value={id}>{PLANS[id].label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Statut</span>
            <select
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value as Status)}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="min-w-[16rem] flex-1">
            <Input
              id="plan-reason"
              label="Motif (obligatoire)"
              value={planReason}
              onChange={(e) => setPlanReason(e.target.value)}
              maxLength={500}
              placeholder="Geste commercial, virement reçu…"
            />
          </div>
          <Button type="button" loading={busy === 'plan'} disabled={planReason.trim().length < 3} onClick={() => void changePlan()}>
            Appliquer
          </Button>
        </div>
        {manualOverride && (
          <p className="flex items-start gap-2 text-xs text-warning">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Plan protégé par un changement manuel. Le paiement d’un autre plan sera enregistré en attente.
          </p>
        )}
        {manualOverride && (
          <Button type="button" size="sm" variant="outline" loading={busy === 'clear'} onClick={() => void clearOverride()}>
            <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
            Lever le verrou manuel et les quotas dérogatoires
          </Button>
        )}
      </section>

      <section aria-labelledby="admin-period-title" className="space-y-3 rounded-lg border border-border p-4">
        <h3 id="admin-period-title" className="flex items-center gap-2 text-sm font-semibold">
          <CalendarPlus className="h-4 w-4 text-primary" aria-hidden="true" />
          Prolonger la période / l’essai
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Jours</span>
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-11 w-28 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
            />
          </label>
          <div className="min-w-[16rem] flex-1">
            <Input
              id="extend-reason"
              label="Motif (obligatoire)"
              value={extendReason}
              onChange={(e) => setExtendReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <Button
            type="button"
            loading={busy === 'extend'}
            disabled={!Number.isFinite(Number(days)) || Number(days) < 1 || extendReason.trim().length < 3}
            onClick={() => void extend()}
          >
            Prolonger
          </Button>
        </div>
      </section>

      <section aria-labelledby="admin-quota-title" className="space-y-3 rounded-lg border border-border p-4">
        <h3 id="admin-quota-title" className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
          Relever temporairement un quota
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Applications (quota)</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={projectLimit}
              onChange={(e) => setProjectLimit(e.target.value)}
              placeholder="—"
              className="h-11 w-32 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Membres</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={memberLimit}
              onChange={(e) => setMemberLimit(e.target.value)}
              placeholder="—"
              className="h-11 w-28 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">Durée (jours)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={quotaDays}
              onChange={(e) => setQuotaDays(e.target.value)}
              className="h-11 w-28 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
            />
          </label>
          <div className="min-w-[14rem] flex-1">
            <Input
              id="quota-reason"
              label="Motif (obligatoire)"
              value={quotaReason}
              onChange={(e) => setQuotaReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <Button
            type="button"
            loading={busy === 'quota'}
            disabled={(!projectLimit.trim() && !memberLimit.trim()) || quotaReason.trim().length < 3}
            onClick={() => void overrideQuota()}
          >
            Relever
          </Button>
        </div>
      </section>

      <section aria-labelledby="admin-suspend-title" className="space-y-3 rounded-lg border border-border p-4">
        <h3 id="admin-suspend-title" className="flex items-center gap-2 text-sm font-semibold">
          <Ban className="h-4 w-4 text-destructive" aria-hidden="true" />
          {suspended ? 'Réactiver l’organisation' : 'Suspendre l’organisation'}
        </h3>
        <p className="text-xs text-muted-foreground">
          La suspension gèle la création de projets et les nouveaux déploiements. Aucune application en ligne, aucun
          projet et aucune donnée n’est supprimé.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[18rem] flex-1">
            <Input
              id="suspension-reason"
              label={suspended ? 'Motif de la réactivation' : 'Motif de la suspension (obligatoire)'}
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <Button
            type="button"
            variant={suspended ? 'outline' : 'destructive'}
            loading={busy === 'suspend'}
            disabled={suspensionReason.trim().length < 3}
            onClick={() => void toggleSuspension()}
          >
            {suspended ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />}
            {suspended ? 'Réactiver' : 'Suspendre'}
          </Button>
        </div>
      </section>
    </div>
  )
}
