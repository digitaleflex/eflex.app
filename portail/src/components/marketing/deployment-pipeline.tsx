'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock3,
  type LucideIcon,
  Search,
  Server,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react'
import {
  STATUS_LABELS,
  type DeploymentStatus,
} from '@/lib/deployment-state'
import { cn } from '@/lib/utils'

type StepStatus = {
  status: DeploymentStatus
  note: string
}

type PipelineStep = {
  id: string
  number: string
  title: string
  description: string
  icon: LucideIcon
  statuses: StepStatus[]
}

const STEPS: PipelineStep[] = [
  {
    id: 'connexion-preparation',
    number: '01',
    title: 'Connexion et préparation',
    description:
      'Le dépôt est relié à EFLEX, puis la demande de déploiement est prise en charge et analysée avant toute mise en service.',
    icon: Search,
    statuses: [
      {
        status: 'queued',
        note: 'La demande est enregistrée et attend son tour de traitement.',
      },
      {
        status: 'analyzing',
        note: 'Le dépôt et la configuration détectée sont vérifiés avant l’orchestration.',
      },
    ],
  },
  {
    id: 'orchestration',
    number: '02',
    title: 'Orchestration',
    description:
      'EFLEX prépare l’environnement d’exécution et les ressources nécessaires au projet, selon la configuration disponible.',
    icon: Wrench,
    statuses: [
      {
        status: 'provisioning',
        note: 'L’application et son environnement sont préparés pour recevoir la nouvelle version.',
      },
    ],
  },
  {
    id: 'deploiement',
    number: '03',
    title: 'Déploiement',
    description:
      'L’application est construite puis mise en service. Les journaux permettent de suivre l’avancement de cette phase.',
    icon: Server,
    statuses: [
      {
        status: 'building',
        note: 'L’image ou l’artefact de l’application est construit à partir du dépôt.',
      },
      {
        status: 'deploying',
        note: 'La nouvelle version est démarrée et raccordée à son environnement.',
      },
    ],
  },
  {
    id: 'suivi',
    number: '04',
    title: 'Suivi',
    description:
      'Le résultat du déploiement est visible : application en ligne, échec diagnostiqué ou déploiement annulé.',
    icon: ShieldCheck,
    statuses: [
      {
        status: 'live',
        note: 'La version déployée est en ligne et accessible selon la configuration du projet.',
      },
      {
        status: 'failed',
        note: 'Le déploiement s’est arrêté. Les journaux et le diagnostic aident à identifier la cause.',
      },
      {
        status: 'cancelled',
        note: 'Le déploiement a été annulé avant son terme.',
      },
    ],
  },
]

const STATUS_TONE: Record<DeploymentStatus, { icon: LucideIcon; className: string; badge: string }> = {
  queued: {
    icon: Clock3,
    className: 'text-muted-foreground',
    badge: 'border-border bg-muted/60 text-muted-foreground',
  },
  analyzing: {
    icon: Search,
    className: 'text-primary',
    badge: 'border-primary/20 bg-primary/10 text-primary',
  },
  provisioning: {
    icon: Wrench,
    className: 'text-primary',
    badge: 'border-primary/20 bg-primary/10 text-primary',
  },
  building: {
    icon: CircleDot,
    className: 'text-primary',
    badge: 'border-primary/20 bg-primary/10 text-primary',
  },
  deploying: {
    icon: Server,
    className: 'text-primary',
    badge: 'border-primary/20 bg-primary/10 text-primary',
  },
  live: {
    icon: CheckCircle2,
    className: 'text-success',
    badge: 'border-success/25 bg-success/10 text-success',
  },
  failed: {
    icon: XCircle,
    className: 'text-destructive',
    badge: 'border-destructive/25 bg-destructive/10 text-destructive',
  },
  cancelled: {
    icon: CircleDashed,
    className: 'text-muted-foreground',
    badge: 'border-border bg-muted/60 text-muted-foreground',
  },
}

