import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyFedapaySignature, verifyKkiapaySecret } from './payments'

describe('signatures de paiement', () => {
  it('vérifie la signature FedaPay t=…,s=…', () => {
    const secret = 'wh_sandbox_secret'
    const body = JSON.stringify({ name: 'transaction.approved', object: { id: 42 } })
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
    expect(verifyFedapaySignature(body, `t=${timestamp},s=${signature}`, secret)).toBe(true)
    expect(verifyFedapaySignature(body + ' ', `t=${timestamp},s=${signature}`, secret)).toBe(false)
    expect(verifyFedapaySignature(body, `t=${timestamp - 600},s=${signature}`, secret)).toBe(false)
    expect(verifyFedapaySignature(body, null, secret)).toBe(false)
  })

  it('vérifie le hash secret Kkiapay', () => {
    expect(verifyKkiapaySecret('secret-test', 'secret-test')).toBe(true)
    expect(verifyKkiapaySecret('secret-test', 'autre')).toBe(false)
    expect(verifyKkiapaySecret(null, 'secret-test')).toBe(false)
  })
})
