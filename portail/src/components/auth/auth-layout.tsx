import type { ReactNode } from 'react'
import Link from 'next/link'
import { Database, Globe, GitBranch, Sparkles } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { Card } from '@/components/ui/card'
import { formatPrice, PLANS } from '@/lib/plans'

/**
 * Socle visuel commun aux parcours d'authentification.
 *
 * Sur grand écran, un panneau d'identité rappelle à quoi sert EFLEX et ce que le plan Découverte
 * permet réellement. Sur mobile, le formulaire reste le premier contenu (« premier écran mobile ») :
 * le panneau passe après, en complément.
 *
 * Les routes et leurs logiques métier restent séparées : ce composant ne pose que la grammaire
 * visuelle. Le titre principal est rendu ici pour que l'ordre des titres reste cohérent partout.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-muted/40">
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-14 focus:outline-none sm:px-6 sm:pt-16 lg:flex-row lg:items-stretch lg:gap-10 lg:px-8 lg:py-10"
      >
        <section className="order-1 flex w-full flex-col lg:order-2 lg:max-w-md lg:justify-center">
          <div className="mb-6 flex justify-center lg:justify-start">
            <Link
              href="/"
              className="inline-flex rounded-xl p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <BrandLogo alt="EFLEX — accueil" className="h-8 w-auto" priority />
            </Link>
          </div>

          <div className="w-full animate-fade-in space-y-6">
            <div className="space-y-2 text-center lg:text-left">
              <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h1>
              {description && <p className="text-muted-foreground text-pretty">{description}</p>}
            </div>

            {children}

            {footer && <div className="text-center text-sm text-muted-foreground lg:text-left">{footer}</div>}
          </div>
        </section>

        <AuthIdentityPanel className="order-2 mt-8 lg:order-1 lg:mt-0 lg:flex lg:w-[46%] lg:max-w-xl lg:shrink-0" />
      </main>
    </div>
  )
}

function AuthIdentityPanel({ className }: { className?: string }) {
  const free = PLANS.free

  return (
    <aside aria-label="À propos d’EFLEX" className={['w-full', className].filter(Boolean).join(' ')}>
      <div className="flex h-full flex-col justify-between gap-6 rounded-2xl border border-eflexnavy/15 bg-eflexnavy p-6 text-white shadow-lg sm:p-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-lg font-semibold text-white sm:text-xl">De votre code à un site en ligne</p>
            <p className="max-w-prose text-sm leading-relaxed text-white/80 sm:text-base">
              EFLEX analyse votre dépôt, prépare l’environnement et publie votre application avec une adresse sécurisée.
            </p>
          </div>

          <ul className="space-y-3 text-sm text-white/90" aria-label="Ce que propose EFLEX">
            <IdentityItem icon={<GitBranch className="h-4 w-4" aria-hidden="true" />}>
              Déploiement depuis votre dépôt Git
            </IdentityItem>
            <IdentityItem icon={<Globe className="h-4 w-4" aria-hidden="true" />}>
              Adresse en ligne avec HTTPS géré automatiquement
            </IdentityItem>
            <IdentityItem icon={<Database className="h-4 w-4" aria-hidden="true" />}>
              Bases de données PostgreSQL et Redis disponibles
            </IdentityItem>
          </ul>

          <div
            className="rounded-xl border border-white/15 bg-white/10 p-4"
            aria-label="Aperçu du parcours de déploiement"
          >
            <p className="text-sm font-medium text-white">Parcours de déploiement</p>
            <ol className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-white/85">
              <DeployStep label="Analyse" active />
              <DeployStep label="Build" />
              <DeployStep label="En ligne" />
            </ol>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <div className="h-full w-1/3 rounded-full bg-white/80 motion-safe:animate-pulse motion-reduce:w-1/3" />
            </div>
          </div>
        </div>

        <Card className="border-white/15 bg-white/10 p-4 text-white shadow-none backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold">
                {free.label} · {formatPrice(free.priceFcfa)}
              </p>
              <p className="text-sm text-white/80 text-pretty">{free.tagline}</p>
            </div>
          </div>
        </Card>
      </div>
    </aside>
  )
}

function IdentityItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
        {icon}
      </span>
      <span className="pt-1 leading-snug text-pretty">{children}</span>
    </li>
  )
}

function DeployStep({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <li
      className={[
        'rounded-lg border px-2 py-2 font-medium',
        active ? 'border-white/30 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/80',
      ].join(' ')}
    >
      {label}
    </li>
  )
}

/** Séparateur entre les fournisseurs et la connexion par adresse e-mail. */
export function AuthDivider({ label = 'ou' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