const FAILURE_DIAGNOSTIC = [
  {
    level: 'Erreur',
    message: 'La commande de construction a échoué (code de sortie 1).',
  },
  {
    level: 'Cause probable',
    message: 'Dépendance manquante ou variable d’environnement absente au moment du build.',
  },
  {
    level: 'Action suggérée',
    message: 'Vérifier les journaux, corriger la configuration, puis relancer un déploiement.',
  },
] as const

function StatusPill({ status }: { status: DeploymentStatus }) {
  const tone = STATUS_TONE[status]
  const Icon = tone.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        tone.badge,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{STATUS_LABELS[status]}</span>
    </span>
  )
}

function StepDetail({ step }: { step: PipelineStep }) {
  const isFollowUp = step.id === 'suivi'

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary">Étape {step.number}</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{step.description}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          États documentés
        </span>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2" aria-label={`États représentés pour ${step.title}`}>
        {step.statuses.map(({ status, note }) => {
          const tone = STATUS_TONE[status]
          const Icon = tone.icon
          return (
            <li key={status} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', tone.className)} aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</p>
              </div>
              <p className="mt-1 pl-6 font-mono text-xs text-muted-foreground tabular-nums">{status}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{note}</p>
            </li>
          )
        })}
      </ul>

      {isFollowUp ? (
        <div
          className="mt-5 rounded-2xl border border-warning/30 bg-warning/5 p-4 sm:p-5"
          aria-label="Exemple illustratif de diagnostic d’échec"
        >
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">Exemple de diagnostic d’échec</p>
            <span className="rounded-full border border-warning/30 bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Illustratif
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cet exemple montre le type d’information affichée lorsqu’un déploiement échoue. Il ne représente pas un
            déploiement réel en cours.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-background">
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Journal de diagnostic (exemple)
            </div>
            <ul className="divide-y divide-border">
              {FAILURE_DIAGNOSTIC.map((entry) => (
                <li key={entry.level} className="grid gap-1 px-3 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
                  <p className="font-mono text-xs font-medium text-foreground tabular-nums">{entry.level}</p>
                  <p className="text-sm text-muted-foreground">{entry.message}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DeploymentPipeline() {
  const [activeId, setActiveId] = useState<string>(STEPS[0].id)
  const activeStep = STEPS.find((step) => step.id === activeId) ?? STEPS[0]

  return (
    <section
      id="deploiement"
      aria-labelledby="deploiement-titre"
      className="scroll-mt-20 border-y border-border bg-muted/25 py-16 md:py-24"
    >
      <div className="container">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h2 id="deploiement-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
            Un pipeline lisible, du dépôt à la mise en ligne.
          </h2>
          <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
            EFLEX expose les étapes réelles du déploiement, avec les états documentés du pipeline et des journaux
            exploitables en cas d’erreur.
          </p>
        </div>

        <div className="mt-12">
          <div
            className="grid gap-3 md:grid-cols-4"
            role="group"
            aria-label="Étapes du pipeline de déploiement"
          >
            {STEPS.map((step, index) => {
              const selected = step.id === activeId
              const Icon = step.icon
              return (
                <div key={step.id} className="relative">
                  {index < STEPS.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-[calc(100%+0.375rem)] top-8 hidden h-px w-3 bg-border md:block"
                    />
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-controls="deployment-pipeline-detail"
                    onClick={() => setActiveId(step.id)}
                    className={cn(
                      'flex min-h-11 w-full items-start gap-4 rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary/30 bg-card shadow-sm'
                        : 'border-border bg-card/60 hover:border-primary/20 hover:bg-card',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-medium text-muted-foreground tabular-nums">
                        {step.number}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-foreground sm:text-base">{step.title}</span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {step.statuses.map(({ status }) => (
                          <span
                            key={status}
                            className={cn(
                              'rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums',
                              selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {status}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          <div className="mt-5" id="deployment-pipeline-detail" aria-live="polite">
            <StepDetail step={activeStep} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/70 px-4 py-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">États du pipeline :</span>
            {STEPS.flatMap((step) => step.statuses.map(({ status }) => (
              <StatusPill key={status} status={status} />
            )))}
          </div>
        </div>
      </div>
    </section>
  )
}
