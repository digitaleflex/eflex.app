import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'

const number = new Intl.NumberFormat('fr-FR')

export default async function AdminOverview() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  const [users, newUsers, banned, organizations, projects, failed, live] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { banned: true } }),
    prisma.organization.count(),
    prisma.project.count(),
    prisma.deployment.count({ where: { status: 'failed', createdAt: { gte: since } } }),
    prisma.deployment.count({ where: { status: 'live', createdAt: { gte: since } } }),
  ])
  const deployed = failed + live

  const stats = [
    { label: 'Utilisateurs', value: number.format(users), hint: `${number.format(newUsers)} inscrits ces 7 jours` },
    { label: 'Suspendus', value: number.format(banned), hint: banned === 0 ? 'Aucun compte suspendu' : 'Comptes bloqués' },
    { label: 'Organisations', value: number.format(organizations), hint: 'Personnelles et d’équipe' },
    { label: 'Projets', value: number.format(projects), hint: 'Toutes organisations' },
    {
      label: 'Réussite des déploiements',
      value: deployed === 0 ? '—' : `${Math.round((live / deployed) * 100)} %`,
      hint: deployed === 0 ? 'Aucun déploiement terminé ces 7 jours' : `${number.format(live)} réussis, ${number.format(failed)} en échec (7 jours)`,
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-sm text-muted-foreground">État de la plateforme. Les indicateurs détaillés arrivent avec le tableau de bord.</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="space-y-1 p-5">
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="text-3xl font-bold tracking-tight">{s.value}</dd>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </dl>
    </div>
  )
}
