import { beforeEach, describe, expect, it, vi } from 'vitest'

type PreferenceWhere = { channel?: string }
type SentMail = { to: string; subject: string; html: string; text: string }

// `vi.hoisted` : les fabriques de `vi.mock` sont remontées avant les imports.
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  isEmailConfigured: vi.fn(),
  publish: vi.fn(),
  appUrl: vi.fn((path: string) => `https://eflex.app${path}`),
  prisma: {
    notificationPreference: { findMany: vi.fn() },
    notification: { create: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/event-bus', () => ({ publish: mocks.publish }))
vi.mock('@/lib/email', () => ({
  isEmailConfigured: mocks.isEmailConfigured,
  sendEmail: mocks.sendEmail,
  appUrl: mocks.appUrl,
}))

import { notify } from './notifications'

const USER = { id: 'user-1', email: 'iness@exemple.fr' }

let emailOptedOut: { userId: string }[] = []

beforeEach(() => {
  vi.clearAllMocks()
  emailOptedOut = []
  mocks.isEmailConfigured.mockReturnValue(true)
  mocks.prisma.notificationPreference.findMany.mockImplementation(async ({ where }: { where?: PreferenceWhere }) =>
    where?.channel === 'email' ? emailOptedOut : [],
  )
  mocks.prisma.notification.create.mockResolvedValue({ id: 'notification-1' })
  mocks.prisma.user.findMany.mockResolvedValue([USER])
})

describe('notification par e-mail', () => {
  it('n’envoie rien si la préférence e-mail du type est désactivée', async () => {
    emailOptedOut = [{ userId: USER.id }]

    const notified = await notify({
      userIds: [USER.id],
      type: 'deployment.failed',
      title: 'Le déploiement a échoué',
      body: 'Ouvrez les journaux pour voir l’erreur.',
      href: '/dashboard/projects/p1',
    })

    expect(notified).toEqual([USER.id]) // la notification in-app reste créée
    expect(mocks.prisma.notification.create).toHaveBeenCalledOnce()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    // Le filtre porte bien sur le canal e-mail et le type concerné.
    expect(mocks.prisma.notificationPreference.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [USER.id] }, type: 'deployment.failed', channel: 'email', enabled: false },
      select: { userId: true },
    })
  })

  it('envoie un seul e-mail au bon destinataire quand le canal e-mail est actif', async () => {
    await notify({
      userIds: [USER.id],
      type: 'deployment.succeeded',
      title: 'Démo est en ligne',
      body: 'Le déploiement s’est terminé avec succès.',
      href: '/dashboard/projects/p1',
    })

    expect(mocks.sendEmail).toHaveBeenCalledOnce()
    const mail = mocks.sendEmail.mock.calls[0]![0] as SentMail
    expect(mail.to).toBe('iness@exemple.fr')
    expect(mail.subject).toBe('Démo est en ligne')
    expect(mail.html).toContain('Démo est en ligne')
    expect(mail.html).toContain('Le déploiement s’est terminé avec succès.')
    expect(mail.html).toContain('https://eflex.app/dashboard/projects/p1')
    expect(mail.html).toContain('https://eflex.app/dashboard/settings')
    expect(mail.text).toContain('Vous recevez cet e-mail selon vos préférences')
  })

  it('n’envoie pas de second e-mail pour une notification déjà créée (dedupeKey)', async () => {
    mocks.prisma.notification.create
      .mockResolvedValueOnce({ id: 'notification-1' })
      .mockRejectedValueOnce(Object.assign(new Error('contrainte unique'), { code: 'P2002' }))

    const input = {
      userIds: [USER.id],
      type: 'deployment.failed' as const,
      title: 'Le déploiement a échoué',
      body: 'Ouvrez les journaux.',
      dedupeKey: 'deployment:d1:failed',
    }
    await notify(input)
    await notify(input)

    expect(mocks.prisma.notification.create).toHaveBeenCalledTimes(2)
    expect(mocks.sendEmail).toHaveBeenCalledOnce()
  })

  it('n’interroge pas les préférences e-mail et n’envoie rien sans Resend configuré', async () => {
    mocks.isEmailConfigured.mockReturnValue(false)

    await notify({ userIds: [USER.id], type: 'invitation.received', title: 'Invitation à rejoindre Acme' })

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.prisma.notificationPreference.findMany).toHaveBeenCalledOnce()
    expect(mocks.prisma.notificationPreference.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [USER.id] }, type: 'invitation.received', channel: 'app', enabled: false },
      select: { userId: true },
    })
  })

  it('échappe le contenu dynamique et ne recopie aucun secret d’environnement', async () => {
    const savedKey = process.env.RESEND_API_KEY
    process.env.RESEND_API_KEY = 're_secret_de_test_a_ne_jamais_fuiter'
    try {
      await notify({
        userIds: [USER.id],
        type: 'deployment.succeeded',
        title: '<script>alert(1)</script> est en ligne',
        body: 'Projet <b>Démo</b> & associés',
        href: '/dashboard/projects/p1',
      })
    } finally {
      if (savedKey === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = savedKey
    }

    const mail = mocks.sendEmail.mock.calls[0]![0] as SentMail
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).toContain('&amp;')
    expect(mail.html).not.toContain('re_secret_de_test_a_ne_jamais_fuiter')
    expect(mail.text).not.toContain('re_secret_de_test_a_ne_jamais_fuiter')
  })

  it('n’échoue pas la notification si l’envoi de l’e-mail échoue', async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error('Resend a refusé l’envoi (HTTP 422).'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const notified = await notify({
        userIds: [USER.id],
        type: 'membership.removed',
        title: 'Vous avez été retiré de Acme',
      })

      expect(notified).toEqual([USER.id])
      expect(mocks.sendEmail).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })
})
