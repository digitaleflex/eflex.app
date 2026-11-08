import { APIError, betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { admin, organization } from 'better-auth/plugins'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { personalOrganizationSlug } from '@/lib/organizations'
import { publish } from '@/lib/event-bus'
import { memberIds, notify } from '@/lib/notifications'

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
        // Temps réel : les listes ouvertes (équipe, invitations) se mettent à jour sans rechargement.
        afterAddMember: async ({ member, organization }) =>
          publish({ type: 'member.added', organizationId: organization.id, payload: { memberId: member.id, userId: member.userId } }),
        afterRemoveMember: async ({ member, organization }) => {
          await publish({ type: 'member.removed', organizationId: organization.id, payload: { memberId: member.id, userId: member.userId } })
          // La personne retirée est prévenue directement : son interface change d'organisation.
          await publish({ type: 'membership.revoked', audience: 'user', userId: member.userId, payload: { organizationId: organization.id } })
          await notify({
            userIds: [member.userId],
            type: 'membership.removed',
            title: `Vous avez été retiré de ${organization.name}`,
            body: "Vous n'avez plus accès à ses projets. Vos autres organisations ne sont pas touchées.",
            href: '/dashboard',
            dedupeKey: `removed:${member.id}`,
          })
        },
        afterUpdateMemberRole: async ({ member, organization }) =>
          publish({ type: 'member.updated', organizationId: organization.id, payload: { memberId: member.id, role: member.role } }),
        afterCreateInvitation: async ({ invitation, inviter, organization }) => {
          await publish({ type: 'invitation.created', organizationId: organization.id, payload: { invitationId: invitation.id } })
          // La personne invitée a déjà un compte : elle est prévenue dans l'application.
          const invited = await prisma.user.findUnique({ where: { email: invitation.email.toLowerCase() }, select: { id: true } })
          if (invited) {
            await notify({
              userIds: [invited.id],
              type: 'invitation.received',
              title: `Invitation à rejoindre ${organization.name}`,
              body: `${inviter.name} vous invite à rejoindre cette organisation. Ouvrez l'invitation pour l'accepter ou la refuser.`,
              href: `/invitations/${invitation.id}`,
              dedupeKey: `invitation:${invitation.id}`,
            })
          }
        },
        afterCancelInvitation: async ({ invitation, organization }) =>
          publish({ type: 'invitation.updated', organizationId: organization.id, payload: { invitationId: invitation.id, status: 'canceled' } }),
        afterRejectInvitation: async ({ invitation, organization }) =>
          publish({ type: 'invitation.updated', organizationId: organization.id, payload: { invitationId: invitation.id, status: 'rejected' } }),
        afterAcceptInvitation: async ({ invitation, member, organization }) => {
          await publish({ type: 'invitation.updated', organizationId: organization.id, payload: { invitationId: invitation.id, status: 'accepted' } })
          await publish({ type: 'member.added', organizationId: organization.id, payload: { memberId: member.id, userId: member.userId } })
          // Les propriétaires et administrateurs savent qui vient d'arriver.
          const joined = await prisma.user.findUnique({ where: { id: member.userId }, select: { name: true } })
          const staff = (await memberIds(organization.id, ['owner', 'admin'])).filter((id) => id !== member.userId)
          await notify({
            userIds: staff,
            organizationId: organization.id,
            type: 'member.joined',
            title: `${joined?.name ?? 'Une personne'} a rejoint ${organization.name}`,
            href: '/dashboard/organization',
            dedupeKey: `joined:${member.id}`,
          })
        },
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
