import type { PlanId } from '@/lib/plans'

export type EnforcementStatus = 'not_enforced' | 'configured' | 'unknown'

export interface ExecutionResourceProfile {
  /** Identifiant stable du profil (actuellement commun à tous les plans). */
  id: string
  label: string
  /** Limite CPU par application, telle qu'appliquée par la plateforme (null = non imposée). */
  cpuLimit: string | null
  /** Limite mémoire par application, telle qu'appliquée par la plateforme (null = non imposée). */
  memoryLimit: string | null
  /** Limite de disque par application, telle qu'appliquée par la plateforme (null = non imposée). */
  diskLimit: string | null
  /** État réel de l'application des limites côté plateforme/hébergement. */
  enforcement: EnforcementStatus
  /** Résumé factuel affichable dans l'interface (français). */
  summary: string
  /** Détails factuels (sources/conditions). */
  details: string[]
  /** Comportement attendu en cas de dépassement des ressources de l'hébergement (factuel). */
  overageBehavior: string[]
  /** Ce qui reste à faire pour une application réelle par plan. */
  remainingWork: string[]
}

const SHARED_HOSTING_PROFILE: ExecutionResourceProfile = {
  id: 'shared-hosting',
  label: 'Hébergement partagé (profil commun)',
  cpuLimit: null,
  memoryLimit: null,
  diskLimit: null,
  enforcement: 'not_enforced',
  summary:
    'Aucune limite CPU, mémoire ou disque par application n’est imposée par le plan dans la plateforme.',
  details: [
    'Les applications s’exécutent sur la capacité de l’hébergement configuré (Coolify/serveur).',
    'Le portail ne configure pas, pour le moment, de quotas CPU/mémoire/disque dédiés par application ni différenciés par plan.',
    'Les relevés CPU/mémoire affichés ailleurs sont des mesures instantanées quand l’hébergement les expose ; ils ne constituent pas une limite appliquée.',
  ],
  overageBehavior: [
    'CPU : en cas de forte contention sur l’hôte, le temps processeur peut être partagé ou réduit (ralentissements possibles). Le comportement exact dépend de la configuration de l’hôte et du moteur de conteneurs.',
    'Mémoire : si un conteneur dépasse la mémoire disponible qui lui est allouée par l’hôte/le moteur, il peut être arrêté (OOM kill) puis redémarré selon la politique de redémarrage. Aucun seuil garanti n’est défini par le plan dans la plateforme.',
    'Disque : en cas de saturation du stockage de l’hôte ou des volumes, les écritures peuvent échouer et l’application peut se dégrader. Le comportement exact dépend de l’infrastructure.',
  ],
  remainingWork: [
    'Définir et appliquer des profils de ressources par plan côté hébergement (Coolify/infra).',
    'Exposer et faire respecter des limites CPU/mémoire/disque par application lorsque l’infrastructure le permet.',
    'Aligner la facturation et l’interface sur les limites réellement configurées et mesurables.',
  ],
}

/** Profil de ressources d’exécution connu pour un plan (factuel, sans prétendre à une application infra). */
export function executionResourcesForPlan(planId: PlanId): ExecutionResourceProfile {
  // Tous les plans partagent aujourd’hui le même profil d’hébergement sans limite
  // dédiée appliquée par la plateforme. La différenciation par plan reste à faire côté infra.
  void planId
  return SHARED_HOSTING_PROFILE
}

/** Indique si un profil différencié par plan est effectivement appliqué (faux aujourd’hui). */
export function hasPerPlanExecutionEnforcement(): boolean {
  return false
}
