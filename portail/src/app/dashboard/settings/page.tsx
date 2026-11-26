import { redirect } from 'next/navigation'
import { Link2, ShieldCheck, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { isEmailConfigured } from '@/lib/email'
import { adminTwoFactorDeadline, isAdmin } from '@/lib/admin'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { AccountSettings } from '@/components/settings/account-settings'
import { SecuritySettings } from '@/components/settings/security-settings'
import { GitHubConnection } from '@/components/settings/github-connection'

export const metadata = { title: 'Paramètres du compte' }
export const dynamic = 'force-dynamic'

const SECTIONS = [
  { id: 'compte', label: 'Compte et apparence', icon: UserRound },
  { id: 'securite', label: 'Sécurité', icon: ShieldCheck },
  { id: 'connexions', label: 'Connexions', icon: Link2 },
] as const

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ admin2fa?: string; tab?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const params = await searchParams
  const admin2faRequired = params.admin2fa === 'required'
  const admin = isAdmin(session)

  const [accounts, deployedProjectCount, user] = await Promise.all([
    // Les comptes Google n'ont pas de mot de passe local : les formulaires de
    // mot de passe et de suppression doivent s'adapter.
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { id: true, providerId: true },
    }),
    prisma.project.count({
      where: { userId: session.user.id, apps: { some: { coolifyAppId: { not: null } } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true },
    }),
  ])
  const deadline = adminTwoFactorDeadline()
  const admin2faGrace = admin && !Boolean(user?.twoFactorEnabled) && deadline instanceof Date && Date.now() < deadline.getTime() ? deadline : null
  const hasPassword = accounts.some((account) => account.providerId === 'credential')

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      <PageHeader
        title="Paramètres"
        description="Profil, apparence, sécurité et connexions de votre compte EFLEX. Chaque section enregistre séparément et affiche son propre retour."
      />

      {admin2faRequired && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-200">
          <p className="font-medium">Double authentification obligatoire pour l’administration</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            Activez la double authentification ci-dessous pour accéder à l’espace d’administration. Les codes de secours vous permettront de récupérer l’accès si vous perdez votre appareil.
          </p>
        </div>
      )}
      {!admin2faRequired && admin2faGrace && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-200">
          <p className="font-medium">Activez la double authentification avant le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(admin2faGrace)}</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
            L’accès à l’administration exigera la double authentification après cette date. Activez-la maintenant et conservez vos codes de secours.
          </p>
        </div>
      )}

      <nav aria-label="Sections des paramètres" className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out-expo hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {section.label}
            </a>
          )
        })}
      </nav>

      <SettingsSection
        id="compte"
        icon={UserRound}
        title="Compte et apparence"
        description="Votre nom, le thème de l’interface, votre mot de passe, votre adresse e-mail et la suppression du compte."
      >
        <AccountSettings
          user={{ name: session.user.name, email: session.user.email }}
          hasPassword={hasPassword}
          emailEnabled={isEmailConfigured()}
          deployedProjectCount={deployedProjectCount}
        />
      </SettingsSection>

      <SettingsSection
        id="securite"
        icon={ShieldCheck}
        title="Sécurité"
        description="Passkeys, double authentification, moyens de connexion et appareils connectés. Une action sensible demande toujours une confirmation."
      >
        <Card>
          <CardContent className="p-6">
            <SecuritySettings
              hasPassword={hasPassword}
              twoFactorEnabled={Boolean(user?.twoFactorEnabled)}
              currentSessionToken={session.session.token}
              linkedAccounts={accounts}
              googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
            />
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection
        id="connexions"
        icon={Link2}
        title="Connexions"
        description="Reliez GitHub pour importer des dépôts publics et privés. La connexion peut être retirée à tout moment, avec confirmation."
      >
        <GitHubConnection isAdmin={isAdmin(session)} />
      </SettingsSection>
    </div>
  )
}

function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  children,
}: {
  id: string
  title: string
  description: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}
