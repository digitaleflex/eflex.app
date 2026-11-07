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
    // eslint-disable-next-line @next/next/no-img-element
    // Sur fond sombre, les logos de marque foncés redeviennent lisibles.
    <img
      src={src}
      alt={alt ?? framework}
      loading="lazy"
      className={`object-contain dark:rounded-md dark:bg-white/95 ${className}`}
    />
  )
}
