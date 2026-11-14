import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cacheHeadersConfig } from './src/lib/cache-headers.mjs'
import { securityHeadersConfig } from './src/lib/security-headers.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Resend envoie sur https://eflex.app/api/webhooks/ (slash final) : on sert
  // la route directement au lieu de répondre par une redirection 308 qu'un
  // webhook POST ne suivrait pas forcément.
  skipTrailingSlashRedirect: true,
  // Avatars des comptes GitHub affichés dans la connexion et le sélecteur de dépôts.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'github.com', pathname: '/**' }],
  },
  // BullMQ / ioredis sont des modules Node natifs : on les laisse externes au
  // bundle serveur (sinon webpack tente de résoudre leurs requires dynamiques).
  serverExternalPackages: ['bullmq', 'ioredis'],
  // En-têtes de sécurité globaux et règles de cache (assets publics, API,
  // tableau de bord, pages publiques). Détail : `src/lib/security-headers.mjs`
  // et `src/lib/cache-headers.mjs`.
  async headers() {
    return [...securityHeadersConfig(), ...cacheHeadersConfig()]
  },
  // Le build « standalone » reste à la racine de portail/ même quand le dépôt parent
  // contient un autre lockfile (sans cela, Next remonte au dossier du monorepo).
  outputFileTracingRoot: here,
  experimental: {
    // Le détecteur (packages/detector) est du TypeScript hors du dossier du portail.
    externalDir: true,
  },
  webpack(config) {
    // Le détecteur importe ses fichiers avec le suffixe « .js » (ESM) : on le résout vers les « .ts ».
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    // `packages/renderer` vit hors de portail/ : dans l'image Docker, `yaml`
    // n'existe que dans portail/node_modules. On l'y résout explicitement.
    config.resolve.alias = {
      ...config.resolve.alias,
      yaml: path.resolve(here, 'node_modules/yaml'),
    }
    return config
  },
}

export default nextConfig
