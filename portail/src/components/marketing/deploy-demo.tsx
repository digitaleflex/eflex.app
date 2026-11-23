'use client'

import { useState } from 'react'
import {
  Check,
  FileCode2,
  GitBranch,
  Globe,
  Lock,
  Pause,
  Play,
  Search,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'

/**
 * Démonstration visuelle du parcours de déploiement EFLEX.
 *
 * Illustration uniquement : dépôt, adresse, journaux et artefacts fictifs. Aucune action réelle
 * n'est exécutée. L'animation est en CSS pur (`globals.css`, bloc « Démonstration de déploiement »),
 * figée sous `prefers-reduced-motion`, et un bouton permet de la mettre en pause (WCAG 2.2.2).
 */
const DEPLOYMENT_STATES = [
  { id: 'queued', label: 'En attente' },
  { id: 'analyzing', label: 'Analyse' },
  { id: 'provisioning', label: 'Provisionnement' },
  { id: 'building', label: 'Construction' },
  { id: 'deploying', label: 'Déploiement' },
  { id: 'live', label: 'En ligne' },
] as const

const STEPS = [
  { id: 1, label: 'Dépôt connecté', detail: 'mon-equipe/boutique · branche main', icon: GitBranch },
  { id: 2, label: 'Analyse en lecture seule', detail: 'Next.js 15 · Node.js 22 · pnpm', icon: Search },
  { id: 3, label: 'BuildPlan validé', detail: 'Port 3000 · commande de démarrage prête', icon: FileCode2 },
  { id: 4, label: 'Construction', detail: 'Image applicative construite', icon: Server },
  { id: 5, label: 'Mise en ligne', detail: 'Hébergement EFLEX · HTTPS actif', icon: ShieldCheck },
] as const

const LOGS = [
  { step: 1, state: 'queued', time: '00:01', text: 'Déploiement créé et placé en file d’attente' },
  { step: 1, state: 'analyzing', time: '00:03', text: 'Lecture du dépôt mon-equipe/boutique (lecture seule)' },
  { step: 2, state: 'analyzing', time: '00:05', text: 'Framework détecté : Next.js 15 · Node.js 22 · pnpm' },
  { step: 3, state: 'provisioning', time: '00:08', text: 'BuildPlan généré : port 3000, build pnpm, démarrage next start' },
  { step: 4, state: 'building', time: '00:14', text: 'Construction de l’image applicative…' },
  { step: 4, state: 'building', time: '00:36', text: 'Build terminé avec succès' },
  { step: 5, state: 'deploying', time: '00:42', text: 'Déploiement sur l’hébergement EFLEX…' },
  { step: 5, state: 'live', time: '00:48', text: 'Application disponible avec HTTPS actif' },
] as const

function StepIcon({ index }: { index: number }) {
  return (
    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5">
      <span className={`dd-step dd-${index} absolute inset-0 rounded-full bg-success/20`} />
      <Check className={`dd-step dd-${index} relative h-3.5 w-3.5 text-success`} strokeWidth={2.8} aria-hidden="true" />
    </span>
  )
}

function StatePill({ index, label }: { index: number; label: string }) {
  return (
    <li className={`dd-state dd-state-${index} rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70`}>
      {label}
    </li>
  )
}

export function DeployDemo() {
  const [paused, setPaused] = useState(false)

  return (
    <figure className="mx-auto mt-12 w-full max-w-5xl text-left md:mt-14">
      <div
        className="deploy-demo surface-navy relative overflow-hidden rounded-3xl border border-white/10 bg-eflexnavy text-white shadow-2xl shadow-eflexnavy/20"
        data-paused={paused}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-white/70 sm:text-sm">EFLEX · boutique-web</p>
              <p className="truncate text-xs text-white/55">Branche main · déploiement illustratif</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full border border-eflexsky/35 bg-eflexsky/10 px-2.5 py-1 text-xs font-medium text-eflexsky">
              Démonstration
            </span>
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              <span className="sr-only">{paused ? 'Reprendre l’animation' : 'Mettre l’animation en pause'}</span>
            </button>
          </div>
        </div>

        <div aria-hidden="true" className="h-[3px] bg-white/10">
          <div className="dd-bar h-full bg-eflexsky" />
        </div>

        <div className="border-b border-white/10 px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/55">États de déploiement documentés</p>
          <ol className="mt-2 flex flex-wrap gap-2" aria-label="Progression des états de déploiement">
            {DEPLOYMENT_STATES.map((state, index) => (
              <StatePill key={state.id} index={index + 1} label={state.label} />
            ))}
          </ol>
        </div>

        <div
          role="img"
          aria-label="Illustration : un dépôt GitHub est analysé en lecture seule, un BuildPlan est préparé, puis l’application passe par les états en attente, analyse, provisionnement, construction, déploiement et en ligne."
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        >
          <div className="border-b border-white/10 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Projet détecté</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <FrameworkIcon framework="nextjs" alt="" className="h-6 w-6 bg-white/90" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium text-white">mon-equipe/boutique</p>
                  <p className="text-xs text-white/65">Next.js 15 · Node.js 22 · pnpm · port 3000</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-white/55">BuildPlan</p>
                  <p className="mt-1 font-medium text-white">Prêt à valider</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <p className="text-white/55">Analyse</p>
                  <p className="mt-1 font-medium text-white">Lecture seule</p>
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-white/55">Parcours illustré</p>
            <ol className="mt-4 space-y-3.5">
              {STEPS.map((step, i) => {
                const Icon = step.icon
                return (
                  <li key={step.id} className={`dd-step dd-${i + 1} flex items-center gap-3`}>
                    <StepIcon index={i + 1} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Icon className="h-4 w-4 text-white/55" aria-hidden="true" />
                        {step.label}
                      </span>
                      <span className="block truncate text-xs text-white/65">{step.detail}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="flex min-w-0 flex-col p-5 sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Journal de déploiement</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/65">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Secrets masqués
              </span>
            </div>
            <div className="mt-4 flex min-w-0 flex-col gap-2 font-mono text-xs leading-relaxed text-white/80 sm:text-sm">
              {LOGS.map((line) => (
                <div key={`${line.time}-${line.text}`} className={`dd-step dd-${line.step} truncate`}>
                  <span className="text-eflexsky tabular-nums">{line.time}</span>
                  {'  '}
                  <span className="text-white/55">[{line.state}]</span>
                  {'  '}
                  {line.text}
                </div>
              ))}
            </div>

            <div className="dd-url mt-auto pt-6">
              <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    En ligne
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-white/70">
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    Adresse de démonstration
                  </span>
                </div>
                <p className="mt-3 truncate font-mono text-sm text-eflexsky sm:text-base">https://boutique.demo.eflex.app</p>
                <p className="mt-2 text-xs text-white/65">Résultat illustratif · aucune application réelle déployée.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        Démonstration visuelle : dépôt, états et adresse fictifs. Le parcours reflète les états de déploiement documentés par EFLEX.
      </figcaption>
    </figure>
  )
}
