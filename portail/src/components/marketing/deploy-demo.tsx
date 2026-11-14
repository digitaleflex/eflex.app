'use client'

import { useState } from 'react'
import { Check, Pause, Play } from 'lucide-react'

/**
 * Démonstration animée de la hero : un déploiement se déroule en boucle (10 s), étape par étape,
 * jusqu'à une adresse HTTPS en ligne.
 *
 * Règles : c'est une ILLUSTRATION (la légende le dit), rien n'est exécuté, le dépôt et l'adresse sont
 * fictifs. L'animation est en CSS pur (`globals.css`, bloc « Démonstration de déploiement »), coupée
 * sous `prefers-reduced-motion`, et un bouton permet de la mettre en pause (WCAG 2.2.2).
 */
const steps = [
  { title: 'Dépôt connecté', detail: 'GitHub · branche main' },
  { title: 'Stack reconnue', detail: 'Next.js · pnpm · port 3000' },
  { title: 'Application construite', detail: 'Image prête' },
  { title: 'Certificat HTTPS', detail: 'Émis automatiquement' },
  { title: 'En ligne', detail: 'Mise à jour à chaque push' },
]

const logs = [
  { step: 1, time: '00:01', text: 'Clonage du dépôt' },
  { step: 2, time: '00:03', text: 'Détecté : Next.js 15, pnpm' },
  { step: 3, time: '00:41', text: 'pnpm install && pnpm build' },
  { step: 3, time: '01:28', text: 'Build terminé' },
  { step: 4, time: '01:39', text: 'Certificat TLS valide' },
  { step: 5, time: '01:42', text: 'Application démarrée' },
]

export function DeployDemo() {
  const [paused, setPaused] = useState(false)

  return (
    <figure className="mx-auto mt-16 w-full max-w-5xl text-left">
      <div className="deploy-demo surface-navy relative overflow-hidden rounded-3xl bg-eflexnavy text-white shadow-2xl shadow-eflexnavy/25" data-paused={paused}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
          </span>
          <span aria-hidden="true" className="truncate font-mono text-xs text-white/75 sm:text-sm">
            mon-equipe/boutique · main
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
        <div aria-hidden="true" className="h-[3px] bg-white/10">
          <div className="dd-bar h-full bg-eflexsky" />
        </div>

        <div
          role="img"
          aria-label="Illustration : un dépôt GitHub est déployé par EFLEX, étape par étape, jusqu’à une adresse HTTPS en ligne."
          className="grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
        >
          <ol aria-hidden="true" className="space-y-4 border-b border-white/10 p-6 md:border-b-0 md:border-r md:p-7">
            {steps.map((step, i) => (
              <li key={step.title} className={`dd-step dd-${i + 1} flex items-center gap-3.5`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-eflexblue/20">
                  <Check className="h-4 w-4 text-eflexsky" strokeWidth={2.6} />
                </span>
                <span>
                  <span className="block text-sm font-semibold sm:text-base">{step.title}</span>
                  <span className="block text-xs text-white/75 sm:text-sm">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          <div aria-hidden="true" className="flex min-w-0 flex-col gap-2 p-6 font-mono text-xs leading-relaxed text-white/80 sm:text-sm md:p-7">
            {logs.map((line) => (
              <div key={line.time} className={`dd-step dd-${line.step} truncate`}>
                <span className="text-eflexsky">{line.time}</span>
                {'  '}
                {line.text}
              </div>
            ))}
            <div className="dd-url mt-auto pt-4">
              <span className="inline-flex max-w-full items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 font-sans">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
                <span className="text-sm font-bold sm:text-base">En ligne</span>
                <span className="truncate font-mono text-sm text-eflexsky">https://boutique.exemple.app</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        Illustration : dépôt et adresse fictifs.
      </figcaption>
    </figure>
  )
}
