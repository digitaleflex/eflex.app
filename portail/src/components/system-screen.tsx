import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'

export type SystemTone = 'neutral' | 'warning' | 'destructive'

const TONE_CLASSES: Record<SystemTone, string> = {
  neutral: 'bg-primary/10 text-primary',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
}

const ACTION_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const ACTION_VARIANTS = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  secondary: 'border border-input bg-background hover:bg-muted',
} as const

/** Classes communes aux actions principales et secondaires des écrans système. */
export function systemActionClass(variant: keyof typeof ACTION_VARIANTS = 'primary'): string {
  return cn(ACTION_BASE, ACTION_VARIANTS[variant])
}

/** Lien d'action autonome, pour les écrans rendus sans dépendre d'un état client. */
export function SystemLink({
  href,
  children,
  variant = 'secondary',
}: {
  href: string
  children: ReactNode
  variant?: keyof typeof ACTION_VARIANTS
}) {
  return (
    <Link href={href} className={systemActionClass(variant)}>
      {children}
    </Link>
  )
}

/**
 * Écran système commun (introuvable, erreur, maintenance) : même hiérarchie, même ton,
 * une action de récupération principale et une référence technique facultative.
 * Composant purement présentationnel : aucune donnée serveur, donc utilisable aussi
 * depuis une frontière d'erreur.
 */
export function SystemScreen({
  icon: Icon,
  tone = 'neutral',
  title,
  description,
  children,
  reference,
  footer,
}: {
  icon: LucideIcon
  tone?: SystemTone
  title: string
  description: ReactNode
  /** Actions de récupération, dans l'ordre de lecture. */
  children?: ReactNode
  /** Référence d'erreur (digest) à transmettre au support. */
  reference?: string | null
  footer?: ReactNode
}) {
  return (
    <main
      id="contenu"
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-16 text-center text-foreground"
    >
      <BrandLogo className="h-8 w-auto" priority />

      <div className="flex max-w-lg flex-col items-center gap-4">
        <span
          aria-hidden="true"
          className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', TONE_CLASSES[tone])}
        >
          <Icon className="h-7 w-7" />
        </span>
        <div className="space-y-3">
          <h1 className="text-balance text-display-sm font-bold">{title}</h1>
          <div className="space-y-2 text-muted-foreground">{description}</div>
        </div>
      </div>

      {children && (
        <div className="flex w-full max-w-lg flex-wrap items-center justify-center gap-3">{children}</div>
      )}

      {reference && (
        <div className="max-w-lg rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Référence technique</p>
          <code className="mt-1 block break-all font-mono text-xs text-foreground">{reference}</code>
          <p className="mt-1 text-xs text-muted-foreground">
            Communiquez cette référence au support pour retrouver l’incident.
          </p>
        </div>
      )}

      {footer && <div className="max-w-lg text-sm text-muted-foreground">{footer}</div>}
    </main>
  )
}
