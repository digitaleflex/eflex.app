import type { CSSProperties } from 'react'

const FRAMEWORK_LOGOS: Record<string, string> = {
  nextjs: '/logos/nextjs.svg',
  nuxt: '/logos/nuxt.svg',
  astro: '/logos/astro.svg',
  vite: '/logos/vite.svg',
  svelte: '/logos/svelte.svg',
  remix: '/logos/remix.svg',
  solidstart: '/logos/solidjs.svg',
  redwoodjs: '/logos/redwoodjs.svg',
  node: '/logos/nodejs.svg',
  laravel: '/logos/laravel.svg',
  php: '/logos/php.svg',
  python: '/logos/python.svg',
  static: '/logos/html5.svg',
  docker: '/logos/docker.svg',
  'eflex-config': '/logo-mark.png',
}

/** Composantes RGB de la couleur de marque : sert à teinter la plaque de fond. */
const FRAMEWORK_COLORS: Record<string, string> = {
  nextjs: '0 0 0',
  nuxt: '0 220 130',
  astro: '188 82 238',
  vite: '100 108 255',
  svelte: '255 62 0',
  remix: '0 0 0',
  solidstart: '76 139 245',
  redwoodjs: '191 71 34',
  node: '95 160 78',
  laravel: '255 45 32',
  php: '119 123 180',
  python: '55 118 171',
  static: '227 79 38',
  docker: '36 150 237',
  'eflex-config': '37 99 235',
}

export function FrameworkIcon({
  framework,
  className = 'h-6 w-6',
  alt,
}: {
  framework: string
  className?: string
  alt?: string
}) {
  const src = FRAMEWORK_LOGOS[framework]
  if (!src) return null

  return (
    // Le SVG d'origine reste en couleur ; seule la plaque de fond est teintée.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? framework}
      loading="lazy"
      style={{ '--brand-rgb': FRAMEWORK_COLORS[framework] ?? '100 116 139' } as CSSProperties}
      className={`framework-icon object-contain ${className}`}
    />
  )
}
