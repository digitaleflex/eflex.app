'use client'

import { useState } from 'react'
import { Check, CircleDot, Globe, Lock, Pause, Play } from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'

/**
 * Démonstration visuelle du parcours de déploiement EFLEX.
 *
 * Illustration uniquement : dépôt, adresse et journaux fictifs. Aucune action réelle n'est exécutée.
 * L'animation est en CSS pur (`globals.css`, bloc « Démonstration de déploiement »), figée sous
 * `prefers-reduced-motion`, et un bouton permet de la mettre en pause (WCAG 2.2.2).
 */
const steps = [
  { id: 1, label: 'Dépôt connecté', detail: 'mon-equipe/boutique' },
  { id: 2, label: 'Framework détecté', detail: 'Next.js 15' },
  { id: 3, label: 'Construction', detail: 'pnpm build' },
  { id: 4, label: 'Déploiement', detail: 'Conteneur démarré' },
  { id: 5, label: 'Application en ligne', detail: 'HTTPS actif' },
]

const logs = [
  { step: 1, time: '00:01', text: 'Connexion au dépôt GitHub…' },
  { step: 1, time: '00:02', text: 'Branche détectée : main' },
  { step: 2, time: '00:04', text: 'Framework détecté : Next.js 15 (pnpm)' },
  { step: 3, time: '00:08', text: 'Installation des dépendances…' },
  { step: 3, time: '00:32', text: 'Build terminé avec succès' },
  { step: 4, time: '00:39', text: 'Image construite, démarrage du service…' },
  { step: 4, time: '00:45', text: 'Certificat HTTPS émis automatiquement' },
  { step: 5, time: '00:48', text: 'Application disponible' },
]

function StepIcon({ index }: { index: number }) {
  return (
    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5">
      <span className={`dd-step dd-${index} absolute inset-0 rounded-full bg-success/20`} />
      <Check className={`dd-step dd-${index} relative h-3.5 w-3.5 text-success`} strokeWidth={2.8} aria-hidden="true" />
    </span>
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
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            </span>
            <span className="truncate font-mono text-xs text-white/70 sm:text-sm">Console EFLEX · Déploiement</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70 sm:inline-flex">
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

        <div
          role="img"
          aria-label="Illustration : un projet GitHub est connecté à EFLEX, le framework est détecté, l’application est construite puis déployée avec HTTPS."
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        >
          <div className="border-b border-white/10 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Projet</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <FrameworkIcon framework="nextjs" alt="" className="h-6 w-6 bg-white/90" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-medium text-white">mon-equipe/boutique</p>
                  <p className="text-xs text-white/65">Branche main · Next.js détecté</p>
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-white/55">Étapes du déploiement</p>
            <ol className="mt-4 space-y-3.5">
              {steps.map((step, i) => (
                <li key={step.id} className={`dd-step dd-${i + 1} flex items-center gap-3`}>
                  <StepIcon index={i + 1} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{step.label}</span>
                    <span className="block truncate text-xs text-white/65">{step.detail}</span>
                  </span>
                  <CircleDot className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>

          <div className="flex min-w-0 flex-col p-5 sm:p-6 lg:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Journal de déploiement</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/65">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Secrets masqués
              </span>
            </div>
            <div className="mt-4 flex min-w-0 flex-col gap-2 font-mono text-xs leading-relaxed text-white/80 sm:text-sm">
              {logs.map((line) => (
                <div key={`${line.time}-${line.text}`} className={`dd-step dd-${line.step} truncate`}>
                  <span className="text-eflexsky tabular-nums">{line.time}</span>
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
                <p className="mt-3 truncate font-mono text-sm text-eflexsky sm:text-base">https://boutique.exemple.app</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        Illustration de la console EFLEX : dépôt et adresse fictifs, parcours réel.
      </figcaption>
    </figure>
  )
}
