import { describe, expect, it } from 'vitest'

import { authMethods, githubCredentials, googleCredentials, nameFromEmail } from '@/lib/auth-methods'
import { loginCodeEmail } from '@/lib/email-templates'

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv

describe('méthodes de connexion', () => {
  it('n’active Google que si les deux identifiants sont fournis', () => {
    expect(googleCredentials(env({ GOOGLE_CLIENT_ID: 'id' }))).toBeNull()
    expect(googleCredentials(env({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: ' secret ' }))).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
    })
  })

  it('active GitHub avec une OAuth App, ou à défaut avec la GitHub App d’EFLEX', () => {
    expect(githubCredentials(env({}))).toBeNull()
    expect(githubCredentials(env({ GITHUB_CLIENT_ID: 'a', GITHUB_CLIENT_SECRET: 'b' }))).toEqual({
      clientId: 'a',
      clientSecret: 'b',
    })
    expect(githubCredentials(env({ GITHUB_APP_CLIENT_ID: 'c', GITHUB_APP_CLIENT_SECRET: 'd' }))).toEqual({
      clientId: 'c',
      clientSecret: 'd',
    })
    // Pas de mélange : l'identifiant d'une application avec le secret d'une autre échouerait chez GitHub.
    expect(githubCredentials(env({ GITHUB_CLIENT_ID: 'a', GITHUB_APP_CLIENT_SECRET: 'd' }))).toBeNull()
    expect(
      githubCredentials(
        env({ GITHUB_CLIENT_ID: 'a', GITHUB_APP_CLIENT_ID: 'c', GITHUB_APP_CLIENT_SECRET: 'd' }),
      ),
    ).toEqual({ clientId: 'c', clientSecret: 'd' })
  })

  it('ne propose le code par e-mail qu’avec un fournisseur d’e-mails', () => {
    expect(authMethods(env({}))).toEqual({ google: false, github: false, emailCode: false })
    expect(authMethods(env({ RESEND_API_KEY: 're_x' })).emailCode).toBe(true)
  })

  it('tire un nom lisible de l’adresse e-mail', () => {
    expect(nameFromEmail('ama.koffi@exemple.com')).toBe('Ama koffi')
    expect(nameFromEmail('jean_pierre+test@exemple.com')).toBe('Jean pierre test')
    expect(nameFromEmail('@exemple.com')).toBe('Nouveau compte')
  })
})

describe('e-mail du code de connexion', () => {
  it('contient le code, sa durée de validité et aucun lien à cliquer', () => {
    const mail = loginCodeEmail('482913', 10)
    expect(mail.text).toContain('482913')
    expect(mail.text).toContain('10 minutes')
    expect(mail.html).toContain('482913')
    expect(mail.html).not.toContain('<a ')
  })
})
