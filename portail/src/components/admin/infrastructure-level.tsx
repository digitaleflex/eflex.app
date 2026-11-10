import { Badge } from '@/components/ui/badge'
import { HEALTH_LABELS, type HealthLevel } from '@/lib/infrastructure-health'

const VARIANT: Record<HealthLevel, 'success' | 'warning' | 'destructive' | 'outline'> = {
  ok: 'success',
  warning: 'warning',
  danger: 'destructive',
  unknown: 'outline',
}

/**
 * Pastille d'état. La couleur ne porte jamais seule l'information : le
 * libellé français est toujours affiché (lecteurs d'écran et daltonisme).
 */
export function LevelBadge({ level, className }: { level: HealthLevel; className?: string }) {
  return (
    <Badge variant={VARIANT[level]} className={className}>
      {HEALTH_LABELS[level]}
    </Badge>
  )
}
