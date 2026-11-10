import { unstable_cache } from 'next/cache'
import { loadAdminMetrics } from '@/lib/admin-metrics-data'
import type { PeriodDays } from '@/lib/admin-metrics'

/**
 * Cache court (30 s) des agrégats : le tableau de bord peut être ouvert par
 * plusieurs administrateurs sans multiplier les requêtes. Le CSV, lui, relit la
 * base pour rester cohérent avec l'instant de l'export.
 */
export const loadAdminMetricsCached = unstable_cache(
  async (days: PeriodDays) => loadAdminMetrics(days),
  ['admin-metrics'],
  { revalidate: 30 },
)
