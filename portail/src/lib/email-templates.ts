/** Gabarits d'e-mails transactionnels, en français, aux couleurs Eflex. */

export interface EmailTemplate {
  html: string
  text: string
}

/** Échappe le texte inséré en HTML : titres et corps de notification sont dynamiques. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type LayoutOptions = {
  /** Introduction déjà en HTML sûr (sinon `intro` est échappée). */
  introHtml?: string
  /** Note de pied de page déjà en HTML sûr (sinon `note` est échappée). */
  noteHtml?: string
}

function layout(
  title: string,
  intro: string,
  ctaLabel: string,
  url: string,
  note: string,
  options: LayoutOptions = {},
): EmailTemplate {
  const safeTitle = escapeHtml(title)
  const safeIntro = options.introHtml ?? escapeHtml(intro)
  const safeCta = escapeHtml(ctaLabel)
  const safeUrl = escapeHtml(url)
  const safeNote = options.noteHtml ?? escapeHtml(note)

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Inter,Arial,Helvetica,sans-serif;color:#0b1f3b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <tr><td style="padding:28px 32px 8px">
          <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#0b1f3b">Eflex</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0">
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;letter-spacing:-0.02em;color:#0b1f3b">${safeTitle}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569">${safeIntro}</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px">
          <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:10px">${safeCta}</a>
        </td></tr>
        <tr><td style="padding:0 32px 28px">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#64748b">${safeNote}</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all">${safeUrl}</p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px">
          <p style="margin:0;font-size:12px;color:#94a3b8">Le déploiement depuis Git, sans DevOps — eflex.app</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  return { html, text: `${title}\n\n${intro}\n\n${ctaLabel} : ${url}\n\n${note}\n\nEflex — eflex.app` }
}

export function verificationEmail(url: string): EmailTemplate {
  return layout(
    'Vérifiez votre adresse e-mail',
    'Bienvenue sur Eflex. Confirmez votre adresse pour activer votre compte et déployer votre premier projet.',
    'Vérifier mon adresse',
    url,
    'Ce lien expire dans 1 heure. Si vous n’êtes pas à l’origine de cette inscription, ignorez cet e-mail.',
  )
}

export function resetPasswordEmail(url: string): EmailTemplate {
  return layout(
    'Réinitialiser votre phrase secrète',
    'Une demande de réinitialisation a été faite pour votre compte Eflex. Choisissez une nouvelle phrase secrète.',
    'Choisir une nouvelle phrase secrète',
    url,
    'Ce lien expire dans 1 heure et ne peut être utilisé qu’une fois. Si vous n’avez rien demandé, ignorez cet e-mail : votre phrase secrète reste inchangée.',
  )
}

export interface NotificationEmailInput {
  title: string
  body?: string | null
  /** Lien absolu vers l'objet de la notification (ou la page des notifications). */
  url: string
  /** Lien absolu vers les préférences de notification. */
  preferencesUrl: string
}

/**
 * E-mail d'une notification du centre : reprend le titre et le corps affichés dans
 * l'application, avec un lien direct. Aucune valeur technique (secret, variable
 * d'environnement) n'est ajoutée ici.
 */
export function notificationEmail({ title, body, url, preferencesUrl }: NotificationEmailInput): EmailTemplate {
  const detail = body?.trim()
  const intro = detail
    ? `${detail}\n\nOuvrez Eflex pour voir le détail.`
    : 'Une nouvelle notification vous attend sur Eflex. Ouvrez l’application pour voir le détail.'
  const introHtml = detail
    ? `${escapeHtml(detail)}<br><br>Ouvrez Eflex pour voir le détail.`
    : 'Une nouvelle notification vous attend sur Eflex. Ouvrez l’application pour voir le détail.'
  const note = `Vous recevez cet e-mail selon vos préférences. Gérer mes préférences : ${preferencesUrl}`
  const noteHtml = `Vous recevez cet e-mail selon vos préférences. <a href="${escapeHtml(preferencesUrl)}" style="color:#2563eb;text-decoration:underline">Gérer mes préférences</a>.`

  return layout(title, intro, 'Ouvrir dans Eflex', url, note, { introHtml, noteHtml })
}

/** Objet de l'e-mail : une seule ligne, longueur bornée. */
export function notificationEmailSubject(title: string): string {
  const single = title.replace(/\s+/g, ' ').trim()
  if (!single) return 'Nouvelle notification Eflex'
  return single.length > 120 ? `${single.slice(0, 117)}…` : single
}
