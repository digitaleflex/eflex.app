import { createPublicKey, generateKeyPairSync } from 'node:crypto'

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value, 0)
  return buffer
}

function sshString(value: string | Buffer): Buffer {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return Buffer.concat([uint32(buffer.length), buffer])
}

/** Entier au format SSH `mpint` : un zéro de tête si le bit de poids fort est à 1. */
function sshMpint(value: Buffer): Buffer {
  const positive = (value[0] ?? 0) & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value
  return sshString(positive)
}

/**
 * Génère une paire de clés RSA pour une deploy key GitHub (lecture seule).
 * La clé publique est au format OpenSSH (`ssh-rsa AAAA…`) attendu par l'API
 * GitHub ; la clé privée PKCS#8 est acceptée par Coolify/ssh pour le clone.
 */
export function generateDeployKeyPair(): { privateKeyPem: string; publicKeyOpenSsh: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const jwk = createPublicKey({ key: publicKey, format: 'der', type: 'spki' }).export({ format: 'jwk' })
  if (!jwk.e || !jwk.n) throw new Error('Clé publique RSA illisible.')
  const exponent = Buffer.from(jwk.e, 'base64url')
  const modulus = Buffer.from(jwk.n, 'base64url')
  const blob = Buffer.concat([sshString('ssh-rsa'), sshMpint(exponent), sshMpint(modulus)])

  return {
    privateKeyPem: privateKey as unknown as string,
    publicKeyOpenSsh: `ssh-rsa ${blob.toString('base64')} eflex`,
  }
}
