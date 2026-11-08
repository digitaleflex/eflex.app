import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailFrom, isEmailConfigured, sendEmail } from './email'
import { resetPasswordEmail, verificationEmail } from './email-templates'

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
})
