'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, Monitor, Moon, Sun, Users } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { applyTheme, readTheme, type Theme } from '@/lib/theme'
import { useConnectionState } from '@/hooks/events-provider'
import { cn } from '@/lib/utils'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?'

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('system')
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const connection = useConnectionState()

  useEffect(() => setTheme(readTheme()), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    const onClick = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open])

  const choose = (t: Theme) => { setTheme(t); applyTheme(t) }
  const item = 'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-eflexroyalblue to-eflexsky text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      >
        <span aria-hidden="true">{initials(name)}</span>
        <span className="sr-only">Menu du compte de {name}</span>
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Compte" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-lg">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
            {connection && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', connection === 'live' ? 'bg-success' : connection === 'ended' ? 'bg-destructive' : 'bg-warning')} />
                {connection === 'live' ? 'Mises à jour en direct' : connection === 'ended' ? 'Hors ligne' : 'Reconnexion…'}
              </p>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className={item}><Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Notifications</Link>
          <Link href="/dashboard/organization" onClick={() => setOpen(false)} className={item}><Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Équipe</Link>
          <div className="my-1 h-px bg-border" />
          <div role="radiogroup" aria-label="Thème" className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <span className="text-sm">Thème</span>
            <span className="flex rounded-lg border border-border p-0.5">
              {([['system', Monitor, 'Système'], ['light', Sun, 'Clair'], ['dark', Moon, 'Sombre']] as const).map(([t, Icon, label]) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  onClick={() => choose(t)}
                  className={cn('flex h-7 w-7 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10', theme === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                </button>
              ))}
            </span>
          </div>
          <div className="my-1 h-px bg-border" />
          <button type="button" className={item} onClick={async () => { await signOut(); router.push('/'); router.refresh() }}>
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
