'use client'

import { useEvents } from '@/hooks/events-provider'

/**
 * Si l'utilisateur est retiré de l'organisation qu'il consulte, on recharge le tableau de bord :
 * le serveur le replace sur une organisation à laquelle il appartient encore.
 */
export function MembershipWatcher() {
  useEvents(['membership.revoked'], () => window.location.assign('/dashboard'))
  return null
}
