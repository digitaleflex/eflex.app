import type { LucideIcon } from 'lucide-react'
import { GitBranch, Lock, Rocket, Search } from 'lucide-react'

export type HeroProofItem = {
  icon: LucideIcon
  label: string
}

const DEFAULT_ITEMS: HeroProofItem[] = [
  { icon: GitBranch, label: 'Connexion GitHub' },
  { icon: Search, label: 'Analyse en lecture seule' },
  { icon: Rocket, label: 'Déploiement automatisé' },
  { icon: Lock, label: 'HTTPS automatique' },
]

export function HeroProof({
  items = DEFAULT_ITEMS,
  className = '',
}: {
  items?: HeroProofItem[]
  className?: string
}) {
  return (
    <ul
      className={`mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm text-muted-foreground ${className}`.trim()}
      aria-label="Points de réassurance"
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <li key={item.label} className="inline-flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
