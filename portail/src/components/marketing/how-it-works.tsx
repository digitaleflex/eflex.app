'use client'

import { useState } from 'react'
import { Check, Globe, Lock, Server, Settings2 } from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'
import { GithubMark } from '@/components/icons/github-mark'
import { cn } from '@/lib/utils'

type Step = {
  id: number
  title: string
  description: string
  details: string[]
}

const steps: Step[] = [
  {
    id: 1,
    title: 'Connectez votre dépôt',
    description: 'Connectez votre compte GitHub et sélectionnez le dépôt contenant votre application.',
    details: ['Connexion GitHub', 'Sélection du dépôt', 'Choix de la branche'],
  },
  {
    id: 2,
    title: 'Configurez votre application',
    description:
      'EFLEX identifie les caractéristiques de votre projet et vous permet de configurer les paramètres nécessaires à sa construction.',
    details: ['Détection du framework', 'Commandes proposées', 'Variables d’environnement'],
  },
  {
    id: 3,
    title: 'Déployez votre application',
    description: 'Lancez le déploiement et rendez votre application accessible en ligne lorsque le processus est terminé.',
    details: ['Construction de l’image', 'Mise en ligne', 'Adresse HTTPS'],
  },
]

function RepoScene() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primary/30 bg-background p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
            <GithubMark className="h-4 w-4 text-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-medium">mon-equipe/boutique</p>
            <p className="text-xs text-muted-foreground">Branche : main</p>
          </div>
          <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">Sélectionné</span>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-background/70 p-4 opacity-75">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
            <GithubMark className="h-4 w-4 text-foreground" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-medium">mon-equipe/api</p>
            <p className="text-xs text-muted-foreground">Branche : main</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfigScene() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-4">
        <FrameworkIcon framework="nextjs" alt="" className="h-8 w-8 p-1" />
        <div>
          <p className="text-sm font-semibold">Next.js détecté</p>
          <p className="text-xs text-muted-foreground">Configuration proposée automatiquement</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="space-y-2.5 text-sm">
          {[
            ['Installation', 'pnpm install'],
            ['Build', 'pnpm build'],
            ['Démarrage', 'pnpm start'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-3">
              <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
              <span className="w-24 text-muted-foreground">{label}</span>
              <span className="truncate font-mono text-xs sm:text-sm">{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Settings2 className="h-4 w-4" aria-hidden="true" />
        Variables d’environnement configurables avant le déploiement
      </div>
    </div>
  )
}

function DeployScene() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="space-y-3">
          {[
            { label: 'Construction', state: 'Terminé' },
            { label: 'Déploiement', state: 'Terminé' },
            { label: 'Certificat HTTPS', state: 'Actif' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                {item.state}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-success">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success/50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          </span>
          Application disponible
        </div>
        <p className="mt-2 flex items-center gap-2 font-mono text-sm text-foreground">
          <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          https://boutique.exemple.app
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Adresse de démonstration
        </p>
      </div>
    </div>
  )
}

const scenes = [RepoScene, ConfigScene, DeployScene]

export function HowItWorks() {
  const [active, setActive] = useState(0)
  const ActiveScene = scenes[active]
  const activeStep = steps[active]

  return (
    <div className="mt-12 md:mt-14">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-10">
        <div>
          <div className="mb-6 flex items-center gap-2" aria-hidden="true">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2.5 rounded-full transition-[width,background-color] duration-300 ease-out-expo',
                    index === active ? 'w-10 bg-primary' : 'w-2.5 bg-border',
                  )}
                />
                {index < steps.length - 1 && <span className="h-px w-6 bg-border sm:w-10" />}
              </div>
            ))}
          </div>

          <ol className="space-y-3">
            {steps.map((step, index) => {
              const selected = index === active
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-pressed={selected}
                    className={cn(
                      'w-full rounded-2xl border p-5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary/30 bg-card shadow-sm'
                        : 'border-border bg-card/50 hover:border-primary/20 hover:bg-card',
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-semibold',
                          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        0{step.id}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">{step.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Points clés de l’étape ${step.id}`}>
                          {step.details.map((detail) => (
                            <li
                              key={detail}
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="rounded-3xl border border-border bg-muted/40 p-5 sm:p-6 lg:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">
              Étape 0{activeStep.id} — {activeStep.title}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <Server className="h-3.5 w-3.5" aria-hidden="true" />
              Aperçu illustratif
            </span>
          </div>
          <div className="min-h-[280px] sm:min-h-[320px]">
            <ActiveScene />
          </div>
        </div>
      </div>
    </div>
  )
}
