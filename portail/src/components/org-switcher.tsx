'use client'

import { useId } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

/** Choix de l'organisation active ; tout le tableau de bord se recharge sur la nouvelle. */
export function OrgSwitcher({ className }: { className?: string }) {
  const router = useRouter()
  const id = useId()
  const { data: organizations } = authClient.useListOrganizations()
  const { data: active } = authClient.useActiveOrganization()

  if (!organizations || organizations.length === 0) return null

  const change = async (organizationId: string) => {
    await authClient.organization.setActive({ organizationId })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">Organisation active</label>
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <select
          id={id}
          value={active?.id ?? ''}
          onChange={(e) => void change(e.target.value)}
          className="h-10 w-full appearance-none rounded-lg border border-input bg-background pl-9 pr-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {!active && <option value="">Choisir…</option>}
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
