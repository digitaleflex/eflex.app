import { describe, expect, it } from 'vitest'
import {
  auditActionLabel,
  categoryOf,
  describeEvent,
  formatLiveClock,
  matchesLiveFilters,
  mergeLiveEvents,
  severityOf,
  toLiveCsv,
  toLiveText,
  type LiveEvent,
} from '@/lib/live-events'
import { wireFromEvent } from '@/lib/live-events-server'

let nextId = 1
const event = (over: Partial<LiveEvent> = {}): LiveEvent => ({
  id: nextId++,
  type: 'deployment.status',
  audience: 'org',
  organizationId: 'org-1',
  userId: null,
  payload: {},
  createdAt: '2026-11-10T12:00:00.000Z',
  organizationName: 'Acme',
  ...over,
})

describe('gravité et catégorie', () => {
  it('déduit la gravité du statut de déploiement', () => {
    expect(severityOf(event({ payload: { status: 'live' } }))).toBe('success')
    expect(severityOf(event({ payload: { status: 'failed' } }))).toBe('error')
    expect(severityOf(event({ payload: { status: 'cancelled' } }))).toBe('error')
    expect(severityOf(event({ payload: { status: 'building' } }))).toBe('info')
    expect(severityOf(event({ type: 'deployment.created', payload: { status: 'failed' } }))).toBe('error')
  })

  it('signale les suspensions et les types en erreur', () => {
    expect(severityOf(event({ type: 'audit.entry', payload: { action: 'user.ban' } }))).toBe('warning')
    expect(severityOf(event({ type: 'audit.entry', payload: { action: 'user.unban' } }))).toBe('info')
    expect(severityOf(event({ type: 'deployment.failed' }))).toBe('error')
    expect(severityOf(event({ type: 'worker.warning' }))).toBe('warning')
  })

  it('classe les types par domaine', () => {
    expect(categoryOf('deployment.status')).toBe('deploiement')
    expect(categoryOf('project.created')).toBe('projet')
    expect(categoryOf('user.registered')).toBe('compte')
    expect(categoryOf('member.added')).toBe('compte')
    expect(categoryOf('audit.entry')).toBe('administration')
    expect(categoryOf('subscription.updated')).toBe('facturation')
    expect(categoryOf('notification.created')).toBe('autre')
  })
})

describe('description en français', () => {
  it('nomme les déploiements avec leur statut et le projet', () => {
    expect(describeEvent(event({ payload: { status: 'failed', name: 'Boutique' } }))).toEqual({
      title: 'Déploiement échoué',
      detail: 'Boutique',
    })
    expect(describeEvent(event({ payload: { status: 'live' } })).title).toBe('Déploiement réussi')
  })

  it('traduit les actions d’audit et les inscriptions', () => {
    expect(auditActionLabel('user.ban')).toBe('Compte suspendu')
    expect(auditActionLabel('deployment.rollback')).toBe('Retour à une version précédente')
    expect(auditActionLabel('une.action.inconnue')).toBe('Action d’administration (une.action.inconnue)')
    expect(describeEvent(event({ type: 'audit.entry', payload: { action: 'payment.refund', targetType: 'payment' } }))).toEqual({
      title: 'Paiement remboursé',
      detail: 'payment',
    })
    expect(describeEvent(event({ type: 'user.registered', payload: { email: 'a@exemple.fr' } }))).toEqual({
      title: 'Nouvelle inscription',
      detail: 'a@exemple.fr',
    })
  })

  it('tronque les détails très longs', () => {
    const { detail } = describeEvent(event({ type: 'project.created', payload: { name: 'x'.repeat(400) } }))
    expect(detail).not.toBeNull()
    expect(detail!.length).toBeLessThanOrEqual(161)
    expect(detail!.endsWith('…')).toBe(true)
  })
})

