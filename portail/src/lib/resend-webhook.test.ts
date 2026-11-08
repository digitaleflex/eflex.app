import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyResendWebhook } from './resend-webhook'

const SECRET = 'whsec_' + Buffer.from('a'.repeat(32)).toString('base64')
const BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } })

function sign(body: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const digest = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return `v1,${digest}`
}

function headers(body: string, secret = SECRET, timestamp?: string) {
  const id = 'msg_123'
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000))
  return { id, timestamp: ts, signature: sign(body, id, ts, secret) }
}

describe('verifyResendWebhook', () => {
  it('accepte une signature valide', () => {
    expect(verifyResendWebhook(BODY, headers(BODY), SECRET)).toBe(true)
  })

  it('accepte un secret sans préfixe whsec_', () => {
    const secret = SECRET.slice('whsec_'.length)
    expect(verifyResendWebhook(BODY, headers(BODY, SECRET), secret)).toBe(true)
  })

  it('rejette un corps modifié', () => {
    expect(verifyResendWebhook(BODY + 'x', headers(BODY), SECRET)).toBe(false)
  })

  it('rejette une autre clé', () => {
    expect(verifyResendWebhook(BODY, headers(BODY), 'whsec_' + Buffer.from('b'.repeat(32)).toString('base64'))).toBe(false)
  })

  it('rejette un timestamp trop ancien (rejeu)', () => {
    const stale = String(Math.floor(Date.now() / 1000) - 600)
    expect(verifyResendWebhook(BODY, headers(BODY, SECRET, stale), SECRET)).toBe(false)
  })

  it('rejette les en-têtes manquants', () => {
    expect(verifyResendWebhook(BODY, { id: null, timestamp: null, signature: null }, SECRET)).toBe(false)
  })

  it('rejette un secret vide', () => {
    expect(verifyResendWebhook(BODY, headers(BODY), '')).toBe(false)
  })

  it('accepte une liste de signatures contenant la bonne', () => {
    const h = headers(BODY)
    h.signature = `v1,invalide ${h.signature} v1,autre`
    expect(verifyResendWebhook(BODY, h, SECRET)).toBe(true)
  })

  it('ignore les versions autres que v1', () => {
    const h = headers(BODY)
    h.signature = h.signature.replace(/^v1,/, 'v2,')
    expect(verifyResendWebhook(BODY, h, SECRET)).toBe(false)
  })
})
