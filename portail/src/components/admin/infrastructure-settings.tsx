'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { PlatformSettings } from '@/lib/platform-settings'

const ANNOUNCEMENT_LEVELS = [
  { value: 'info', label: 'Information' },
  { value: 'warning', label: 'Avertissement' },
] as const

function checkboxClass(disabled: boolean): string {
  return [
    'h-5 w-5 shrink-0 rounded-md border-input text-primary accent-primary',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    disabled ? 'cursor-not-allowed opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Réglages de plateforme appliqués sans redéploiement. Enregistrés en base
 * (`PlatformSetting`) : le mode maintenance ajoute le bandeau global et
 * suspend les nouveaux déploiements ; les inscriptions fermées bloquent la
 * création de compte ; l'annonce s'affiche dans la console.
 */
export function InfrastructureSettingsForm({
  initial,
  maintenanceForced,
  source,
  maxMaintenanceMessage,
  maxAnnouncement,
}: {
  initial: PlatformSettings
  maintenanceForced: boolean
  source: 'database' | 'environment'
  maxMaintenanceMessage: number
  maxAnnouncement: number
}) {
  const router = useRouter()
  const ids = {
    maintenance: useId(),
    maintenanceMessage: useId(),
    signups: useId(),
    announcement: useId(),
    level: useId(),
  }

  const [form, setForm] = useState<PlatformSettings>(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const dirty = (Object.keys(form) as Array<keyof PlatformSettings>).some((key) => form[key] !== initial[key])

  function set<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage(null)
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/infrastructure/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = (await response.json().catch(() => ({}))) as { settings?: PlatformSettings; error?: string }
      if (!response.ok || !body.settings) {
        setMessage({ tone: 'error', text: body.error ?? 'Enregistrement impossible.' })
        return
      }
      setForm(body.settings)
      setMessage({ tone: 'success', text: 'Réglages enregistrés. Ils s’appliquent immédiatement, sans redéploiement.' })
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: 'Impossible de contacter le serveur.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <label
            htmlFor={ids.maintenance}
            className={
              maintenanceForced
                ? 'flex min-h-11 cursor-not-allowed items-center gap-3 text-sm font-medium'
                : 'flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium'
            }
          >
            <input
              id={ids.maintenance}
              type="checkbox"
              className={checkboxClass(maintenanceForced)}
              checked={form.maintenanceEnabled || maintenanceForced}
              disabled={maintenanceForced}
              aria-describedby={`${ids.maintenance}-hint`}
              onChange={(event) => set('maintenanceEnabled', event.target.checked)}
            />
            Mode maintenance
          </label>
          <p id={`${ids.maintenance}-hint`} className="text-xs text-muted-foreground">
            {maintenanceForced
              ? 'Imposé par la variable d’environnement MAINTENANCE_MODE : la maintenance ne peut pas être désactivée depuis cette page.'
              : 'Affiche le bandeau global et refuse les nouveaux déploiements avec un message explicite.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.maintenanceMessage} className="block text-sm font-medium">
            Message de maintenance
          </label>
          <textarea
            id={ids.maintenanceMessage}
            value={form.maintenanceMessage}
            onChange={(event) => set('maintenanceMessage', event.target.value)}
            rows={2}
            maxLength={maxMaintenanceMessage}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <p className="text-xs text-muted-foreground">
            Affiché sur la page de maintenance et dans le bandeau. {form.maintenanceMessage.length}/
            {maxMaintenanceMessage} caractères. Laisser vide pour le message par défaut.
          </p>
        </div>
      </div>

      <div className="space-y-1 border-t border-border pt-4">
        <label htmlFor={ids.signups} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <input
            id={ids.signups}
            type="checkbox"
            className={checkboxClass(false)}
            checked={form.signupsEnabled}
            aria-describedby={`${ids.signups}-hint`}
            onChange={(event) => set('signupsEnabled', event.target.checked)}
          />
          Inscriptions ouvertes
        </label>
        <p id={`${ids.signups}-hint`} className="text-xs text-muted-foreground">
          Réglage exposé publiquement sur <code className="font-mono text-xs">/api/maintenance</code> pour la page
          d’inscription. Les comptes existants restent actifs dans tous les cas.
        </p>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <label htmlFor={ids.announcement} className="block text-sm font-medium">
            Annonce dans la console
          </label>
          <textarea
            id={ids.announcement}
            value={form.announcement}
            onChange={(event) => set('announcement', event.target.value)}
            rows={2}
            maxLength={maxAnnouncement}
            className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <p className="text-xs text-muted-foreground">
            Vide par défaut. {form.announcement.length}/{maxAnnouncement} caractères. Laisser vide pour masquer
            l’annonce.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.level} className="block text-sm font-medium">
            Niveau de l’annonce
          </label>
          <select
            id={ids.level}
            value={form.announcementLevel}
            onChange={(event) => set('announcementLevel', event.target.value === 'warning' ? 'warning' : 'info')}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {ANNOUNCEMENT_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>

        {form.announcement.trim().length > 0 && (
          <div
            className={
              form.announcementLevel === 'warning'
                ? 'rounded-xl border border-warning/40 bg-warning-surface p-3 text-sm text-foreground'
                : 'rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-foreground'
            }
          >
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">Aperçu de l’annonce</p>
            <p className="mt-1">{form.announcement}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="button" loading={saving} disabled={!dirty} onClick={() => void save()}>
          Enregistrer les réglages
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => {
            setForm(initial)
            setMessage(null)
          }}
        >
          Annuler les modifications
        </Button>
        <p className="text-xs text-muted-foreground">
          {source === 'database'
            ? 'Réglages lus en base.'
            : 'Aucun réglage en base : valeurs par défaut et variables d’environnement.'}{' '}
          Chaque enregistrement est audité.
        </p>
      </div>

      <div aria-live="polite">
        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-success'}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  )
}
