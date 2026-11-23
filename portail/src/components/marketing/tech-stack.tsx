import type { CSSProperties } from 'react'
import { Database } from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'

type TechItem = {
  id: string
  name: string
  description: string
  status: 'supported' | 'soon' | 'conditional'
  note?: string
}

type TechCategory = {
  title: string
  description: string
  items: TechItem[]
}

const categories: TechCategory[] = [
  {
    title: 'Frameworks et applications',
    description: 'Applications web et sites détectés automatiquement.',
    items: [
      { id: 'nextjs', name: 'Next.js', description: 'Applications React avec rendu serveur ou hybride.', status: 'supported' },
      { id: 'nuxt', name: 'Nuxt', description: 'Applications Vue avec détection automatique.', status: 'supported' },
      { id: 'astro', name: 'Astro', description: 'Sites rapides orientés contenu.', status: 'supported' },
      { id: 'vite', name: 'Vite', description: 'Applications front-end construites avec Vite.', status: 'supported' },
      { id: 'svelte', name: 'SvelteKit', description: 'Applications SvelteKit prises en charge.', status: 'supported' },
      { id: 'remix', name: 'Remix', description: 'Applications Remix détectées automatiquement.', status: 'supported' },
      { id: 'solidstart', name: 'SolidStart', description: 'Applications SolidStart prises en charge.', status: 'supported' },
      { id: 'redwoodjs', name: 'RedwoodJS', description: 'Applications RedwoodJS détectées.', status: 'supported' },
      { id: 'react', name: 'React', description: 'Détection dédiée en cours d’évolution.', status: 'soon', note: 'Bientôt' },
    ],
  },
  {
    title: 'Langages et environnements',
    description: 'Runtimes et langages utilisés par vos projets.',
    items: [
      { id: 'node', name: 'Node.js', description: 'Serveurs Node.js, API et applications JavaScript.', status: 'supported' },
      { id: 'php', name: 'PHP', description: 'Applications PHP compatibles avec la détection EFLEX.', status: 'supported' },
      { id: 'laravel', name: 'Laravel', description: 'Reconnu ; certains cas multi-services demandent un compose.', status: 'conditional', note: 'Selon configuration' },
      { id: 'python', name: 'Python', description: 'Django, FastAPI, Flask et applications Python.', status: 'supported' },
      { id: 'go', name: 'Go', description: 'Prise en charge prévue.', status: 'soon', note: 'Bientôt' },
    ],
  },
  {
    title: 'Outils et intégrations',
    description: 'Formats de déploiement et intégrations compatibles.',
    items: [
      { id: 'github', name: 'GitHub', description: 'Connexion du dépôt et déploiements depuis GitHub.', status: 'supported' },
      { id: 'docker', name: 'Docker', description: 'Dockerfile ou Docker Compose utilisé tel quel.', status: 'supported' },
      { id: 'static', name: 'HTML statique', description: 'Sites statiques publiés simplement.', status: 'supported' },
      { id: 'gitlab', name: 'GitLab', description: 'Intégration prévue.', status: 'soon', note: 'Bientôt' },
      { id: 'bitbucket', name: 'Bitbucket', description: 'Intégration prévue.', status: 'soon', note: 'Bientôt' },
    ],
  },
  {
    title: 'Services de données',
    description: 'Bases de données managées disponibles selon la configuration du projet.',
    items: [
      { id: 'postgresql', name: 'PostgreSQL', description: 'Base PostgreSQL managée, créée et reliée au projet.', status: 'supported', note: 'Disponible' },
      { id: 'redis', name: 'Redis', description: 'Instance Redis managée pour le cache ou les files.', status: 'supported', note: 'Disponible' },
    ],
  },
]

const statusStyles: Record<TechItem['status'], string> = {
  supported: 'bg-success/10 text-success',
  conditional: 'bg-warning/10 text-warning',
  soon: 'bg-primary/10 text-primary',
}

const statusLabels: Record<TechItem['status'], string> = {
  supported: 'Pris en charge',
  conditional: 'Selon configuration',
  soon: 'Bientôt',
}

function TechIcon({ id, name }: { id: string; name: string }) {
  const icon = FrameworkIcon({ framework: id, alt: '', className: 'h-10 w-10 shrink-0 p-1.5' })
  if (icon) return icon
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Database className="h-5 w-5" aria-hidden="true" />
      <span className="sr-only">{name}</span>
    </span>
  )
}

function TechCard({ item, index }: { item: TechItem; index: number }) {
  const label = item.note ?? statusLabels[item.status]
  return (
    <li
      className="group relative rounded-2xl border border-border bg-card p-4 transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm focus-within:border-primary/25 focus-within:shadow-sm"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start gap-3">
        <TechIcon id={item.id} name={item.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{item.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyles[item.status]}`}>
              {label}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
      </div>
    </li>
  )
}

export function TechStack() {
  return (
    <div className="mt-12 space-y-10 md:mt-14">
      {categories.map((category) => (
        <div key={category.title}>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">{category.title}</h3>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {category.items.map((item, index) => (
              <TechCard key={item.id} item={item} index={index} />
            ))}
          </ul>
        </div>
      ))}
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Vous pouvez aussi déployer un projet avec un <code className="font-mono text-xs">Dockerfile</code>, un{' '}
        <code className="font-mono text-xs">docker-compose.yml</code> ou un <code className="font-mono text-xs">eflex.json</code>.
        La compatibilité dépend de la configuration réelle du projet.
      </p>
    </div>
  )
}
