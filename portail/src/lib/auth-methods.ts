/**
 * Méthodes de connexion réellement actives sur cette instance : source unique pour `lib/auth.ts`
 * (qui enregistre les fournisseurs) et `/api/auth/config` (qui dit à l'interface quoi afficher).
 * Un bouton n'apparaît que si le serveur sait le servir : jamais de succès simulé.
 */

export function googleCredentials(env: NodeJS.ProcessEnv = process.env): { clientId: string; clientSecret: string } | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/**
 * Connexion avec GitHub : identifiants d'une OAuth App (`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`)
 * ou, à défaut, ceux de la GitHub App d'EFLEX (`GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET`).
 * Dans les deux cas l'URL de rappel `<BETTER_AUTH_URL>/api/auth/callback/github` doit être déclarée côté GitHub.
 */
export function githubCredentials(env: NodeJS.ProcessEnv = process.env): { clientId: string; clientSecret: string } | null {
  const pair = (idKey: string, secretKey: string) => {
    const clientId = env[idKey]?.trim()
    const clientSecret = env[secretKey]?.trim()
    return clientId && clientSecret ? { clientId, clientSecret } : null
  }
  // Toujours une paire cohérente : jamais l'identifiant d'une application avec le secret d'une autre.
  return pair('GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET') ?? pair('GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET')
}

export interface AuthMethods {
  google: boolean
  github: boolean
  /** Code à 6 chiffres envoyé par e-mail : exige un fournisseur d'e-mails (Resend). */
  emailCode: boolean
}

export function authMethods(env: NodeJS.ProcessEnv = process.env): AuthMethods {
  return {
    google: googleCredentials(env) !== null,
    github: githubCredentials(env) !== null,
    emailCode: Boolean(env.RESEND_API_KEY),
  }
}

/** Nom affiché pour un compte créé sans nom (code e-mail) : la partie locale de l'adresse. */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? ''
  const cleaned = local.replace(/[._+-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const name = cleaned || 'Nouveau compte'
  return name.charAt(0).toUpperCase() + name.slice(1)
}
