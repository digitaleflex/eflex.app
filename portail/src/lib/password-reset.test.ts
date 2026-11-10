import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
// Ne jamais lancer contre la base de production.
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

run('réinitialisation de mot de passe', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  const email = `reset-${Date.now()}@exemple.fr`
  let userId = ''

  beforeAll(async () => {
    const { auth } = await import('@/lib/auth')
    const created = await auth.api.signUpEmail({
      body: { name: 'Compte reset', email, password: 'mot-de-passe-initial' },
    })
    userId = created.user.id
  })

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  /** Demande un lien et renvoie le jeton stocké (le mail n'est pas envoyé en test). */
  async function requestToken(): Promise<string> {
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } })
    const row = await prisma.verification.findFirst({
      where: { value: userId, identifier: { startsWith: 'reset-password:' } },
      orderBy: { createdAt: 'desc' },
    })
    expect(row, 'jeton de réinitialisation créé').toBeTruthy()
    return row!.identifier.replace('reset-password:', '')
  }

  it('accepte un jeton une seule fois', async () => {
    const { auth } = await import('@/lib/auth')
    const token = await requestToken()
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: 'nouveau-mot-de-passe' } }),
    ).resolves.toMatchObject({ status: true })
    // Le même jeton est consommé : une seconde utilisation doit échouer.
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: 'encore-un-autre-mot-de-passe' } }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
  })

  it('refuse un jeton expiré', async () => {
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    const token = await requestToken()
    await prisma.verification.updateMany({
      where: { identifier: `reset-password:${token}` },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: 'mot-de-passe-trop-tard' } }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
  })
})
