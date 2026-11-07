import { APIError, betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { admin, organization } from 'better-auth/plugins'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { personalOrganizationSlug } from '@/lib/organizations'

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

  databaseHooks: {
    user: {
      create: {
        // Plateforme : les adresses listées dans ADMIN_EMAILS deviennent administrateurs.
        before: async (user) => {
          const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
          return { data: admins.includes(user.email.toLowerCase()) ? { ...user, role: 'admin' } : user }
        },
        // Multi-tenant : chaque compte démarre avec son organisation personnelle.
        after: async (user) => {
          await prisma.organization.create({
            data: {
              name: user.name,
              slug: personalOrganizationSlug(user.id),
              members: { create: { userId: user.id, role: 'owner' } },
            },
          })
        },
      },
    },
    session: {
      create: {
        // Organisation active par défaut : la première dont l'utilisateur est membre.
        before: async (session) => {
          const member = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: 'asc' },
            select: { organizationId: true },
          })
          return { data: { ...session, activeOrganizationId: member?.organizationId ?? null } }
        },
      },
    },
  },

  plugins: [
    // Organisations : membres, rôles (owner / admin / member) et invitations.
    organization({
      organizationLimit: 10,
      organizationHooks: {
        // Supprimer l'organisation effacerait ses projets en base sans retirer leurs applications
        // chez Coolify : on exige de supprimer d'abord les projets (qui nettoient l'infrastructure).
        beforeDeleteOrganization: async ({ organization }) => {
          const projects = await prisma.project.count({ where: { organizationId: organization.id } })
          if (projects > 0) {
            throw new APIError('BAD_REQUEST', {
              message: `Supprimez d'abord les ${projects} projet(s) de l'organisation.`,
              code: 'ORGANIZATION_HAS_PROJECTS',
            })
          }
        },
      },
    }),
    // Administration de la plateforme (utilisateurs, suspension, usurpation).
    admin(),
    // Doit rester en dernier : permet de poser les cookies depuis les Server Actions.
    nextCookies(),
  ],
})
