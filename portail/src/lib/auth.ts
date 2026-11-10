import { APIError, betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { resetPasswordEmail, verificationEmail } from '@/lib/email-templates'
import { admin, captcha, organization, twoFactor } from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import { passkey } from '@better-auth/passkey'
import { personalOrganizationSlug } from '@/lib/organizations'
import { assertMemberQuota } from '@/lib/billing'
import { readPlatformSettings } from '@/lib/platform-settings'
import { publish } from '@/lib/event-bus'
import { memberIds, notify } from '@/lib/notifications'

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

/**
 * Origine et domaine des passkeys (WebAuthn). Le domaine doit correspondre à
 * celui du site : `eflex.app` en production, `localhost` en développement.
 */
const authURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
let authOrigin = 'http://localhost:3000'
let passkeyRpID = 'localhost'
try {
  const parsed = new URL(authURL)
  authOrigin = parsed.origin
  passkeyRpID = parsed.hostname
} catch {
  // URL invalide : on garde les valeurs de développement.
}

/**
 * Captcha activé seulement quand la clé secrète ET la clé publique sont
 * fournies. Sinon le serveur exigerait un jeton qu'aucun widget ne peut produire.
 */
const captchaSecret = process.env.TURNSTILE_SECRET_KEY
const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const captchaConfigured = Boolean(captchaSecret && captchaSiteKey)

/**
 * La vérification d'e-mail n'est exigée que si Resend est configuré : sans
 * fournisseur, exiger un lien impossible à recevoir verrouillerait les comptes.
 * Dès que RESEND_API_KEY est renseignée, l'inscription envoie le lien et la
 * connexion refuse tout compte non vérifié (issue 05).
 */
const emailVerificationRequired = isEmailConfigured()

/** Adresses des administrateurs de la plateforme (ADMIN_EMAILS, séparées par des virgules). */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/**
 * Rôles d'organisation. Better Auth ne fournit que owner/admin/member ; on
 * ajoute `billing` (lecture et gestion de la facturation, sans accès aux
 * projets, variables d'environnement ni journaux). Les rôles par défaut sont
 * redéclarés à l'identique : dès que `roles` est fourni, Better Auth n'utilise
 * plus ses rôles par défaut pour les contrôles de permission.
 */
const organizationAccess = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  billing: ['read', 'manage'],
})

const organizationRoles = {
  owner: organizationAccess.newRole({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
    billing: ['read', 'manage'],
  }),
  admin: organizationAccess.newRole({
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
    billing: ['read', 'manage'],
  }),
  member: organizationAccess.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ['read'],
    billing: [],
  }),
  billing: organizationAccess.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ['read'],
    billing: ['read', 'manage'],
  }),
}

function memberLimitError(error: string): APIError {
  return new APIError('FORBIDDEN', { message: error, code: 'MEMBER_LIMIT_REACHED' })
}

/** Accorde le rôle `admin` à un compte listé dans ADMIN_EMAILS dont l'adresse est vérifiée. */
async function promoteVerifiedAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, role: true } })
  if (user && user.emailVerified && user.role !== 'admin' && adminEmails().includes(user.email.toLowerCase())) {
    await prisma.user.update({ where: { id: userId }, data: { role: 'admin' } })
  }
}