describe('filtrage', () => {
  const events = [
    event({ type: 'deployment.status', payload: { status: 'failed', name: 'Boutique' }, organizationName: 'Acme' }),
    event({ type: 'deployment.status', payload: { status: 'live', name: 'Vitrine' }, organizationName: 'Beta' }),
    event({ type: 'audit.entry', payload: { action: 'user.ban', targetType: 'user' }, organizationName: 'Acme' }),
  ]

  it('filtre par catégorie et par gravité', () => {
    expect(events.filter((e) => matchesLiveFilters(e, { category: 'administration', severity: 'all' }))).toHaveLength(1)
    expect(events.filter((e) => matchesLiveFilters(e, { category: 'all', severity: 'error' }))).toHaveLength(1)
    expect(events.filter((e) => matchesLiveFilters(e, { category: 'deploiement', severity: 'success' }))).toHaveLength(1)
  })

  it('recherche sans tenir compte de la casse, sur plusieurs mots', () => {
    const filters = { category: 'all' as const, severity: 'all' as const, query: '  BOUTIQUE  ' }
    expect(events.filter((e) => matchesLiveFilters(e, filters))).toHaveLength(1)
    expect(events.filter((e) => matchesLiveFilters(e, { ...filters, query: 'beta vitrine' }))).toHaveLength(1)
    expect(events.filter((e) => matchesLiveFilters(e, { ...filters, query: 'introuvable' }))).toHaveLength(0)
  })

  it('indexe aussi le type, l’organisation et la charge utile', () => {
    expect(events.filter((e) => matchesLiveFilters(e, { category: 'all', severity: 'all', query: 'audit.entry' }))).toHaveLength(1)
    expect(events.filter((e) => matchesLiveFilters(e, { category: 'all', severity: 'all', query: 'acme' }))).toHaveLength(2)
  })
})

describe('fusion des lots', () => {
  it('dédoublonne, ordonne et borne l’historique', () => {
    const a = event({ id: 3 })
    const b = event({ id: 1 })
    const first = mergeLiveEvents([], [a, b])
    expect(first.events.map((e) => e.id)).toEqual([1, 3])
    expect(first.added).toBe(2)

    const again = mergeLiveEvents(first.events, [{ ...a, organizationName: 'Nouveau nom' }])
    expect(again.added).toBe(0)
    expect(again.events.find((e) => e.id === 3)?.organizationName).toBe('Nouveau nom')

    const capped = mergeLiveEvents([], [1, 2, 3, 4].map((id) => event({ id })), 2)
    expect(capped.events.map((e) => e.id)).toEqual([3, 4])
    expect(capped.dropped).toBe(2)
  })
})

describe('assainissement côté serveur', () => {
  it('masque les secrets et tronque les textes avant l’envoi', () => {
    const source: LiveEvent = event({
      payload: {
        name: 'Boutique',
        token: 'secret-de-test',
        nested: { password: 'hunter2', apiKey: 'sk_live_x', ok: true },
        message: 'x'.repeat(2_000),
      },
    })
    const wire = wireFromEvent(source, 'Acme')
    expect(wire.organizationName).toBe('Acme')
    expect(wire.payload.name).toBe('Boutique')
    expect(wire.payload.token).toBe('[masqué]')
    expect((wire.payload.nested as Record<string, unknown>).password).toBe('[masqué]')
    expect((wire.payload.nested as Record<string, unknown>).apiKey).toBe('[masqué]')
    expect(((wire.payload.message as string) ?? '').length).toBeLessThan(600)
    expect(JSON.stringify(wire)).not.toContain('secret-de-test')
    expect(JSON.stringify(wire)).not.toContain('hunter2')
    // La source n'est pas modifiée (l'événement en mémoire reste complet pour les autres consommateurs).
    expect(source.payload.token).toBe('secret-de-test')
  })
})

describe('exports', () => {
  const events = [
    event({
      id: 10,
      type: 'deployment.status',
      payload: { status: 'failed', name: 'Boutique; "speciale"' },
      organizationName: 'Acme',
    }),
    event({ id: 11, type: 'user.registered', payload: { email: 'a@exemple.fr' }, organizationName: null, organizationId: null }),
  ]

  it('produit un CSV avec en-tête, séparateur point-virgule et guillemets échappés', () => {
    const csv = toLiveCsv(events)
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('Horodatage;Gravité;Catégorie;Type;Description;Détail;Organisation;Identifiant')
    expect(lines).toHaveLength(3)
    expect(csv).toContain('"Boutique; ""speciale"""')
    expect(csv).toContain('10')
    expect(csv).toContain('Plateforme')
  })

  it('produit un texte lisible, une ligne par événement', () => {
    const text = toLiveText(events)
    const lines = text.trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('ERREUR')
    expect(lines[0]).toContain('Déploiement échoué — Boutique; "speciale"')
    expect(lines[1]).toContain('Nouvelle inscription')
    expect(lines[1]).toContain('Plateforme')
    expect(toLiveText([])).toBe('')
  })

  it('affiche l’heure en Europe/Paris, stable entre serveur et navigateur', () => {
    expect(formatLiveClock('2026-11-10T12:00:00.000Z')).toBe('13:00:00')
    expect(formatLiveClock('2026-07-10T12:00:00.000Z')).toBe('14:00:00')
    expect(formatLiveClock('invalide')).toBe('—')
  })
})
