export const SUPPORT_CATEGORIES = [
  { value: 'general', label: 'Question générale' },
  { value: 'build', label: 'Build / installation' },
  { value: 'deploy', label: 'Déploiement' },
  { value: 'billing', label: 'Facturation' },
  { value: 'account', label: 'Compte / accès' },
  { value: 'other', label: 'Autre' },
] as const

export const SUPPORT_STATUSES = [
  { value: 'open', label: 'Ouvert' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'waiting_user', label: 'En attente de votre réponse' },
  { value: 'resolved', label: 'Résolu' },
  { value: 'closed', label: 'Fermé' },
] as const

export const SUPPORT_PRIORITIES = [
  { value: 'low', label: 'Faible' },
  { value: 'normal', label: 'Normale' },
  { value: 'high', label: 'Élevée' },
] as const

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]['value']
export type SupportStatus = (typeof SUPPORT_STATUSES)[number]['value']
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number]['value']

export function isSupportCategory(value: string): value is SupportCategory {
  return SUPPORT_CATEGORIES.some((c) => c.value === value)
}
export function isSupportStatus(value: string): value is SupportStatus {
  return SUPPORT_STATUSES.some((s) => s.value === value)
}
export function isSupportPriority(value: string): value is SupportPriority {
  return SUPPORT_PRIORITIES.some((p) => p.value === value)
}

export function supportCategoryLabel(value: string): string {
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value
}
export function supportStatusLabel(value: string): string {
  return SUPPORT_STATUSES.find((s) => s.value === value)?.label ?? value
}
export function supportPriorityLabel(value: string): string {
  return SUPPORT_PRIORITIES.find((p) => p.value === value)?.label ?? value
}
