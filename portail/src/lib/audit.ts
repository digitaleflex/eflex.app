import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { publish } from '@/lib/event-bus'

/** Clés qui ne doivent jamais entrer dans le journal, quelle que soit leur profondeur. */
const SECRET_KEY = /pass(word)?|secret|token|cookie|authorization|api[-_]?key|value|credential/i

/** Retire récursivement toute valeur dont la clé ressemble à un secret. */
export function redact(input: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'string') return input.length > 500 ? `${input.slice(0, 500)}…` : input
  if (typeof input === 'number' || typeof input === 'boolean') return input
  if (depth > 4) return '[profondeur max]'
  if (Array.isArray(input)) return input.slice(0, 50).map((v) => redact(v, depth + 1)) as Prisma.InputJsonValue
  if (typeof input === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[masqué]' : redact(v, depth + 1)
    }
    return out as Prisma.InputJsonValue
  }
  return String(input)
}

export type AuditEntry = {
  actor: { id: string; email: string }
  action: string
  target: { type: string; id: string }
  organizationId?: string | null
  details?: unknown
  request?: Request
}

/** Écrit une entrée d'audit. À appeler pour **chaque** action d'administration. */
export async function audit(entry: AuditEntry): Promise<void> {
  const headers = entry.request?.headers
  const created = await prisma.auditLog.create({
    data: {
      actorId: entry.actor.id,
      actorEmail: entry.actor.email,
      action: entry.action,
      targetType: entry.target.type,
      targetId: entry.target.id,
      organizationId: entry.organizationId ?? null,
      details: (redact(entry.details) ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: headers?.get('user-agent')?.slice(0, 300) ?? null,
    },
  })  // Les administrateurs voient l'action apparaître en direct (journal d'audit, terminal d'exploitation).
  await publish({ type: 'audit.entry', audience: 'admin', payload: { auditId: created.id, action: entry.action, targetType: entry.target.type } })
}
