import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

// BETTER_AUTH_SECRET et BETTER_AUTH_URL sont lus automatiquement depuis l'environnement.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer.
    maxPasswordLength: 72,
    // Garde bcrypt (et non scrypt) pour que les mots de passe créés avec l'ancien
    // système (migration 20261107120000_better_auth) restent valides.
    password: {
      hash: (password) => hash(password, 12),
      verify: ({ hash: stored, password }) => compare(password, stored),
    },
  },

  // Google n'est proposé que si les identifiants OAuth sont configurés.
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {},

  // Doit rester en dernier : permet de poser les cookies depuis les Server Actions.
  plugins: [nextCookies()],
})