// BETTER_AUTH_SECRET et BETTER_AUTH_URL sont lus automatiquement depuis l'environnement.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer.
    maxPasswordLength: 72,
    requireEmailVerification: emailVerificationRequired,
    // Garde bcrypt (et non scrypt) pour que les mots de passe créés avec l'ancien
    // système (migration 20261107120000_better_auth) restent valides.
    password: {
      hash: (password) => hash(password, 12),
      verify: ({ hash: stored, password }) => compare(password, stored),
    },
    async sendResetPassword({ user, url }) {
      const template = resetPasswordEmail(url)
      await sendEmail({
        to: user.email,
        subject: 'Réinitialiser votre mot de passe Eflex',
        ...template,
      })
    },
    resetPasswordTokenExpiresIn: 3600,
    // Un changement de mot de passe invalide les autres sessions.
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      const template = verificationEmail(url)
      await sendEmail({
        to: user.email,
        subject: 'Vérifiez votre adresse e-mail Eflex',
        ...template,
      })
    },
    sendOnSignUp: emailVerificationRequired,
    sendOnSignIn: emailVerificationRequired,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
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

  // Un compte Google et un compte mot de passe qui partagent la même adresse
  // vérifiée sont liés automatiquement : une seule identité, deux méthodes.
  accountLinking: {
    enabled: true,
    trustedProviders: ['google'],
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60,
  },

  // Limiteur partagé en base : fiable même avec plusieurs instances du portail.
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/forget-password': { window: 60, max: 5 },
      '/reset-password': { window: 60, max: 10 },
      '/two-factor/verify-totp': { window: 60, max: 10 },
      '/two-factor/verify-backup-code': { window: 60, max: 10 },
      '/passkey/verify-authentication': { window: 60, max: 10 },
      '/passkey/verify-registration': { window: 60, max: 10 },
      '/link-social': { window: 60, max: 10 },
    },
  },

  advanced: {
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },

  databaseHooks: {
    user: {
      create: {
        // Inscriptions fermées depuis /admin/infrastructure : refuse la création
        // de compte (le message est traduit côté client).
        before: async () => {
          const { settings } = await readPlatformSettings()
          if (!settings.signupsEnabled) {
            throw new APIError('FORBIDDEN', {
              message: 'Les inscriptions sont temporairement fermées. Réessayez plus tard.',
              code: 'SIGNUPS_DISABLED',
            })
          }
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
          // Terminal d'exploitation : les administrateurs voient les inscriptions arriver.
          await publish({
            type: 'user.registered',
            audience: 'admin',
            payload: { userId: user.id, name: user.name, email: user.email },
          })
        },
      },
    },
    session: {
      create: {
        // Organisation active par défaut : la première dont l'utilisateur est membre.
        // Plateforme : les adresses de ADMIN_EMAILS deviennent administrateurs, mais seulement une fois
        // l'e-mail VÉRIFIÉ (Google, ou lien de vérification). Sinon, n'importe qui pourrait s'inscrire
        // avec l'adresse d'un administrateur avant lui et prendre la main sur /admin.
        before: async (session) => {
          await promoteVerifiedAdmin(session.userId)
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
    // Captcha sur les endpoints sensibles. Sans clés configurées, l'endpoint
    // surveillé est volontairement inexistant : le plugin reste inerte et
    // n'exige aucun jeton (une liste vide retomberait sur les valeurs par défaut).
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: captchaSecret || 'captcha-desactive',
      endpoints: captchaConfigured
        ? ['/sign-in/email', '/sign-up/email', '/request-password-reset']
        : ['/captcha-desactive'],
    }),
    // Connexion sans mot de passe (WebAuthn / FIDO2) : empreinte, visage, clé de sécurité.
    passkey({
      rpName: 'Eflex',
      rpID: passkeyRpID,
      origin: authOrigin,
    }),
    // Organisations : membres, rôles (owner / admin / member) et invitations.
    organization({
      organizationLimit: 10,
      // Rôles owner / admin / member / billing (ce dernier réservé à la facturation).
      ac: organizationAccess,
      roles: organizationRoles,
      // Une invitation ne peut être acceptée que par une adresse vérifiée (dès que l'envoi d'e-mails est actif).
      requireEmailVerificationOnInvitation: emailVerificationRequired,
      organizationHooks: {
        // Quotas de membres (#18) : on refuse avant l'écriture, avec un message
        // qui invite à passer au plan supérieur. À l'invitation on compte les
        // invitations en attente ; à l'acceptation, seulement les membres réels.
        beforeCreateInvitation: async ({ invitation }) => {
          const quota = await assertMemberQuota(invitation.organizationId, { includePendingInvitations: true })
          if ('error' in quota) throw memberLimitError(quota.error)
        },
        beforeAcceptInvitation: async ({ invitation }) => {
          const quota = await assertMemberQuota(invitation.organizationId)
          if ('error' in quota) throw memberLimitError(quota.error)
        },
        beforeAddMember: async ({ member }) => {
          const quota = await assertMemberQuota(member.organizationId)
          if ('error' in quota) throw memberLimitError(quota.error)
        },
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
    // Double authentification TOTP + codes de secours.
    twoFactor({ issuer: 'Eflex' }),
    // Doit rester en dernier : permet de poser les cookies depuis les Server Actions.
    nextCookies(),
  ],

  user: {
    // Changement d'adresse : Better Auth envoie un lien de vérification à la
    // nouvelle adresse (sendVerificationEmail est configuré ci-dessus).
    changeEmail: {
      enabled: true,
    },
    // Suppression de compte depuis /dashboard/settings, avec mot de passe.
    deleteUser: {
      enabled: true,
      // Même garde que pour la suppression d'organisation : des applications
      // déployées resteraient orphelines chez Coolify si le compte disparaissait.
      async beforeDelete(user) {
        const deployed = await prisma.project.count({
          where: { userId: user.id, coolifyAppId: { not: null } },
        })
        if (deployed > 0) {
          throw new APIError('BAD_REQUEST', {
            message: `Supprimez d'abord vos ${deployed} projet(s) déployé(s) avant de supprimer votre compte.`,
            code: 'ACCOUNT_HAS_DEPLOYED_PROJECTS',
          })
        }
      },
    },
  },
})
