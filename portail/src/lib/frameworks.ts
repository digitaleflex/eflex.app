// Libellés affichables des stacks et runtimes produits par le détecteur.
// Fonctions pures, sans dépendance : utilisables côté serveur comme côté client.

const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: 'Next.js',
  nuxt: 'Nuxt',
  astro: 'Astro',
  vite: 'Vite',
  svelte: 'SvelteKit',
  remix: 'Remix',
  solidstart: 'SolidStart',
  redwoodjs: 'RedwoodJS',
  node: 'Node.js',
  laravel: 'Laravel',
  php: 'PHP',
  python: 'Python',
  static: 'Site statique',
  docker: 'Dockerfile',
  compose: 'Docker Compose',
  'eflex-config': 'eflex.json',
}

export function frameworkLabel(framework: string | null | undefined): string {
  if (!framework) return 'Inconnue'
  return FRAMEWORK_LABELS[framework] ?? framework
}

const RUNTIME_LABELS: Record<string, string> = {
  node: 'Node.js',
  php: 'PHP',
  python: 'Python',
  static: 'Statique',
  docker: 'Docker',
}

/** « node@22 » → « Node.js 22 », « static@1 » → « Statique ». */
export function runtimeLabel(runtime: string): string {
  const [name = '', version = ''] = runtime.split('@')
  const label = RUNTIME_LABELS[name] ?? name
  return name === 'static' || name === 'docker' || version === '' ? label : `${label} ${version}`
}

export type ConfidenceLevel = { label: string; tone: 'success' | 'default' | 'warning' }

/** Niveau de confiance en toutes lettres : la couleur ne doit pas porter seule l'information. */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return { label: 'Confiance élevée', tone: 'success' }
  if (confidence >= 0.7) return { label: 'Confiance correcte', tone: 'default' }
  return { label: 'À vérifier', tone: 'warning' }
}
