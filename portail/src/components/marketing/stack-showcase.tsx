'use client'

import { useId, useState } from 'react'
import { FrameworkIcon } from '@/components/framework-icon'

/**
 * Technologies de l'accueil. Sans `soon`, la technologie est réellement reconnue par le détecteur
 * (`packages/detector`) ou prise en charge par le portail (GitHub). Avec `soon: true`, elle est
 * annoncée mais pas encore disponible et la tuile porte la pastille « Bientôt » : retirer le
 * drapeau seulement quand le détecteur la gère. Logos : SVG de marque en couleur, jamais de
 * filtre monochrome.
 */
const CATEGORIES = ['Full-stack', 'Frontend', 'Backend', 'Langage', 'Outils', 'Intégration'] as const
type Category = (typeof CATEGORIES)[number]

const FILTERS: { id: 'all' | Category; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'Full-stack', label: 'Full-stack' },
  { id: 'Frontend', label: 'Frontend' },
  { id: 'Backend', label: 'Backend' },
  { id: 'Langage', label: 'Langages' },
  { id: 'Outils', label: 'Outils' },
  { id: 'Intégration', label: 'Intégrations' },
]

const STACKS: { id: string; name: string; category: Category; soon?: boolean }[] = [
  { id: 'nextjs', name: 'Next.js', category: 'Full-stack' },
  { id: 'nuxt', name: 'Nuxt', category: 'Full-stack' },
  { id: 'remix', name: 'Remix', category: 'Full-stack' },
  { id: 'solidstart', name: 'SolidStart', category: 'Full-stack' },
  { id: 'svelte', name: 'SvelteKit', category: 'Full-stack' },
  { id: 'redwoodjs', name: 'RedwoodJS', category: 'Full-stack' },
  { id: 'astro', name: 'Astro', category: 'Frontend' },
  { id: 'vite', name: 'Vite', category: 'Frontend' },
  { id: 'static', name: 'HTML', category: 'Frontend' },
  { id: 'node', name: 'Node.js', category: 'Backend' },
  { id: 'laravel', name: 'Laravel', category: 'Backend' },
  { id: 'php', name: 'PHP', category: 'Langage' },
  { id: 'python', name: 'Python', category: 'Langage' },
  { id: 'docker', name: 'Docker', category: 'Outils' },
  { id: 'react', name: 'React', category: 'Frontend', soon: true },
  { id: 'tailwind', name: 'Tailwind CSS', category: 'Frontend', soon: true },
  { id: 'go', name: 'Go', category: 'Langage', soon: true },
  { id: 'github', name: 'GitHub', category: 'Intégration' },
  { id: 'gitlab', name: 'GitLab', category: 'Intégration', soon: true },
  { id: 'bitbucket', name: 'Bitbucket', category: 'Intégration', soon: true },
]

export function StackShowcase() {
  const [filter, setFilter] = useState<'all' | Category>('all')
  const statusId = useId()
  const visible = STACKS.filter((stack) => filter === 'all' || stack.category === filter)

  return (
    <div>
      <div role="group" aria-label="Filtrer par catégorie" className="flex flex-wrap justify-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            aria-describedby={statusId}
            onClick={() => setFilter(item.id)}
            className={
              filter === item.id
                ? 'inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy'
                : 'inline-flex min-h-11 items-center rounded-xl border border-white/25 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy'
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      <p id={statusId} role="status" className="sr-only">
        {visible.length} {visible.length > 1 ? 'technologies affichées' : 'technologie affichée'}
      </p>

      <ul className="stacks-grid mt-8 flex flex-wrap justify-center gap-3">
        {visible.map((stack, i) => (
          <li
            key={stack.id}
            style={{ '--i': i } as React.CSSProperties}
            className="flex basis-[calc(50%-0.375rem)] flex-col items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-5 text-center ring-1 ring-white/10 transition-colors duration-200 ease-out-expo hover:bg-white/[0.09] sm:basis-[calc((100%-2.25rem)/4)] lg:basis-[calc((100%-4.5rem)/7)]"
          >
            <FrameworkIcon framework={stack.id} alt="" className="h-9 w-9" />
            <span className="text-sm font-semibold text-white">{stack.name}</span>
            <span className="flex flex-wrap justify-center gap-1.5">
              <span className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-xs text-white/80">
                {stack.category}
              </span>
              {stack.soon && (
                <span className="rounded-md border border-eflexsky/50 px-2 py-0.5 text-xs font-medium text-eflexsky">
                  Bientôt
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
