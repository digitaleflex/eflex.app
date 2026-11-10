import { cn } from '@/lib/utils'

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const

const palette = [
  'bg-primary/10 text-primary',
  'bg-success/10 text-success',
  'bg-info/10 text-info',
  'bg-warning/10 text-warning',
] as const

/** Initiales : deux mots maximum, accents conservés (« Élodie Martin » → « ÉM »). */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]!.charAt(0)
  const second = words.length > 1 ? words[words.length - 1]!.charAt(0) : ''
  return (first + second).toLocaleUpperCase('fr-FR')
}

const hash = (value: string): number => {
  let total = 0
  for (let i = 0; i < value.length; i += 1) total = (total * 31 + value.charCodeAt(i)) % 997
  return total
}

type AvatarProps = {
  name: string
  src?: string | null
  size?: keyof typeof sizes
  /** L'avatar accompagne déjà le nom : il ne doit pas être annoncé deux fois. */
  decorative?: boolean
  className?: string
}

export function Avatar({ name, src, size = 'md', decorative = false, className }: AvatarProps) {
  const label = decorative ? undefined : name
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill font-semibold',
        sizes[size],
        !src && palette[hash(name) % palette.length],
        className
      )}
      role={decorative ? undefined : 'img'}
      aria-label={label}
      aria-hidden={decorative || undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar distant, taille connue, pas d'optimiseur Next
        <img src={src} alt={decorative ? '' : name} width={48} height={48} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden={decorative || undefined}>{initials(name)}</span>
      )}
    </span>
  )
}
