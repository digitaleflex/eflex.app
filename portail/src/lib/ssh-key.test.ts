import { createPublicKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generateDeployKeyPair } from './ssh-key'

describe('generateDeployKeyPair', () => {
  it('produit une clé privée PKCS#8 et une clé publique OpenSSH ssh-rsa', () => {
    const { privateKeyPem, publicKeyOpenSsh } = generateDeployKeyPair()
    expect(privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----')
    expect(publicKeyOpenSsh).toMatch(/^ssh-rsa [A-Za-z0-9+/=]+ eflex$/)

    // La partie base64 doit contenir le type, l'exposant et le module aux formats SSH.
    const blob = Buffer.from(publicKeyOpenSsh.split(' ')[1]!, 'base64')
    const typeLength = blob.readUInt32BE(0)
    expect(blob.subarray(4, 4 + typeLength).toString()).toBe('ssh-rsa')
    const exponentLength = blob.readUInt32BE(4 + typeLength)
    expect(exponentLength).toBeGreaterThan(0)
  })

  it('la clé publique correspond bien à la clé privée', () => {
    const { privateKeyPem, publicKeyOpenSsh } = generateDeployKeyPair()
    const derived = createPublicKey(privateKeyPem)
    const blob = Buffer.from(publicKeyOpenSsh.split(' ')[1]!, 'base64')
    const typeLength = blob.readUInt32BE(0)
    const exponentLength = blob.readUInt32BE(4 + typeLength)
    const exponent = blob.subarray(8 + typeLength, 8 + typeLength + exponentLength)
    // Un mpint peut commencer par 0x00 : on le retire avant comparaison JWK.
    const normalized = exponent[0] === 0 ? exponent.subarray(1) : exponent
    expect(derived.export({ format: 'jwk' }).e).toBe(normalized.toString('base64url'))
  })
})
