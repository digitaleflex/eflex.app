import { createHash, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { stringify } from 'yaml'
import { traefikLabels } from '@eflex/renderer'
export { RESERVED_SUBDOMAINS } from '@/lib/reserved-subdomains'

/**
 * Outils d'exploitation de la plateforme, installés par E-FLEX dans Coolify sur des sous-domaines du
 * domaine racine (le DNS `*.<racine>` pointe déjà sur le serveur) :
 * - `uptime.<racine>` : Uptime Kuma, surveillance de disponibilité et alertes ;
 * - `metrics.<racine>` : Beszel, ressources des serveurs et des conteneurs ;
 * - `logs.<racine>` : Dozzle, journaux de tous les conteneurs en direct.
 *
 * Chaque outil est protégé par une authentification HTTP posée par le proxy (Traefik), avec un mot de
 * passe aléatoire affiché une seule fois. Elle empêche aussi un inconnu de créer le premier compte
 * administrateur d'Uptime Kuma ou de Beszel avant l'exploitant. Le hachage est au format `{SHA}`
 * (accepté par Traefik, sans « $ » à échapper dans les labels) : sûr ici car le mot de passe est long
 * et aléatoire. Les modèles « en un clic » de Coolify ne sont pas utilisés tels quels : celui de Dozzle
 * crée un compte `admin` avec le mot de passe `test`, et leurs labels Traefik visent des entrypoints
 * absents du proxy de l'hôte.
 */

export const OPS_TOOL_IDS = ['uptime', 'metrics', 'logs'] as const
export type OpsToolId = (typeof OPS_TOOL_IDS)[number]

export interface OpsTool {
  id: OpsToolId
  subdomain: string
  product: string
  title: string
  description: string
  /** Service exposé publiquement et son port interne. */
  service: string
  port: number
  /** Le service a besoin d'une clé d'agent à saisir après l'installation (Beszel). */
  needsAgentKey?: boolean
}

export const OPS_TOOLS: Record<OpsToolId, OpsTool> = {
  uptime: {
    id: 'uptime',
    subdomain: 'uptime',
    product: 'Uptime Kuma',
    title: 'Disponibilité des sites',
    description: 'Vérifie chaque minute que les sites répondent et prévient par e-mail, Telegram ou WhatsApp en cas de panne.',
    service: 'uptime-kuma',
    port: 3001,
  },
  metrics: {
    id: 'metrics',
    subdomain: 'metrics',
    product: 'Beszel',
    title: 'Ressources des serveurs',
    description: 'Processeur, mémoire, disque et réseau des serveurs et de chaque conteneur, avec historique et alertes.',
    service: 'beszel',
    port: 8090,
    needsAgentKey: true,
  },
  logs: {
    id: 'logs',
    subdomain: 'logs',
    product: 'Dozzle',
    title: 'Journaux en direct',
    description: 'Journaux de tous les conteneurs du serveur, en direct et avec recherche.',
    service: 'dozzle',
    port: 8080,
  },
}

export const opsServiceName = (id: OpsToolId) => `eflex-ops-${id}`

export function opsToolHost(id: OpsToolId, rootDomain: string): string {
  return `${OPS_TOOLS[id].subdomain}.${rootDomain}`
}

/** Mot de passe aléatoire (24 caractères, alphabet sans ambiguïté). */
export function generateOpsPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(24)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

/** Entrée `utilisateur:{SHA}base64` pour le middleware basicauth de Traefik. */
export function basicAuthEntry(user: string, password: string): string {
  return `${user}:{SHA}${createHash('sha1').update(password).digest('base64')}`
}

export const OPS_USER = 'admin'
export const OPS_PROXY_NETWORK = 'proxy'

/**
 * Réglages d'accès aux outils, lus dans l'environnement (appliqués à l'installation et à chaque
 * « Nouveau mot de passe ») :
 * - `OPS_ROOT_DOMAIN` : domaine des outils (défaut : domaine de la plateforme). Un domaine dédié, par
 *   exemple `ops.eflex.app` avec `*.ops.eflex.app` pointant vers l'adresse Tailscale du serveur, rend
 *   les outils invisibles depuis Internet ;
 * - `OPS_PRIVATE_NETWORK=tailscale` : n'accepte que les appareils du réseau privé Tailscale
 *   (100.64.0.0/10 et fd7a:115c:a1e0::/48) ;
 * - `OPS_ALLOWED_IPS` : adresses ou plages supplémentaires autorisées (séparées par des virgules) ;
 * - `OPS_CERT_RESOLVER` : résolveur de certificat Traefik (défaut `letsencrypt`, HTTP-01). Avec une
 *   adresse privée, utiliser le résolveur DNS-01 du serveur (`letsencrypt-dns`).
 * Sans `OPS_PRIVATE_NETWORK` ni `OPS_ALLOWED_IPS`, l'outil reste joignable depuis Internet, derrière son
 * mot de passe.
 */
export interface OpsAccess {
  rootDomain: string | null
  sourceRanges: string[]
  privateNetwork: 'tailscale' | null
  certResolver: string
  /** Entrées refusées de `OPS_ALLOWED_IPS` (affichées à l'exploitant). */
  invalid: string[]
}

export const TAILSCALE_RANGES = ['100.64.0.0/10', 'fd7a:115c:a1e0::/48']

/** Adresse IP ou plage CIDR valide (IPv4 ou IPv6). */
export function isIpOrCidr(value: string): boolean {
  const [address, prefix, ...rest] = value.split('/')
  if (rest.length > 0 || !address) return false
  const family = isIP(address)
  if (family === 0) return false
  if (prefix === undefined) return true
  if (!/^\d{1,3}$/.test(prefix)) return false
  return Number(prefix) <= (family === 4 ? 32 : 128)
}

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/
const RESOLVER_RE = /^[A-Za-z0-9_-]{1,64}$/

export function opsAccess(env: Record<string, string | undefined>, platformRoot: string | null): OpsAccess {
  const customRoot = env.OPS_ROOT_DOMAIN?.trim().toLowerCase().replace(/\.$/, '')
  const rootDomain = customRoot && DOMAIN_RE.test(customRoot) ? customRoot : platformRoot
  const privateNetwork = env.OPS_PRIVATE_NETWORK?.trim().toLowerCase() === 'tailscale' ? 'tailscale' : null
  const entries = (env.OPS_ALLOWED_IPS ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  const invalid = entries.filter((item) => !isIpOrCidr(item))
  const sourceRanges = [...new Set([...(privateNetwork ? TAILSCALE_RANGES : []), ...entries.filter(isIpOrCidr)])]
  const resolver = env.OPS_CERT_RESOLVER?.trim()
  return {
    rootDomain,
    sourceRanges,
    privateNetwork,
    certResolver: resolver && RESOLVER_RE.test(resolver) ? resolver : 'letsencrypt',
    invalid,
  }
}

function routedLabels(tool: OpsTool, host: string, users: string, access: Pick<OpsAccess, 'sourceRanges' | 'certResolver'>): string[] {
  const router = `eflex-ops-${tool.id}`
  const auth = `${router}-auth`
  const allow = `${router}-ip`
  // Le filtre d'adresses passe avant le mot de passe : une adresse refusée ne voit même pas la demande.
  const middlewares = access.sourceRanges.length > 0 ? [allow, auth] : [auth]
  return [
    ...traefikLabels('eflex-ops', tool.id, host, tool.port, OPS_PROXY_NETWORK, {
      middlewares,
      certResolver: access.certResolver,
    }),
    `traefik.http.middlewares.${auth}.basicauth.users=${users}`,
    `traefik.http.middlewares.${auth}.basicauth.realm=EFLEX`,
    ...(access.sourceRanges.length > 0
      ? [`traefik.http.middlewares.${allow}.ipallowlist.sourcerange=${access.sourceRanges.join(',')}`]
      : []),
  ]
}

/** Fichier docker-compose de l'outil, prêt à être envoyé à Coolify (encodé en base64 par l'appelant). */
export function opsToolCompose(
  id: OpsToolId,
  host: string,
  password: string,
  access: Pick<OpsAccess, 'sourceRanges' | 'certResolver'> = { sourceRanges: [], certResolver: 'letsencrypt' },
): string {
  const tool = OPS_TOOLS[id]
  const users = basicAuthEntry(OPS_USER, password)
  const network = { [OPS_PROXY_NETWORK]: { external: true } }
  const common = { restart: 'unless-stopped', networks: [OPS_PROXY_NETWORK], labels: routedLabels(tool, host, users, access) }

  if (id === 'uptime') {
    return stringify({
      services: {
        'uptime-kuma': {
          image: 'louislam/uptime-kuma:2',
          ...common,
          volumes: ['uptime-kuma-data:/app/data'],
        },
      },
      volumes: { 'uptime-kuma-data': {} },
      networks: network,
    })
  }

  if (id === 'metrics') {
    return stringify({
      services: {
        beszel: {
          image: 'henrygd/beszel:0.18.7',
          ...common,
          environment: ['CONTAINER_DETAILS=true', 'SHARE_ALL_SYSTEMS=false'],
          volumes: ['beszel_data:/beszel_data', 'beszel_socket:/beszel_socket'],
        },
        // L'agent lit Docker en lecture seule et parle au hub par un socket partagé. KEY et TOKEN sont
        // copiés depuis le hub après sa première ouverture (« Ajouter un système »).
        'beszel-agent': {
          image: 'henrygd/beszel-agent:0.18.7',
          restart: 'unless-stopped',
          network_mode: 'host',
          environment: [
            'LISTEN=/beszel_socket/beszel.sock',
            `HUB_URL=https://${host}`,
            'KEY=${KEY}',
            'TOKEN=${TOKEN}',
            'SYSTEM_NAME=${SYSTEM_NAME:-eflex}',
          ],
          volumes: [
            'beszel_agent_data:/var/lib/beszel-agent',
            'beszel_socket:/beszel_socket',
            '/var/run/docker.sock:/var/run/docker.sock:ro',
          ],
        },
      },
      volumes: { beszel_data: {}, beszel_socket: {}, beszel_agent_data: {} },
      networks: network,
    })
  }

  return stringify({
    services: {
      dozzle: {
        image: 'amir20/dozzle:latest',
        ...common,
        // Lecture seule : aucune action sur les conteneurs depuis Dozzle.
        environment: ['DOZZLE_ENABLE_ACTIONS=false', 'DOZZLE_ENABLE_SHELL=false', 'DOZZLE_NO_ANALYTICS=true'],
        volumes: ['/var/run/docker.sock:/var/run/docker.sock:ro'],
      },
    },
    networks: network,
  })
}
