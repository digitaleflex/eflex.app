import { cn } from '@/lib/utils'

const localFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const utcFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'long',
  timeZone: 'UTC',
})

/**
 * Date en heure locale, avec l'heure UTC complète au survol (exigence #27).
 * Le composant est volontairement serveur : aucune hydratation pour une date.
 */
export function TimeFr({
  value,
  className,
  dateOnly = false,
}: {
  value: Date | string | null | undefined
  className?: string
  dateOnly?: boolean
}) {
  if (!value) return <span className={className}>—</span>
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return <span className={className}>—</span>
  return (
    <time
      dateTime={date.toISOString()}
      title={`${utcFormat.format(date)} (UTC)`}
      className={cn('tabular-nums', className)}
    >
      {dateOnly
        ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date)
        : localFormat.format(date)}
    </time>
  )
}
