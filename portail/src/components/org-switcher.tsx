'use client'

import { useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

/** Choix de l'organisation active ; tout le tableau de bord se recharge sur la nouvelle. */
export function OrgSwitcher({ className }: { className?: string }) {
  const router = useRouter()
  const id = useId()
  const { data: organizations } = authClient.useListOrganizations()
  const { data: active, isPending } = authClient.useActiveOrganization()
  const repaired = useRef(false)

  // Auto-réparation : sans organisation active (membre retiré, organisation supprimée, course avec
  // le plugin au moment du retrait) alors qu'il en reste une, on active la première.
  useEffect(() => {
    if (repaired.current || isPending || active || !organizations || organizations.length === 0) return
    // Patience : une activation volontaire (invitation acceptée, changement d'organisation) peut
    // être en cours. On n'intervient que si l'absence d'organisation active persiste.
    const timer = setTimeout(() => {
      repaired.current = true
      void authClient.organization.setActive({ organizationId: organizations[0]!.id }).then(() => router.refresh())
    }, 1_500)
    return () => clearTimeout(timer)
  }, [active, isPending, organizations, router])

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
        <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-gradient-to-br from-eflexnavy to-eflexroyalblue text-xs font-bold text-white">
          {(active?.name ?? organizations[0]?.name ?? '?').charAt(0).toUpperCase()}
        </span>
        <select
          id={id}
          value={active?.id ?? ''}
          onChange={(e) => void change(e.target.value)}
          className="h-9 w-full cursor-pointer appearance-none truncate rounded-lg border border-transparent bg-transparent pl-9 pr-8 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
        >
          {!active && <option value="">Choisir…</option>}
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  )
}
