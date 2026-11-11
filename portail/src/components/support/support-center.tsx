'use client'

import { useEffect, useMemo, useState } from 'react'
import { LifeBuoy, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SUPPORT_CATEGORIES, supportCategoryLabel, supportStatusLabel } from '@/lib/support-tickets'

type Ticket = {
  id: string
  subject: string
  category: string
  status: string
  priority: string
  createdAt: string
  updatedAt: string
  project?: { id: string; name: string } | null
  deployment?: { id: string; status: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
  waiting_user: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-900',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
  closed: 'bg-muted text-muted-foreground border-border',
}

export function SupportCenter() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [openForm, setOpenForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('build')
  const [body, setBody] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/support/tickets', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Chargement impossible')
      setTickets(data.tickets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, category, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Envoi impossible')
      setSuccess('Ticket envoyé. Notre équipe vous répondra dès que possible.')
      setSubject('')
      setBody('')
      setCategory('build')
      setOpenForm(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible')
    } finally {
      setSubmitting(false)
    }
  }

  const hint = useMemo(() => {
    if (category === 'build' || category === 'deploy') {
      return "Si l’erreur vient de votre dépôt (ex. version de Bun/Node non épinglée, lockfile incompatible, commande de build), corrigez le dépôt puis poussez un nouveau commit ou relancez le déploiement. La plateforme appliquera automatiquement la configuration détectée si le repo la déclare."
    }
    return "Décrivez le contexte (projet, branche, message d’erreur). N’incluez jamais de secrets, mots de passe ou clés API."
  }, [category])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-display-sm font-bold tracking-tight text-foreground">Aide & support</h1>
          <p className="mt-1 text-sm text-muted-foreground">Soumettez un ticket si vous avez besoin d’aide ou si un problème persiste après correction côté dépôt.</p>
        </div>
        <Button onClick={() => setOpenForm((v) => !v)} className="min-h-11 gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau ticket
        </Button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
      {success && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{success}</div>}

      {openForm && (
        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium"><LifeBuoy className="h-4 w-4 text-primary" aria-hidden="true" /> Décrire le problème</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">Sujet</span>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={5} maxLength={160} placeholder="Ex. Échec du build Bun / lockfile incompatible" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Catégorie</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                {SUPPORT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{hint}</div>
          <label className="space-y-1.5 text-sm block">
            <span className="font-medium">Description</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required minLength={20} maxLength={8000} rows={6} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Projet/branche concerné(e), message d’erreur, ce que vous avez déjà essayé. N’incluez pas de secrets." />
          </label>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>Annuler</Button>
            <Button type="submit" disabled={submitting} className="gap-2"><Send className="h-4 w-4" aria-hidden="true" />{submitting ? 'Envoi…' : 'Envoyer le ticket'}</Button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Vos tickets</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Aucun ticket pour le moment.</div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{t.subject}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {supportCategoryLabel(t.category)}
                      {t.project ? ` · ${t.project.name}` : ''}
                      {t.deployment ? ` · déploiement ${t.deployment.id.slice(0, 8)}` : ''}
                      {' · '}
                      {new Date(t.createdAt).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[t.status] ?? STATUS_STYLE.closed}`}>
                    {supportStatusLabel(t.status)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
