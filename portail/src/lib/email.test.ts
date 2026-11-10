import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appUrl, emailFrom, isEmailConfigured, sendEmail } from './email'
import {
  notificationEmail,
  notificationEmailSubject,
  resetPasswordEmail,
  verificationEmail,
} from './email-templates'

const KEY = 're_test_key_123'
const INPUT = { to: 'client@exemple.fr', subject: 'Sujet', html: '<p>Bonjour</p>', text: 'Bonjour' }

let originalFetch: typeof fetch
let savedKey: string | undefined
let savedFrom: string | undefined
let savedNodeEnv: string | undefined

beforeEach(() => {
  originalFetch = globalThis.fetch
  savedKey = process.env.RESEND_API_KEY
  savedFrom = process.env.EMAIL_FROM
  savedNodeEnv = process.env.NODE_ENV
  delete process.env.EMAIL_FROM
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (savedKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = savedKey
  if (savedFrom === undefined) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = savedFrom
  process.env.NODE_ENV = savedNodeEnv
  vi.restoreAllMocks()
})

describe('configuration', () => {
  it('détecte la présence de la clé', () => {
    delete process.env.RESEND_API_KEY
    expect(isEmailConfigured()).toBe(false)
    process.env.RESEND_API_KEY = KEY
    expect(isEmailConfigured()).toBe(true)
  })

  it('utilise une adresse d’expédition par défaut ou configurée', () => {
    expect(emailFrom()).toBe('Eflex <noreply@eflex.app>')
    process.env.EMAIL_FROM = 'Eflex <contact@eflex.app>'
    expect(emailFrom()).toBe('Eflex <contact@eflex.app>')
  })

  it('construit une URL absolue depuis BETTER_AUTH_URL, avec eflex.app par défaut', () => {
    const saved = process.env.BETTER_AUTH_URL
    try {
      delete process.env.BETTER_AUTH_URL
      expect(appUrl('/dashboard/settings')).toBe('https://eflex.app/dashboard/settings')
      process.env.BETTER_AUTH_URL = 'https://console.exemple.fr/'
      expect(appUrl('/dashboard/settings')).toBe('https://console.exemple.fr/dashboard/settings')
    } finally {
      if (saved === undefined) delete process.env.BETTER_AUTH_URL
      else process.env.BETTER_AUTH_URL = saved
    }
  })
})

describe('sendEmail', () => {
  it('appelle l’API Resend avec les bons en-têtes et le bon corps', async () => {
    process.env.RESEND_API_KEY = KEY
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await sendEmail(INPUT)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    const body = JSON.parse(init.body)
    expect(body.from).toBe('Eflex <noreply@eflex.app>')
    expect(body.to).toEqual(['client@exemple.fr'])
    expect(body.subject).toBe('Sujet')
    expect(body.html).toBe('<p>Bonjour</p>')
    expect(body.text).toBe('Bonjour')
    // La clé ne doit jamais apparaître dans le corps.
    expect(init.body).not.toContain(KEY)
  })

  it('lève une erreur si Resend refuse l’envoi', async () => {
    process.env.RESEND_API_KEY = KEY
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422 }) as unknown as typeof fetch
    await expect(sendEmail(INPUT)).rejects.toThrow(/HTTP 422/)
  })

  it('en développement, l’absence de clé n’envoie rien sans planter', async () => {
    delete process.env.RESEND_API_KEY
    process.env.NODE_ENV = 'development'
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(sendEmail(INPUT)).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('en production, l’absence de clé échoue explicitement', async () => {
    delete process.env.RESEND_API_KEY
    process.env.NODE_ENV = 'production'
    await expect(sendEmail(INPUT)).rejects.toThrow(/RESEND_API_KEY/)
  })
})

describe('gabarits', () => {
  it('le mail de vérification contient le lien et un texte français', () => {
    const tpl = verificationEmail('https://eflex.app/verify?token=abc')
    expect(tpl.html).toContain('https://eflex.app/verify?token=abc')
    expect(tpl.html).toContain('Vérifiez votre adresse e-mail')
    expect(tpl.text).toContain('Vérifier mon adresse')
  })

  it('le mail de réinitialisation contient le lien et la durée de validité', () => {
    const tpl = resetPasswordEmail('https://eflex.app/reset-password?token=xyz')
    expect(tpl.html).toContain('https://eflex.app/reset-password?token=xyz')
    expect(tpl.html).toContain('1 heure')
    expect(tpl.text).toContain('Choisir un nouveau mot de passe')
  })

  it('le mail de notification reprend le titre, le corps, le lien direct et les préférences', () => {
    const tpl = notificationEmail({
      title: 'Démo est en ligne',
      body: 'Le déploiement s’est terminé avec succès.',
      url: 'https://eflex.app/dashboard/projects/p1',
      preferencesUrl: 'https://eflex.app/dashboard/settings',
    })
    expect(tpl.html).toContain('Démo est en ligne')
    expect(tpl.html).toContain('Le déploiement s’est terminé avec succès.')
    expect(tpl.html).toContain('https://eflex.app/dashboard/projects/p1')
    expect(tpl.html).toContain('https://eflex.app/dashboard/settings')
    expect(tpl.text).toContain('Vous recevez cet e-mail selon vos préférences')
  })

  it('le mail de notification échappe le HTML dynamique', () => {
    const tpl = notificationEmail({
      title: '<img src=x onerror=alert(1)>',
      body: 'Nom <b>du projet</b>',
      url: 'https://eflex.app/dashboard/projects/p1',
      preferencesUrl: 'https://eflex.app/dashboard/settings',
    })
    expect(tpl.html).not.toContain('<img src=x')
    expect(tpl.html).toContain('&lt;img src=x')
    expect(tpl.html).not.toContain('<b>du projet</b>')
  })

  it('borne l’objet du mail à une seule ligne', () => {
    expect(notificationEmailSubject('  Déploiement\néchoué  ')).toBe('Déploiement échoué')
    expect(notificationEmailSubject('')).toBe('Nouvelle notification Eflex')
    expect(notificationEmailSubject('a'.repeat(200))).toHaveLength(118)
  })
})
