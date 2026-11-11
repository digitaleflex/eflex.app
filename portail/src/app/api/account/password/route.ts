import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { allow } from '@/lib/rate-limit'
import { PASSPHRASE_MAX_LENGTH, PASSPHRASE_MIN_LENGTH } from '@/lib/auth-validation'

const schema = z.object({
  newPassword: z
    .string()
    .min(PASSPHRASE_MIN_LENGTH, `La phrase secrète doit contenir au moins ${PASSPHRASE_MIN_LENGTH} caractères.`)
    .max(PASSPHRASE_MAX_LENGTH, `La phrase secrète est trop longue (${PASSPHRASE_MAX_LENGTH} caractères maximum).`),
})

/**
 * Définit un premier mot de passe pour un compte créé avec Google.
 * `auth.api.setPassword` est réservé au serveur : jamais exposé au client.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 })

  if (!(await allow(`set-password:${session.user.id}`, 5, 60_000))) {
    return NextResponse.json({ error: 'Trop de tentatives. Patientez une minute.' }, { status: 429 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Mot de passe invalide.' }, { status: 400 })
  }

  try {
    await auth.api.setPassword({ headers: await headers(), body: { newPassword: parsed.data.newPassword } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = (error as { body?: { code?: string } })?.body?.code
    const message =
      code === 'PASSWORD_ALREADY_SET'
        ? 'Une phrase secrète est déjà définie. Utilisez le formulaire de changement de phrase secrète.'
        : 'Impossible de définir la phrase secrète. Réessayez dans un instant.'
    return NextResponse.json({ error: message, code }, { status: 400 })
  }
}
