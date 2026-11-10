'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { applyTheme, readTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'system', label: 'Système', description: 'Suit le réglage de l’appareil', icon: Monitor },
  { value: 'light', label: 'Clair', description: 'Toujours clair', icon: Sun },
  { value: 'dark', label: 'Sombre', description: 'Toujours sombre', icon: Moon },
] as const


/** Navigation clavier du groupe de radios : flèches, Début et Fin. */
function radioKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const buttons = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
  )
  const current = buttons.indexOf(event.currentTarget)
  if (current === -1) return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  const target = buttons[next]
  target?.focus()
  target?.click()
}

function useThemeChoice() {
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => setTheme(readTheme()), [])
  const choose = (value: Theme) => {
    setTheme(value)
    applyTheme(value)
  }
  return [theme, choose] as const
}

/** Choix du thème en trois options explicites (réglages du compte). */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, choose] = useThemeChoice()

  return (
    <div role="radiogroup" aria-label="Thème" className={cn('grid gap-3 sm:grid-cols-3', className)}>
      {OPTIONS.map(({ value, label, description, icon: Icon }) => {
        const checked = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(value)}
            onKeyDown={radioKeyDown}
            className={cn(
              'flex min-h-[5.25rem] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              checked ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-foreground/25 hover:bg-muted/50',
            )}
          >
            <span className="flex w-full items-center justify-between">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <span aria-hidden="true" className={cn('flex h-4 w-4 items-center justify-center rounded-full border', checked ? 'border-primary bg-primary' : 'border-input')}>
                {checked && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
            </span>
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Version compacte pour la barre du compte (icônes + libellés accessibles). */
export function ThemeIcons({ className }: { className?: string }) {
  const [theme, choose] = useThemeChoice()

  return (
    <div role="radiogroup" aria-label="Thème" className={cn('inline-flex rounded-lg border border-border p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          tabIndex={theme === value ? 0 : -1}
          onClick={() => choose(value)}
          onKeyDown={radioKeyDown}
          title={label}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
            theme === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}

/** Icône unique : bascule directement entre thème clair et thème sombre. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, choose] = useThemeChoice()
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemDark(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  const label = dark ? 'Passer au thème clair' : 'Passer au thème sombre'

  return (
    <button
      type="button"
      onClick={() => choose(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors duration-200 ease-out-expo hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  )
}
