import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { isEmailConfigured } from '@/lib/email'
import { AccountSettings } from '@/components/settings/account-settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const [credential, deployedProjectCount] = await Promise.all([
    // Les comptes Google n'ont pas de mot de passe local : les formulaires de
    // mot de passe et de suppression doivent s'adapter.
    prisma.account.findFirst({
      where: { userId: session.user.id, providerId: 'credential' },
      select: { id: true },
    }),
    prisma.project.count({
      where: { userId: session.user.id, coolifyAppId: { not: null } },
    }),
  ])

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres du compte</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez votre profil, votre mot de passe et votre adresse e-mail.
        </p>
      </div>

      <AccountSettings
        user={{ name: session.user.name, email: session.user.email }}
        hasPassword={Boolean(credential)}
        emailEnabled={isEmailConfigured()}
        deployedProjectCount={deployedProjectCount}
      />
    </div>
  )
}
