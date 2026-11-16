'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from '@/lib/support-tickets'

export function AdminTicketActions({
  ticketId,
  status,
  priority,
  adminNote,
}: {
  ticketId: string
  status: string
  priority: string
  adminNote: string
}) {
  const router = useRouter()
  const noteId = useId()
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
    <Card className="space-y-4 p-4">
      <h2 className="text-sm font-semibold">Traitement</h2>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <Select
        label="Statut"
        value={nextStatus}
        onChange={(e) => setNextStatus(e.target.value)}
        options={SUPPORT_STATUSES}
      />
      <Select
        label="Priorité"
        value={nextPriority}
        onChange={(e) => setNextPriority(e.target.value)}
        options={SUPPORT_PRIORITIES}
      />
      <div className="space-y-1.5">
        <label htmlFor={noteId} className="block text-sm font-medium text-foreground">
          Note interne
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm transition-[border-color,box-shadow] duration-200 ease-out-expo hover:border-foreground/60 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <p className="text-xs text-muted-foreground">Visible uniquement par l’équipe d’administration.</p>
      </div>
      <Button type="button" onClick={save} disabled={saving} className="w-full">
        {saving ? 'Enregistrement…' : 'Mettre à jour'}
      </Button>
    </Card>
  )
}
