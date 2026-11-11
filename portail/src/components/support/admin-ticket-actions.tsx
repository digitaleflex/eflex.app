'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from '@/lib/support-tickets'

export function AdminTicketActions({ ticketId, status, priority, adminNote }: { ticketId: string; status: string; priority: string; adminNote: string }) {
  const router = useRouter()
  const [nextStatus, setNextStatus] = useState(status)
  const [nextPriority, setNextPriority] = useState(priority)
  const [note, setNote] = useState(adminNote)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, priority: nextPriority, adminNote: note }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Mise à jour impossible')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mise à jour impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
      <h2 className="font-semibold">Traitement</h2>
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
      <label className="space-y-1 block">
        <span className="text-muted-foreground">Statut</span>
        <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3">
          {SUPPORT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="space-y-1 block">
        <span className="text-muted-foreground">Priorité</span>
        <select value={nextPriority} onChange={(e) => setNextPriority(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3">
          {SUPPORT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      <label className="space-y-1 block">
        <span className="text-muted-foreground">Note interne</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2" />
      </label>
      <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Enregistrement…' : 'Mettre à jour'}</Button>
    </div>
  )
}
