import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { isEmailConfigured } from '@/lib/email'
import { isAdmin } from '@/lib/admin'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AccountSettings } from '@/components/settings/account-settings'
import { SecuritySettings } from '@/components/settings/security-settings'
import { GitHubConnection } from '@/components/settings/github-connection'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const [accounts, deployedProjectCount, user] = await Promise.all([
    // Les comptes Google n'ont pas de mot de passe local : les formulaires de
    // mot de passe et de suppression doivent s'adapter.
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { id: true, providerId: true },
    }),
    prisma.project.count({
      where: { userId: session.user.id, coolifyAppId: { not: null } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true },
    }),
  ])
  const hasPassword = accounts.some((account) => account.providerId === 'credential')

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
        hasPassword={hasPassword}
        emailEnabled={isEmailConfigured()}
        deployedProjectCount={deployedProjectCount}
      />

      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            Sécurité
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Passkeys, double authentification, moyens de connexion et appareils connectés.
          </p>
        </CardHeader>
        <CardContent>
          <SecuritySettings
            hasPassword={hasPassword}
            twoFactorEnabled={Boolean(user?.twoFactorEnabled)}
            currentSessionToken={session.session.token}
            linkedAccounts={accounts}
            googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
          />
        </CardContent>
      </Card>

      <GitHubConnection isAdmin={isAdmin(session)} />
    </div>
  )
}
