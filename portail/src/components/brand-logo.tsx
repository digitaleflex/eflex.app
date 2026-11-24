import Image from 'next/image'

/**
 * Logo EFLEX (charte : docs/brand/README.md). Deux versions officielles seulement :
 * couleur (fonds clairs) et inversée blanche (fonds sombres). Jamais de filtre CSS ni de plaque.
 *
 * Thème clair unique (issue #220) :
 * - `tone="auto"` (défaut) ou `"light"` : fond clair → version couleur seule.
 * - `tone="dark"` : surface navy locale (panneau, bande) → version inversée seule.
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
  if (tone === 'dark') return <Image src={source.dark} alt={alt} className={className} {...common} />
  return <Image src={source.light} alt={alt} className={className} {...common} />
}
