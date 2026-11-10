import { prisma } from '@/lib/prisma'
import { publish } from '@/lib/event-bus'
import { appUrl, isEmailConfigured, sendEmail } from '@/lib/email'
import { notificationEmail, notificationEmailSubject } from '@/lib/email-templates'

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

    const emailConfigured = isEmailConfigured()
    // Les deux canaux ont leurs propres préférences et l'absence de ligne signifie « activé ».
    // Une notification coupée dans l'application n'est pas créée : elle ne produit donc pas
    // non plus d'e-mail, et c'est cette ligne qui sert de garde anti-doublon.
    const [optedOut, emailOptedOut] = await Promise.all([
      prisma.notificationPreference.findMany({
        where: { userId: { in: userIds }, type: input.type, channel: 'app', enabled: false },
        select: { userId: true },
      }),
      emailConfigured
        ? prisma.notificationPreference.findMany({
            where: { userId: { in: userIds }, type: input.type, channel: 'email', enabled: false },
            select: { userId: true },
          })
        : Promise.resolve([] as { userId: string }[]),
    ])
    const muted = new Set(optedOut.map((p) => p.userId))
    const emailMuted = new Set(emailOptedOut.map((p) => p.userId))
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

    // Un e-mail par notification réellement créée : les doublons écartés par `dedupeKey`
    // n'atteignent jamais cette étape. L'échec d'un envoi ne remet pas en cause la notification.
    if (emailConfigured) {
      await sendNotificationEmails(input, notified.filter((userId) => !emailMuted.has(userId)))
    }

    return notified
  } catch (error) {
    console.error('[notifications] envoi impossible', input.type, error)
    return []
  }
}

/** Envoie l'e-mail d'une notification aux destinataires retenus, sans jamais lever d'erreur. */
async function sendNotificationEmails(input: NotifyInput, userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return
  try {
    const recipients = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, email: true },
    })
    if (recipients.length === 0) return

    const template = notificationEmail({
      title: input.title,
      body: input.body,
      url: appUrl(input.href ?? '/dashboard/notifications'),
      preferencesUrl: appUrl('/dashboard/settings'),
    })
    const subject = notificationEmailSubject(input.title)

    const results = await Promise.allSettled(
      recipients.map((recipient) => sendEmail({ to: recipient.email, subject, html: template.html, text: template.text })),
    )
    const failed = results.filter((result) => result.status === 'rejected').length
    // Ni adresse ni contenu dans les journaux : uniquement le type et le nombre d'échecs.
    if (failed > 0) console.error('[notifications] e-mail non envoyé', input.type, `${failed}/${recipients.length}`)
  } catch (error) {
    console.error('[notifications] e-mail non envoyé', input.type, error instanceof Error ? error.message : 'erreur inconnue')
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
