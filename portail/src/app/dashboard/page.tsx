'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Package, Rocket, CircleCheck, Globe, Plus } from 'lucide-react'
import { frameworkLabel } from '@/lib/frameworks'

interface Project {
  id: string
  name: string
  slug: string
  framework: string
  domain: string | null
  repoUrl: string
  branch: string
  updatedAt: string
  createdAt: string
  deployments: Array<{
    status: string
    createdAt: string
  }>
}

const statusVariant = (status: string): 'success' | 'warning' | 'destructive' | 'outline' => {
  switch (status) {
    case 'live': return 'success'
    case 'building': case 'deploying': return 'warning'
    case 'failed': return 'destructive'
    case 'rollbacked': return 'outline'
    default: return 'outline'
  }
}

const statusLabel = (status: string): string => {
  switch (status) {
    case 'live': return 'En ligne'
    case 'building': case 'deploying': return 'Build en cours'
    case 'failed': return 'Échec'
    case 'pending': return 'En attente'
    case 'rollbacked': return 'Annulé'
    default: return status
  }
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setProjects(data.projects || [])
      })
      .catch(() => setError('Impossible de charger les projets.'))
      .finally(() => setLoading(false))
  }, [])

  const stats = [
    { label: 'Projets actifs', value: projects.length.toString(), icon: <Package /> },
    { label: 'Déploiements', value: projects.reduce((c, p) => c + p.deployments.length, 0).toString(), icon: <Rocket /> },
    { label: 'En ligne', value: projects.filter(p => p.deployments[0]?.status === 'live').length.toString(), icon: <CircleCheck /> },
    { label: 'Domaines', value: projects.filter(p => p.domain).length.toString(), icon: <Globe /> },
  ]

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "À l'instant"
    if (mins < 60) return `Il y a ${mins} min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `Il y a ${hours}h`
    return `Il y a ${Math.floor(hours / 24)}j`
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projets</h1>
          <p className="text-sm text-muted-foreground">Vos applications et leur dernier déploiement.</p>
        </div>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center justify-center gap-2 h-11 px-4 text-sm rounded-lg font-medium bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nouveau projet
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="text-primary" aria-hidden="true">{stat.icon}</span>
                <span className="text-2xl font-bold tracking-tight">{loading ? '–' : stat.value}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projects */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Projets récents</h2>

        {loading ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">Chargement des projets…</CardContent></Card>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-4">
              <div className="text-4xl"><Rocket className="align-middle" /></div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Aucun projet pour le moment</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Importez votre premier projet depuis GitHub et déployez-le en quelques clics.
                </p>
              </div>
              <Link href="/dashboard/new" className="inline-flex items-center justify-center gap-2 h-11 px-4 text-sm rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" aria-hidden="true" />
                Créer mon premier projet
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const lastDeploy = project.deployments[0]
              return (
                <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="p-6 hover:shadow-md hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200 ease-out-expo space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold truncate">{project.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono truncate">{project.repoUrl}</p>
                      </div>
                      {lastDeploy && (
                        <Badge variant={statusVariant(lastDeploy.status)}>{statusLabel(lastDeploy.status)}</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{project.framework ? frameworkLabel(project.framework) : 'Détection auto'}</span>
                      <span>{timeAgo(project.updatedAt)}</span>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}