'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FrameworkIcon } from '@/components/framework-icon'

const frameworks = [
  { value: 'nextjs', label: 'Next.js' },
  { value: 'vite', label: 'Vite' },
  { value: 'astro', label: 'Astro' },
  { value: 'nuxt', label: 'Nuxt' },
  { value: 'node', label: 'Node.js' },
  { value: 'laravel', label: 'Laravel' },
  { value: 'python', label: 'Python' },
  { value: 'static', label: 'Statique' },
  { value: 'docker', label: 'Docker' },
]

interface EnvVar { key: string; value: string }

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [framework, setFramework] = useState('')
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: '', value: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addEnvVar = () => setEnvVars([...envVars, { key: '', value: '' }])
  const removeEnvVar = (index: number) =>
    setEnvVars(envVars.filter((_, i) => i !== index))
  const updateEnvVar = (index: number, field: keyof EnvVar, val: string) => {
    const updated = [...envVars]
    updated[index] = { ...updated[index], [field]: val }
    setEnvVars(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          repoUrl,
          branch,
          framework,
          envVars: envVars.filter((v) => v.key.trim() !== ''),
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Erreur lors de la création du projet.')
      } else {
        if (data.warning) {
          alert(`Projet créé mais déploiement en attente : ${data.warning}`)
        }
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Nouveau projet</h2>
        <p className="text-muted-foreground">Importez un dépôt GitHub et déployez-le en quelques secondes.</p>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card>
          <CardHeader><h3 className="font-semibold">Informations</h3></CardHeader>
          <CardContent className="space-y-4">
            <Input id="name" label="Nom du projet" placeholder="mon-super-projet" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input id="repo" label="URL du dépôt GitHub" placeholder="https://github.com/votre-compte/mon-repo" hint="Le dépôt doit être public ou vous devez avoir configuré l'accès GitHub." value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} required />
            <Input id="branch" label="Branche" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h3 className="font-semibold">Stack</h3></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Notre moteur détecte automatiquement votre stack. Vous pouvez la laisser vide ou forcer un framework.</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {frameworks.map((f) => (
                <button key={f.value} type="button" onClick={() => setFramework(framework === f.value ? '' : f.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all duration-150 ${
                    framework === f.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50 hover:bg-muted'
                  }`}>
                  <FrameworkIcon framework={f.value} className="h-6 w-6" />
                  <span className="text-xs">{f.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Variables d&apos;environnement</h3>
                <p className="text-sm text-muted-foreground mt-1">Ces valeurs sont chiffrées au repos et ne seront jamais exposées dans Git ou les logs.</p>
              </div>
              <Badge variant="outline">🔒 Chiffré</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {envVars.map((env, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <Input placeholder="CLEF" value={env.key} onChange={(e) => updateEnvVar(idx, 'key', e.target.value)} className="flex-1" />
                <Input placeholder="valeur" type="password" value={env.value} onChange={(e) => updateEnvVar(idx, 'value', e.target.value)} className="flex-1" />
                <Button variant="ghost" size="icon" type="button" onClick={() => removeEnvVar(idx)} disabled={envVars.length === 1} className="shrink-0 text-muted-foreground hover:text-destructive">✕</Button>
              </div>
            ))}
            <Button variant="ghost" type="button" size="sm" onClick={addEnvVar}>+ Ajouter une variable</Button>
          </CardContent>
        </Card>

        <div className="flex items-center gap-4">
          <Button type="submit" size="lg" loading={loading}>Démarrer le déploiement</Button>
          <Button variant="ghost" type="button" size="lg" onClick={() => router.push('/dashboard')}>Annuler</Button>
        </div>
      </form>
    </div>
  )
}