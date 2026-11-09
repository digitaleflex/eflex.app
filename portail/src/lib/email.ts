/**
 * Envoi d'e-mails transactionnels via l'API REST Resend (issue 05).
 * Aucune dépendance supplémentaire : même approche que le client Coolify.
 *
 * La clé `RESEND_API_KEY` reste hors de la base et de l'image Docker.
 * `EMAIL_FROM` doit être une adresse d'un domaine vérifié dans Resend.
 */
const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'Eflex <noreply@eflex.app>'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/** Adresse d'expédition configurée (domaine vérifié côté Resend). */
export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const key = process.env.RESEND_API_KEY

  if (!key) {
    // En développement on ne casse pas l'inscription ; en production Better Auth
    // doit échouer plutôt que créer un compte qui ne recevra jamais son lien.
    if (process.env.NODE_ENV !== 'production') {
      console.info('[eflex/mail] RESEND_API_KEY absente : e-mail non envoyé (développement).')
      return
    }
    throw new Error("RESEND_API_KEY est absente : impossible d'envoyer l'e-mail.")
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: emailFrom(), to: [to], subject, html, text }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    // On ne journalise jamais le corps de la réponse (il peut contenir des
    // informations sur le compte) ni le destinataire.
    throw new Error(`Resend a refusé l'envoi (HTTP ${response.status}).`)
  }
}
