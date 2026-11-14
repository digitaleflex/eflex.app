'use client'

import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'

/**
 * Technologies de l'accueil, en défilé continu sur deux rangées.
 *
 * Sans `soon`, la technologie est réellement reconnue par le détecteur (`packages/detector`) ou prise en
 * charge par le portail (GitHub). Avec `soon: true`, elle est annoncée mais pas encore disponible et
 * porte la pastille « Bientôt » : retirer le drapeau seulement quand le détecteur la gère.
 *
 * Accessibilité : la liste complète est lue une seule fois (la copie qui assure la boucle est
 * `aria-hidden`), le défilé s'arrête au survol, au focus et avec le bouton pause (WCAG 2.2.2), et
 * `prefers-reduced-motion` l'affiche à plat (`globals.css`, bloc « Défilé des technologies »).
 */
export const STACKS: { id: string; name: string; soon?: boolean }[] = [
  { id: 'nextjs', name: 'Next.js' },
  { id: 'node', name: 'Node.js' },
  { id: 'astro', name: 'Astro' },
  { id: 'laravel', name: 'Laravel' },
  { id: 'python', name: 'Python' },
  { id: 'php', name: 'PHP' },
  { id: 'vite', name: 'Vite' },
  { id: 'nuxt', name: 'Nuxt' },
  { id: 'react', name: 'React', soon: true },
  { id: 'go', name: 'Go', soon: true },
  { id: 'svelte', name: 'SvelteKit' },
  { id: 'remix', name: 'Remix' },
  { id: 'solidstart', name: 'SolidStart' },
  { id: 'redwoodjs', name: 'RedwoodJS' },
  { id: 'docker', name: 'Docker' },
  { id: 'static', name: 'HTML statique' },
  { id: 'github', name: 'GitHub' },
  { id: 'tailwind', name: 'Tailwind CSS', soon: true },
  { id: 'gitlab', name: 'GitLab', soon: true },
  { id: 'bitbucket', name: 'Bitbucket', soon: true },
]

const half = Math.ceil(STACKS.length / 2)
const rows = [STACKS.slice(0, half), STACKS.slice(half)]

function Pill({ stack }: { stack: (typeof STACKS)[number] }) {
  return (
    <span className="inline-flex h-14 shrink-0 items-center gap-3 whitespace-nowrap rounded-full border border-border bg-card px-5 text-base font-semibold text-foreground">
      <FrameworkIcon framework={stack.id} alt="" className="h-7 w-7 p-1" />
      {stack.name}
      {stack.soon && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Bientôt</span>
      )}
    </span>
  )
}

export function TechMarquee() {
  const [paused, setPaused] = useState(false)

  return (
    <div className="space-y-6">
      <div className="tech-marquee space-y-3" data-paused={paused}>
        {rows.map((row, index) => (
          <div key={index} className="tech-marquee-row overflow-hidden">
            <div className={`tech-marquee-track flex w-max gap-3 ${index === 1 ? 'tech-marquee-reverse' : ''}`}>
              <ul className="flex shrink-0 gap-3" aria-label={index === 0 ? 'Technologies prises en charge' : undefined}>
                {row.map((stack) => (
                  <li key={stack.id}>
                    <Pill stack={stack} />
                  </li>
                ))}
              </ul>
              {/* Copie pour une boucle sans à-coup : invisible pour les lecteurs d'écran. */}
              <ul aria-hidden="true" className="tech-marquee-copy flex shrink-0 gap-3">
                {row.map((stack) => (
                  <li key={stack.id}>
                    <Pill stack={stack} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          {paused ? 'Reprendre le défilé' : 'Mettre le défilé en pause'}
        </button>
      </div>
    </div>
  )
}
