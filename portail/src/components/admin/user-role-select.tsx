'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/admin-rbac'

const OPTIONS: Array<{ value: AdminRole | 'user'; label: string }> = [
  { value: 'super_admin', label: ADMIN_ROLE_LABELS.super_admin },
  { value: 'exploitation', label: ADMIN_ROLE_LABELS.exploitation },
  { value: 'support', label: ADMIN_ROLE_LABELS.support },
  { value: 'finance', label: ADMIN_ROLE_LABELS.finance },
  { value: 'user', label: 'Compte standard (retirer l’accès admin)' },
]

export function UserRoleSelect({
  id,
  name,
  currentRole,
}: {
  id: string
  name: string
  currentRole: AdminRole | 'admin' | null
}) {
  const router = useRouter()
  const normalized = currentRole === 'admin' ? 'super_admin' : currentRole
  const [role, setRole] = useState<AdminRole | 'user'>(normalized ?? 'user')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Impossible de modifier le rôle.')
        return
      }
      router.refresh()
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setSaving(false)
    }
  }

  const changed = role !== (normalized ?? 'user')

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <label className="sr-only" htmlFor={`role-${id}`}>Rôle administrateur de {name}</label>
      <div className="flex items-center gap-2">
        <select
          id={`role-${id}`}
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole | 'user')}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" loading={saving} disabled={!changed} onClick={() => void save()}>
          Appliquer
        </Button>
      </div>
      {error && <p role="alert" className="max-w-56 text-xs sm:text-right text-destructive">{error}</p>}
    </div>
  )
}
