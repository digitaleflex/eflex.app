import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive'

/**
 * Statuts connus du portail : libellé français et tonalité sémantique.
 * Les statuts inconnus restent affichables (texte fourni par l'appelant).
 */
export const STATUS_LABELS = {
  active: { label: 'Actif', tone: 'success' },
  inactive: { label: 'Inactif', tone: 'neutral' },
  suspended: { label: 'Suspendu', tone: 'destructive' },
  pending: { label: 'En attente', tone: 'warning' },
  queued: { label: 'En file', tone: 'info' },
  analyzing: { label: 'Analyse', tone: 'info' },
  provisioning: { label: 'Préparation', tone: 'info' },
  running: { label: 'En cours', tone: 'info' },
  building: { label: 'En construction', tone: 'info' },
  deploying: { label: 'Déploiement', tone: 'info' },
  live: { label: 'En ligne', tone: 'success' },
  failed: { label: 'Échec', tone: 'destructive' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
  degraded: { label: 'Dégradé', tone: 'warning' },
  down: { label: 'Indisponible', tone: 'destructive' },
  verified: { label: 'Vérifié', tone: 'success' },
  unverified: { label: 'Non vérifié', tone: 'warning' },
  unknown: { label: 'Inconnu', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: StatusTone }>

export type KnownStatus = keyof typeof STATUS_LABELS

const toneVariant: Record<StatusTone, BadgeVariant> = {
  neutral: 'outline',
  info: 'info',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
}

type StatusBadgeProps = {
  /** Statut technique ; un libellé français est choisi automatiquement s'il est connu. */
  status: string
  /** Libellé explicite si le statut n'est pas dans la table ou doit être précisé. */
  label?: string
  tone?: StatusTone
  /** Pastille de couleur : information redondante avec le texte, masquée aux lecteurs d'écran. */
  dot?: boolean
  /** Complément natif (ex. motif de suspension), en plus du libellé. */
  title?: string
  className?: string
}

export function StatusBadge({ status, label, tone, dot = true, title, className }: StatusBadgeProps) {
  const preset = (STATUS_LABELS as Record<string, { label: string; tone: StatusTone } | undefined>)[status]
  const resolvedTone = tone ?? preset?.tone ?? 'neutral'
  return (
    <Badge variant={toneVariant[resolvedTone]} className={cn('gap-1.5', className)} title={title}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-pill bg-current" />}
      {label ?? preset?.label ?? status}
    </Badge>
  )
}
