'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ServiceIcon } from '@/components/service-icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SERVICE_CATEGORIES } from '@/lib/managed-services-catalog'
import { MATURITY_LABELS, OPERATION_LABELS, STATE_LABELS, STATE_TONES, type UnifiedService } from '@/lib/services-hub'

const BADGE_TONE: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  info: 'bg-info/10 text-info border-info/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  muted: 'bg-muted text-muted-foreground border-border',
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', BADGE_TONE[tone] ?? BADGE_TONE.muted)}>{label}</span>
}

function CapabilityRow({ label, value, tone, reason }: { label: string; value: string; tone?: 'ok' | 'muted'; reason?: string }) {
  return (
    <div className="space-y-0.5 py-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium', tone === 'ok' ? 'text-foreground' : 'text-muted-foreground')}>{value}</span>
      </div>
      {reason && <p className="text-xs leading-snug text-muted-foreground">{reason}</p>}
    </div>
  )
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  )
}

export function ServiceDetailDialog({
  service,
  canManage,
  creating,
  onClose,
  onCreate,
  onCreateService,
  onViewActive,
}: {
  service: UnifiedService | null
  canManage: boolean
  creating: boolean
  onClose: () => void
  onCreate: (kind: string) => void
  onCreateService?: (catalogId: string) => void
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

  const creatableDatabase = service?.state === 'creatable' && canManage && Boolean(service.managedDatabaseKind)
  const creatableOneClick = service?.state === 'creatable' && canManage && Boolean(service.coolifyServiceType) && !service.managedDatabaseKind
  const creatable = creatableDatabase || creatableOneClick
  const maturityTone = service?.maturity === 'stable' ? 'success' : service?.maturity === 'experimental' ? 'warning' : service?.maturity === 'planned' ? 'muted' : 'muted'

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
                  {service.maturity && service.maturity !== 'stable' && (
                    <Badge label={MATURITY_LABELS[service.maturity] ?? service.maturity} tone={maturityTone} />
                  )}
                  {service.envKey && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{service.envKey}</span>
                  )}
                  {service.adjusted && <Badge label="Capacité ajustée" tone="info" />}
                </div>
              </div>
            </div>

            <section aria-label="Compatibilité et capacités" className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-medium">Compatibilité et capacités réelles</h3>
              {service.managedDatabaseKind || service.operations ? (
                <div className="divide-y divide-border">
                  {service.operations && service.operations.length > 0 ? (
                    service.operations.map((op) => (
                      <CapabilityRow
                        key={op.operation}
                        label={OPERATION_LABELS[op.operation] ?? op.operation}
                        value={op.supported ? `Pris en charge${op.provider ? '' : ''}` : 'Non disponible'}
                        tone={op.supported ? 'ok' : 'muted'}
                        reason={op.reason}
                      />
                    ))
                  ) : (
                    <>
                      <CapabilityRow label="Provisionnement" value={service.provisionSupported ? 'Pris en charge' : 'Non disponible'} tone={service.provisionSupported ? 'ok' : 'muted'} />
                      <CapabilityRow label="Cycle de vie (démarrage, arrêt, redémarrage)" value={service.lifecycleSupported ? 'Pris en charge' : 'Non disponible'} tone={service.lifecycleSupported ? 'ok' : 'muted'} />
                      <CapabilityRow label="Sauvegarde intégrée EFLEX" value={service.backupSupported ? 'Disponible' : 'Non disponible'} tone={service.backupSupported ? 'ok' : 'muted'} />
                      <CapabilityRow label="Restauration intégrée EFLEX" value={service.restoreSupported ? 'Disponible' : 'Non disponible'} tone={service.restoreSupported ? 'ok' : 'muted'} />
                    </>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {service.coolifyServiceType && service.state === 'creatable' &&
                    'Service provisionnable via un modèle prêt à l’emploi (si disponible sur l’hébergement). La configuration détaillée peut nécessiter des ajustements après création.'}
                  {service.state === 'coolify-oneclick' && !service.coolifyServiceType &&
                    'Service référencé comme modèle prêt à l’emploi : aucun parcours de provisionnement automatique n’est câblé dans le portail pour le moment.'}
                  {service.state === 'eflex-managed' &&
                    'Candidat EFLEX-géré (réseau privé, persistance, secrets, healthcheck, supervision). Aucun provisionnement automatique : un adaptateur validé doit être activé avant toute promesse.'}
                  {service.state === 'planned' && 'Service indexé pour référence. Son intégration n’est pas encore disponible.'}
                </p>
              )}

              {service.selectionPolicy?.reason && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Politique de sélection :</span> {service.selectionPolicy.reason}
                </p>
              )}

              {service.envKey && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Variable principale : <span className="font-mono text-foreground">{service.envKey}</span>{' '}
                    <span>(valeur chiffrée, réseau privé).</span>
                  </p>
                  {service.envAliases.length > 0 && (
                    <p>
                      Alias compatibles (si disponibles) :{' '}
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
            </section>

            {(service.prerequisites.length > 0 || service.limits.length > 0 || service.notes.length > 0) && (
              <section aria-label="Prérequis et limites" className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                <BulletList title="Prérequis" items={service.prerequisites} />
                <BulletList title="Limites connues" items={service.limits} />
                {service.notes.length > 0 && (
                  <div className="sm:col-span-2">
                    <BulletList title="Notes" items={service.notes} />
                  </div>
                )}
              </section>
            )}

            {confirming && creatableDatabase && service.managedDatabaseKind && (
              <section aria-label="Confirmation" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <h3 className="text-sm font-medium">Confirmer la création</h3>
                <p className="text-xs text-muted-foreground">
                  La base <span className="font-medium text-foreground">{service.label}</span> sera créée pour ce projet.
                  {service.envKey && (
                    <> La variable <span className="font-mono text-foreground">{service.envKey}</span>{service.envAliases.length > 0 ? <> (et alias compatibles libres)</> : null} sera injectée (valeur chiffrée, réseau privé).</>
                  )}
                  {service.backupSupported
                    ? ' Des sauvegardes intégrées peuvent être configurées selon l’instance.'
                    : ' Aucune sauvegarde intégrée EFLEX n’est disponible pour ce moteur.'}{' '}
                  Un déploiement peut être nécessaire pour appliquer la connexion.
                </p>
                {service.maturity === 'experimental' && (
                  <p className="text-xs text-warning">Moteur expérimental : validez le comportement (URL, persistance, cycle de vie) avant tout usage critique.</p>
                )}
              </section>
            )}
            {confirming && creatableOneClick && service.coolifyServiceType && (
              <section aria-label="Confirmation" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <h3 className="text-sm font-medium">Confirmer le provisionnement</h3>
                <p className="text-xs text-muted-foreground">
                  Le service <span className="font-medium text-foreground">{service.label}</span> sera créé automatiquement dans l’environnement d’hébergement du projet. Le démarrage et la configuration détaillée (domaines, variables, volumes, exposition réseau) dépendront du modèle et des capacités de l’instance.
                </p>
              </section>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {service.state === 'active' && (service.activeService ? 'Ce service est déjà actif pour le projet.' : 'Cette ressource est déjà active pour le projet.')}
              {service.state === 'creatable' && !canManage && 'Provisionnement réservé aux membres autorisés du projet.'}
              {service.state === 'unavailable' && 'Non créable sur cette instance dans l’état actuel.'}
              {(service.state === 'coolify-oneclick' || service.state === 'eflex-managed' || service.state === 'planned') &&
                'Non provisionnable automatiquement depuis EFLEX dans l’état actuel.'}
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
              {service.state === 'active' && service.activeService && (
                <span className="self-center text-xs text-muted-foreground">Service actif : <span className="font-mono">{service.activeService.name}</span></span>
              )}
              {creatable && !confirming && (
                <Button type="button" onClick={() => setConfirming(true)}>
                  {creatableOneClick ? 'Provisionner ce service' : 'Créer cette base'}
                </Button>
              )}
              {creatableDatabase && confirming && (
                <Button type="button" loading={creating} onClick={() => onCreate(service.managedDatabaseKind!)}>
                  Confirmer la création
                </Button>
              )}
              {creatableOneClick && confirming && onCreateService && (
                <Button type="button" loading={creating} onClick={() => onCreateService(service.id)}>
                  Confirmer le provisionnement
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
