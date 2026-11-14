import { describe, expect, it } from 'vitest'
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_PERIOD_OPTIONS,
  auditActionCategory,
  auditDetailEntries,
  auditHref,
  auditHrefTemplate,
  auditSince,
  auditTailQuery,
  auditTargetHref,
  auditTargetLabel,
  auditWhere,
  isAuditFiltered,
  matchesAuditFilters,
  parseAuditQuery,
} from './admin-audit'

const NOW = new Date('2026-11-11T12:00:00.000Z')

describe('filtres du journal d’audit', () => {
  it('normalise les paramètres d’URL', () => {
    expect(parseAuditQuery({})).toEqual({ action: null, actor: '', target: '', days: 0, page: 1 })
    expect(parseAuditQuery({ action: 'action invalide !', jours: '12', page: '-1' })).toMatchObject({
      action: null,
      days: 0,
      page: 1,
    })
    expect(parseAuditQuery({ action: 'user.ban', acteur: ' admin@eflex.app ', cible: 'user', jours: '7', page: '2' })).toEqual({
      action: 'user.ban',
      actor: 'admin@eflex.app',
      target: 'user',
      days: 7,
      page: 2,
    })
  })

  it('cumule les restrictions Prisma sans élargir la sélection', () => {
    expect(auditWhere(parseAuditQuery({}), NOW)).toEqual({})
    expect(auditWhere(parseAuditQuery({ action: 'user.ban' }), NOW)).toEqual({ action: 'user.ban' })
    expect(auditWhere(parseAuditQuery({ jours: '7' }), NOW)).toEqual({
      createdAt: { gte: new Date('2026-11-04T12:00:00.000Z') },
    })
    const combined = auditWhere(parseAuditQuery({ action: 'user.ban', acteur: 'awa', cible: 'user', jours: '1' }), NOW)
    expect(combined).toEqual({
      AND: [
        { action: 'user.ban' },
        { actorEmail: { contains: 'awa', mode: 'insensitive' } },
        {
          OR: [
            { targetType: { contains: 'user', mode: 'insensitive' } },
            { targetId: { contains: 'user', mode: 'insensitive' } },
          ],
        },
        { createdAt: { gte: new Date('2026-11-10T12:00:00.000Z') } },
      ],
    })
  })

  it('calcule la fenêtre et détecte les filtres actifs', () => {
    expect(auditSince(0, NOW)).toBeNull()
    expect(auditSince(1, NOW)?.toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(isAuditFiltered(parseAuditQuery({}))).toBe(false)
    expect(isAuditFiltered(parseAuditQuery({ acteur: 'a' }))).toBe(true)
    expect(isAuditFiltered(parseAuditQuery({ jours: '7' }))).toBe(true)
  })

  it('vérifie une entrée reçue en direct', () => {
    const entry = {
      action: 'user.ban',
      targetType: 'user',
      targetId: 'user_123',
      actorEmail: 'Admin@EFLEX.app',
      createdAt: '2026-11-11T11:00:00.000Z',
    }
    expect(matchesAuditFilters(entry, parseAuditQuery({ action: 'user.ban', acteur: 'admin@' }), NOW)).toBe(true)
    expect(matchesAuditFilters(entry, parseAuditQuery({ cible: '123' }), NOW)).toBe(true)
    expect(matchesAuditFilters(entry, parseAuditQuery({ action: 'user.unban' }), NOW)).toBe(false)
    expect(matchesAuditFilters(entry, parseAuditQuery({ jours: '1' }), NOW)).toBe(true)
    expect(matchesAuditFilters(entry, parseAuditQuery({ jours: '1' }), new Date('2026-11-13T00:00:00.000Z'))).toBe(false)
  })

  it('construit les liens de filtres, de pagination et du suivi', () => {
    const query = parseAuditQuery({ action: 'user.ban', acteur: 'awa', jours: '7', page: '2' })
    expect(auditHref(query, { action: null })).toBe('/admin/audit?acteur=awa&jours=7&page=2')
    expect(auditHref(parseAuditQuery({}))).toBe('/admin/audit')
    expect(auditHrefTemplate(query)).toBe('/admin/audit?action=user.ban&acteur=awa&jours=7&page=')
    expect(auditTailQuery(query)).toBe('limit=50&action=user.ban&acteur=awa&jours=7')
  })

  it('classifie les actions et nomme les cibles', () => {
    expect(auditActionCategory('user.ban')).toBe('compte')
    expect(auditActionCategory('organization.plan.change')).toBe('facturation')
    expect(auditActionCategory('payment.refund')).toBe('facturation')
    expect(auditActionCategory('project.redeploy')).toBe('projet')
    expect(auditActionCategory('deployment.unblock')).toBe('deploiement')
    expect(auditActionCategory('deployment.logs.view')).toBe('consultation')
    expect(auditActionCategory('platform.settings.update')).toBe('infrastructure')
    expect(auditActionCategory('metrics.export')).toBe('consultation')
    expect(auditActionCategory('inconnu.action')).toBe('consultation')
    expect(auditTargetLabel('user')).toBe('Compte')
    expect(auditTargetLabel('custom')).toBe('custom')
    expect(auditTargetHref('project', 'proj_1')).toBe('/admin/projects/proj_1')
    expect(auditTargetHref('deployment', 'dep/1')).toBe('/admin/deployments/dep%2F1')
    expect(auditTargetHref('user', 'user_1')).toBeNull()
    expect(auditTargetHref('project', '')).toBeNull()
  })

  it('expose des options explicites', () => {
    expect(AUDIT_ACTION_OPTIONS.length).toBeGreaterThan(10)
    expect(AUDIT_ACTION_OPTIONS.every((option) => option.label.length > 0)).toBe(true)
    expect(AUDIT_ACTION_OPTIONS.some((option) => option.label.startsWith('Action d’administration'))).toBe(false)
    expect(AUDIT_PERIOD_OPTIONS[0]?.days).toBe(0)
  })
})

describe('détails du journal d’audit', () => {
  it('traduit les clés connues et écarte les clés sensibles', () => {
    const details = auditDetailEntries({
      reason: 'Contenu abusif',
      targetEmail: 'awa@exemple.com',
      token: 'secret',
      apiKey: 'secret',
      ip: '127.0.0.1',
      plan: 'pro',
    })
    expect(details).toEqual([
      { key: 'reason', label: 'Motif', value: 'Contenu abusif' },
      { key: 'targetEmail', label: 'Adresse cible', value: 'awa@exemple.com' },
      { key: 'plan', label: 'Plan', value: 'pro' },
    ])
  })

  it('borne les valeurs et ignore les détails absents', () => {
    expect(auditDetailEntries(null)).toEqual([])
    expect(auditDetailEntries(['a'])).toEqual([])
    const long = auditDetailEntries({ reason: 'x'.repeat(400) })
    expect(long[0]?.value.endsWith('…')).toBe(true)
    expect(long[0]?.value.length).toBe(201)
    expect(auditDetailEntries({ role: 'admin' }, 1)).toHaveLength(1)
    expect(auditDetailEntries({ role: null, plan: undefined, email: '' })).toEqual([])
  })
})
