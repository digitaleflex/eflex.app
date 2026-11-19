'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ServiceIcon } from '@/components/service-icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SERVICE_CATEGORIES } from '@/lib/managed-services-catalog'
import { STATE_LABELS, STATE_TONES, type UnifiedService } from '@/lib/services-hub'

const BADGE_TONE: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  info: 'bg-info/10 text-info border-info/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  muted: 'bg-muted text-muted-foreground border-border',
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', BADGE_TONE[tone] ?? BADGE_TONE.muted)}>{label}</span>
}

function CapabilityRow({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'muted' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', tone === 'ok' ? 'text-foreground' : 'text-muted-foreground')}>{value}</span>
    </div>
  )
}

export function ServiceDetailDialog({
  service,
  canManage,
  creating,
  onClose,
  onCreate,
  onViewActive,
}: {
  service: UnifiedService | null
  canManage: boolean
  creating: boolean
  onClose: () => void
  onCreate: (kind: string) => void
  onViewActive?: (kind: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setConfirming(false)
  }, [service?.key])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (service && !dialog.open) dialog.showModal()
    if (!service && dialog.open) dialog.close()
  }, [service])


  const creatable = service?.state === 'creatable' && canManage && Boolean(service.managedDatabaseKind)

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault()
        if (!creating) onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current && !creating) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50"
    >
      {service && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="space-y-4 overflow-y-auto p-6">
            <div className="flex items-start gap-3">
              <ServiceIcon kind={service.icon} label={service.label} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-semibold">{service.label}</h2>
                <p id={descId} className="mt-0.5 text-sm text-muted-foreground">
                  {SERVICE_CATEGORIES[service.category]} · {service.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge label={STATE_LABELS[service.state]} tone={STATE_TONES[service.state]} />
                  {service.envKey && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{service.envKey}</span>
                  )}
                  {service.provider && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Fournisseur : {service.provider === 'coolify' ? 'Coolify' : 'EFLEX'}
                    </span>
                  )}
                  {service.adjusted && <Badge label="Capacité ajustée" tone="info" />}
                </div>
              </div>
            </div>

            <section aria-label="Compatibilité et capacités" className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-medium">Compatibilité sur cette instance</h3>
              {service.managedDatabaseKind ? (
                <div className="divide-y divide-border">
                  <CapabilityRow label="Provisionnement" value={service.provisionSupported ? 'Pris en charge' : 'Non disponible'} tone={service.provisionSupported ? 'ok' : 'muted'} />
                  <CapabilityRow label="Cycle de vie (démarrage, arrêt, redémarrage)" value={service.lifecycleSupported ? 'Pris en charge' : 'Non disponible'} tone={service.lifecycleSupported ? 'ok' : 'muted'} />
                  <CapabilityRow label="Sauvegarde intégrée EFLEX" value={service.backupSupported ? 'Disponible' : 'Non disponible'} tone={service.backupSupported ? 'ok' : 'muted'} />
                  <CapabilityRow label="Restauration intégrée EFLEX" value={service.restoreSupported ? 'Disponible' : 'Non disponible'} tone={service.restoreSupported ? 'ok' : 'muted'} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {service.state === 'coolify-oneclick' && 'Service référencé comme modèle one-click Coolify. L’activation et la gestion depuis EFLEX seront proposées ultérieurement.'}
                  {service.state === 'eflex-managed' && 'Service prévu en gestion EFLEX (provisionnement, réseau privé, secrets, cycle de vie). Il n’est pas encore provisionnable depuis le portail.'}
                  {service.state === 'planned' && 'Service indexé pour référence. Son intégration n’est pas encore disponible.'}
                </p>
              )}

              {service.envKey && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Variable principale injectée : <span className="font-mono text-foreground">{service.envKey}</span>{' '}
                    <span>(valeur chiffrée, réseau Docker privé).</span>
                  </p>
                  {service.envAliases.length > 0 && (
                    <p>
                      Alias compatibles injectés si disponibles :{' '}
                      <span className="font-mono text-foreground">{service.envAliases.join(', ')}</span>
                    </p>
                  )}
                </div>
              )}

              {service.reason && (
                <p role="status" className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
                  {service.reason}
                </p>
              )}
              {service.notes.length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {service.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              )}
            </section>

            {confirming && creatable && service.managedDatabaseKind && (
              <section aria-label="Confirmation" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <h3 className="text-sm font-medium">Confirmer la création</h3>
                <p className="text-xs text-muted-foreground">
                  La base <span className="font-medium text-foreground">{service.label}</span> sera provisionnée pour ce projet.
                  La variable <span className="font-mono text-foreground">{service.envKey}</span>
                  {service.envAliases.length > 0 ? (
                    <>
                      {' '}et les alias compatibles libres (<span className="font-mono text-foreground">{service.envAliases.join(', ')}</span>)
                    </>
                  ) : null}{' '}
                  seront injectés (valeurs chiffrées).
                  {service.backupSupported
                    ? ' Les sauvegardes intégrées pourront être configurées selon l’instance.'
                    : ' Aucune sauvegarde intégrée EFLEX n’est prévue pour ce moteur.'}{' '}
                  Un déploiement pourra être nécessaire pour appliquer la connexion.
                </p>
              </section>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {service.state === 'active' && 'Cette ressource est déjà active pour le projet.'}
              {service.state === 'creatable' && !canManage && 'Création réservée aux membres autorisés du projet.'}
              {service.state === 'unavailable' && 'Non créable sur cette instance dans l’état actuel.'}
              {(service.state === 'coolify-oneclick' || service.state === 'eflex-managed' || service.state === 'planned') &&
                'Service indexé, non provisionnable depuis EFLEX pour le moment.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={confirming ? () => setConfirming(false) : onClose} disabled={creating}>
                {confirming ? 'Retour' : 'Fermer'}
              </Button>
              {service.state === 'active' && service.managedDatabaseKind && onViewActive && (
                <Button type="button" variant="outline" onClick={() => onViewActive(service.managedDatabaseKind!)}>
                  Voir la ressource
                </Button>
              )}
              {creatable && service.managedDatabaseKind && !confirming && (
                <Button type="button" onClick={() => setConfirming(true)}>
                  Créer cette base
                </Button>
              )}
              {creatable && service.managedDatabaseKind && confirming && (
                <Button type="button" loading={creating} onClick={() => onCreate(service.managedDatabaseKind!)}>
                  Confirmer la création
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
