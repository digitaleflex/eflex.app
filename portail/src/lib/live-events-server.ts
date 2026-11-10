import { redact } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { toEvent } from '@/lib/event-bus'
import type { PlatformEvent } from '@/lib/event-bus'
import type { LiveEvent } from '@/lib/live-events'

/**
 * Côté serveur du terminal d'exploitation : conversion des lignes `Event` en messages
 * sûrs pour le navigateur. Les charges utiles traversent `redact` (mêmes règles que le
 * journal d'audit : aucune clé secrète, textes tronqués) avant d'être envoyées.
 */

export function wireFromEvent(event: PlatformEvent, organizationName: string | null = null): LiveEvent {
  return {
    ...event,
    payload: (redact(event.payload) ?? {}) as Record<string, unknown>,
    organizationName,
  }
}

export function toWireEvent(row: Parameters<typeof toEvent>[0], organizationName: string | null = null): LiveEvent {
  return wireFromEvent(toEvent(row), organizationName)
}

/** Noms des organisations citées par un lot d'événements (une seule requête). */
export async function organizationNames(ids: readonly (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (unique.length === 0) return {}
  const rows = await prisma.organization.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
  return Object.fromEntries(rows.map((row) => [row.id, row.name]))
}
