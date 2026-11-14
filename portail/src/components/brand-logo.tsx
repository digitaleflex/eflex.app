import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Logo EFLEX (charte : docs/brand/README.md). Deux versions officielles seulement :
 * couleur (fonds clairs) et inversée blanche (fonds sombres). Jamais de filtre CSS ni de plaque.
 *
 * - `tone="auto"` : suit le thème. Les deux images sont rendues et la feuille de style n'en montre
 *   qu'une (`.brand-logo-on-light` / `.brand-logo-on-dark` dans globals.css), y compris sur les pages
 *   forcées en clair (`.homepage-light`) quand le thème global est sombre.
 * - `tone="dark"` : fond toujours sombre (panneau navy) → version inversée seule.
 * - `tone="light"` : fond toujours clair → version couleur seule.
 */
const SOURCES = {
  horizontal: { light: '/logo-horizontal.webp', dark: '/logo-horizontal-inverse.webp', width: 1200, height: 312 },
  mark: { light: '/logo-mark.png', dark: '/logo-mark-inverse.png', width: 512, height: 512 },
} as const

export function BrandLogo({
  variant = 'horizontal',
  tone = 'auto',
  alt = 'EFLEX',
  className,
  priority = false,
}: {
  variant?: keyof typeof SOURCES
  tone?: 'auto' | 'light' | 'dark'
  alt?: string
  className?: string
  priority?: boolean
}) {
  const source = SOURCES[variant]
  const common = { width: source.width, height: source.height, priority }
  if (tone === 'light') return <Image src={source.light} alt={alt} className={className} {...common} />
  if (tone === 'dark') return <Image src={source.dark} alt={alt} className={className} {...common} />
  return (
    <>
      <Image src={source.light} alt={alt} className={cn('brand-logo-on-light', className)} {...common} />
      {/* Une seule des deux images est affichée (l'autre est en display: none, donc absente de l'arbre
          d'accessibilité) : même texte alternatif pour que le lien garde son nom dans les deux thèmes. */}
      <Image src={source.dark} alt={alt} className={cn('brand-logo-on-dark', className)} {...common} />
    </>
  )
}
