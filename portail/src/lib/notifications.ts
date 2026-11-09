import { prisma } from '@/lib/prisma'
import { publish } from '@/lib/event-bus'

/** Types de notification connus, avec le libellé affiché dans les préférences. */
export const NOTIFICATION_TYPES = {
  'deployment.succeeded': { label: 'Déploiement réussi', description: 'Quand un déploiement de votre organisation est en ligne.' },
  'deployment.failed': { label: 'Déploiement en échec', description: 'Quand un déploiement échoue, avec un lien vers les journaux.' },
  'invitation.received': { label: 'Invitation reçue', description: "Quand quelqu'un vous invite à rejoindre une organisation." },
  'member.joined': { label: 'Nouveau membre', description: 'Quand une personne rejoint une de vos organisations (propriétaires et administrateurs).' },
  'membership.removed': { label: 'Retrait d’une organisation', description: 'Quand vous êtes retiré d’une organisation.' },
} as const

export type NotificationType = keyof typeof NOTIFICATION_TYPES
export const isNotificationType = (value: string): value is NotificationType => value in NOTIFICATION_TYPES

export type NotifyInput = {
  userIds: readonly string[]
  type: NotificationType
  title: string
  body?: string
  /** Chemin interne (commence par « / »). */
  href?: string
  organizationId?: string | null
  /** Rend l'envoi idempotent par utilisateur. */
  dedupeKey?: string
}

/**
 * Crée une notification pour chaque destinataire qui ne l'a pas désactivée, puis la pousse en
 * direct. Jamais bloquant pour l'action métier : une erreur est journalisée, pas propagée.
 * Renvoie les identifiants des utilisateurs réellement notifiés.
 */
export async function notify(input: NotifyInput): Promise<string[]> {
  try {
    if (input.href && !input.href.startsWith('/')) throw new Error('href doit être un chemin interne')
    const userIds = [...new Set(input.userIds)]
    if (userIds.length === 0) return []

    const optedOut = await prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, type: input.type, channel: 'app', enabled: false },
      select: { userId: true },
    })
    const muted = new Set(optedOut.map((p) => p.userId))
    const notified: string[] = []

    for (const userId of userIds.filter((id) => !muted.has(id))) {
      try {
        const created = await prisma.notification.create({
          data: {
            userId,
            organizationId: input.organizationId ?? null,
            type: input.type,
            title: input.title,
            body: input.body ?? null,
            href: input.href ?? null,
            dedupeKey: input.dedupeKey ?? null,
          },
        })
        notified.push(userId)
        await publish({
          type: 'notification.created',
          audience: 'user',
          userId,
          payload: { notificationId: created.id, notificationType: input.type, title: input.title, body: input.body ?? null, href: input.href ?? null },
        })
      } catch (error) {
        // Contrainte d'unicité (userId, dedupeKey) : déjà notifié, c'est le comportement voulu.
        if ((error as { code?: string }).code !== 'P2002') throw error
      }
    }
    return notified
  } catch (error) {
    console.error('[notifications] envoi impossible', input.type, error)
    return []
  }
}

/** Membres d'une organisation, éventuellement limités à certains rôles. */
export async function memberIds(organizationId: string, roles?: readonly string[]): Promise<string[]> {
  const members = await prisma.member.findMany({
    where: { organizationId, ...(roles ? { role: { in: [...roles] } } : {}) },
    select: { userId: true },
  })
  return members.map((m) => m.userId)
}
