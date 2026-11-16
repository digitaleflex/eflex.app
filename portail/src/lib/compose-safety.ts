/**
 * Inspection d'un `docker-compose.y(a)ml` fourni par le dépôt, avant tout
 * appel à Coolify.
 *
 * Coolify valide déjà l'injection shell (`validateDockerComposeForInjection`),
 * mais il accepte `privileged`, `network_mode: host`, les montages de l'hôte,
 * les capacités noyau, les espaces de noms de l'hôte, les volumes « bind » par
 * pilote, les réseaux et volumes externes et des labels Traefik arbitraires.
 * Ces clauses donneraient au conteneur un accès à l'infrastructure, aux autres
 * clients ou au trafic d'autres domaines : le portail les refuse explicitement,
 * avec un message actionnable (audit de sécurité 2026-11).
 *
 * Aucun contenu du fichier (variables, mots de passe) n'est renvoyé dans un
 * message ou un journal.
 */
import { parse } from 'yaml'

export type ComposePortMap = Record<string, number[]>

export interface ComposeInspection {
  services: string[]
  /** Service qui portera le domaine public, si un port HTTP est reconnu. */
  primaryService: string | null
  /** Ports conteneur par service (sert au diagnostic et aux logs). */
  ports: ComposePortMap
  warnings: string[]
}

export type ComposeInspectionResult =
  | ({ ok: true } & ComposeInspection)
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true'
}

const HTTP_PORT_SCORE = new Map<number, number>([
  [80, 60],
  [8080, 55],
  [8000, 50],
  [3000, 45],
  [5000, 40],
  [443, 35],
  [4000, 30],
  [4200, 25],
  [5173, 20],
  [3001, 15],
])

const SERVICE_NAME_SCORE: Record<string, number> = {
  web: 60,
  nginx: 55,
  frontend: 50,
  front: 45,
  app: 40,
  api: 35,
  http: 30,
  server: 25,
  proxy: 20,
}

/** Extrait le port conteneur d'une entrée `ports` (courte ou longue syntaxe). */
function containerPort(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : null
  }
  if (isRecord(value)) return containerPort(value.target)

  const entry = asString(value)
  if (!entry) return null
  const cleaned = entry.trim().replace(/^["']|["']$/g, '')
  const withoutProtocol = cleaned.split('/')[0] ?? ''
  const parts = withoutProtocol.split(':')
  const last = (parts[parts.length - 1] ?? '').trim()
  const match = /^(\d{1,5})(?:-\d{1,5})?$/.exec(last)
  if (!match || !match[1]) return null
  const port = Number.parseInt(match[1], 10)
  return port >= 1 && port <= 65535 ? port : null
}

function portsOf(service: Record<string, unknown>): number[] {
  const ports = service.ports
  if (!Array.isArray(ports)) return []
  const result: number[] = []
  for (const entry of ports) {
    const port = containerPort(entry)
    if (port !== null && !result.includes(port)) result.push(port)
  }
  return result
}

function scoreService(name: string, ports: readonly number[]): number {
  const portScore = ports.reduce(
    (best, port) => Math.max(best, HTTP_PORT_SCORE.get(port) ?? 0),
    0,
  )
  return portScore + (SERVICE_NAME_SCORE[name.toLowerCase()] ?? 0)
}

function primaryOf(ports: ComposePortMap): string | null {
  let primary: string | null = null
  let best = 0
  for (const [name, servicePorts] of Object.entries(ports)) {
    const score = scoreService(name, servicePorts)
    if (score > best) {
      best = score
      primary = name
    }
  }
  return primary
}

/** Source d'un montage court (`source:target[:mode]`), ou `null` si anonyme. */
function shortVolumeSource(entry: string): string | null {
  const cleaned = entry.trim().replace(/^["']|["']$/g, '')
  const parts = cleaned.split(':')
  if (parts.length < 2) return null
  return parts[0]?.trim() ?? null
}

/** Vrai si la source est un chemin de l'hôte (absolu, `~` ou remontée `..`). */
function isHostPath(source: string): boolean {
  const normalized = source.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.startsWith('~')) return true
  return normalized.split('/').includes('..')
}

function hostMountError(source: string): string {
  if (source.endsWith('docker.sock') || source.includes('/docker.sock')) {
    return 'le montage de la socket Docker (`/var/run/docker.sock`) donne un contrôle total sur l’hôte et est interdit.'
  }
  return `le montage de l’hôte \`${source}\` est interdit : utilisez un volume nommé ou un chemin relatif au dépôt.`
}

/** Réseau du proxy de l'hôte : le seul réseau externe qu'un compose client peut rejoindre. */
export const COMPOSE_PROXY_NETWORK = 'proxy'

/** Espaces de noms : `host` ou rattachement à un autre conteneur donnent accès à l'hôte ou à un voisin. */
const NAMESPACE_KEYS = ['pid', 'ipc', 'uts', 'userns_mode', 'cgroup'] as const
/** Clés qui relâchent l'isolement du conteneur : refusées quelle que soit leur valeur. */
const FORBIDDEN_SERVICE_KEYS = ['cap_add', 'devices', 'device_cgroup_rules', 'security_opt', 'volumes_from', 'cgroup_parent', 'runtime', 'isolation'] as const

function joinsOtherNamespace(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === 'host' || normalized.startsWith('container:') || normalized.startsWith('service:')
}

/** Labels d'un service, en liste `clé=valeur` ou en objet. */
function labelsOf(service: Record<string, unknown>): Array<[string, string]> {
  const labels = service.labels
  if (Array.isArray(labels)) {
    return labels
      .map((entry) => (typeof entry === 'string' ? entry : ''))
      .filter((entry) => entry.includes('='))
      .map((entry) => {
        const index = entry.indexOf('=')
        return [entry.slice(0, index).trim(), entry.slice(index + 1).trim()] as [string, string]
      })
  }
  if (isRecord(labels)) return Object.entries(labels).map(([key, value]) => [key.trim(), String(value ?? '')])
  return []
}

/** Hôtes cités par une règle de routeur Traefik (`Host(\`a\`, \`b\`)`). */
function ruleHosts(rule: string): string[] {
  const hosts: string[] = []
  for (const match of rule.matchAll(/Host\s*\(([^)]*)\)/g)) {
    for (const host of (match[1] ?? '').matchAll(/[`"']([^`"']+)[`"']/g)) hosts.push((host[1] ?? '').trim().toLowerCase())
  }
  return hosts
}

/**
 * Labels refusés : routeurs TCP/UDP, plugins, labels réservés à Coolify, et routeurs HTTP dont la règle
 * ne se limite pas aux domaines du projet (sans `Host`, la règle capterait le trafic de tous les sites).
 */
function labelErrors(name: string, labels: Array<[string, string]>, allowedHosts: readonly string[] | undefined): string[] {
  const errors: string[] = []
  const allowed = new Set((allowedHosts ?? []).map((host) => host.toLowerCase()))
  for (const [key, value] of labels) {
    const lower = key.toLowerCase()
    if (lower.startsWith('coolify.')) {
      errors.push(`le service \`${name}\` déclare le label réservé \`${key}\`.`)
    } else if (/^traefik\.(tcp|udp)\./.test(lower)) {
      errors.push(`le service \`${name}\` déclare un routeur Traefik TCP/UDP (\`${key}\`).`)
    } else if (/^traefik\..*\.plugin\./.test(lower)) {
      errors.push(`le service \`${name}\` utilise un plugin Traefik (\`${key}\`).`)
    } else if (/^traefik\.http\.routers\.[^.]+\.rule$/.test(lower) && allowedHosts !== undefined) {
      const hosts = ruleHosts(value)
      const foreign = hosts.filter((host) => !allowed.has(host))
      if (hosts.length === 0 || /HostRegexp|HostSNI/i.test(value)) {
        errors.push(`le service \`${name}\` : la règle Traefik \`${key}\` doit se limiter aux domaines du projet avec \`Host(...)\`.`)
      } else if (foreign.length > 0) {
        errors.push(`le service \`${name}\` : la règle Traefik \`${key}\` vise un domaine qui n’appartient pas au projet (${foreign.join(', ')}).`)
      }
    }
  }
  return errors
}

/** Volumes et réseaux de premier niveau : rien d'externe (sauf le réseau du proxy), ni pilote, ni nom forcé. */
function topLevelErrors(parsed: Record<string, unknown>): string[] {
  const errors: string[] = []
  // Un fichier inclus échapperait à ce contrôle.
  if (parsed.include !== undefined) errors.push('`include` charge un autre fichier compose, qui ne serait pas vérifié.')
  if (isRecord(parsed.volumes)) {
    for (const [name, volume] of Object.entries(parsed.volumes)) {
      if (!isRecord(volume)) continue
      if (asBoolean(volume.external) || isRecord(volume.external)) {
        errors.push(`le volume \`${name}\` est externe : il pourrait appartenir à un autre projet.`)
      }
      if (volume.driver !== undefined || volume.driver_opts !== undefined) {
        errors.push(`le volume \`${name}\` définit un pilote ou des options (\`driver\`, \`driver_opts\`), qui peuvent monter un dossier de l’hôte.`)
      }
      if (volume.name !== undefined) {
        errors.push(`le volume \`${name}\` force un nom (\`name\`) : il pourrait désigner le volume d’un autre projet.`)
      }
    }
  }
  if (isRecord(parsed.networks)) {
    for (const [name, network] of Object.entries(parsed.networks)) {
      if (!isRecord(network)) continue
      const external = asBoolean(network.external) || isRecord(network.external)
      const target = asString(network.name) ?? name
      if ((external || network.name !== undefined) && target !== COMPOSE_PROXY_NETWORK) {
        errors.push(`le réseau \`${name}\` rejoint un réseau existant (\`${target}\`) : seul le réseau \`${COMPOSE_PROXY_NETWORK}\` du proxy est autorisé.`)
      }
      if (network.driver !== undefined || network.driver_opts !== undefined) {
        errors.push(`le réseau \`${name}\` définit un pilote ou des options.`)
      }
    }
  }
  return errors
}

/**
 * Valide les clauses sensibles et décrit le compose. La fonction est pure :
 * elle ne lit ni ne modifie le dépôt. `allowedHosts` : domaines du projet ;
 * fourni, il borne les règles Traefik déclarées dans les labels.
 */
export function inspectCompose(content: string, allowedHosts?: readonly string[]): ComposeInspectionResult {
  let parsed: unknown
  try {
    parsed = parse(content, { maxAliasCount: 100 })
  } catch {
    // Le message de `yaml` peut contenir un extrait de ligne (donc un secret) :
    // on ne le propage jamais tel quel.
    return { ok: false, error: 'Le fichier compose n’est pas un YAML valide.' }
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Le fichier compose doit être un objet YAML.' }
  }
  if (!isRecord(parsed.services) || Object.keys(parsed.services).length === 0) {
    return {
      ok: false,
      error: 'Le fichier compose ne contient aucun service (`services`).',
    }
  }

  const services = Object.keys(parsed.services)
  const ports: ComposePortMap = {}
  const errors: string[] = []
  let hasBuild = false

  for (const [name, rawService] of Object.entries(parsed.services)) {
    if (!isRecord(rawService)) {
      errors.push(`le service \`${name}\` n’est pas un objet.`)
      continue
    }

    ports[name] = portsOf(rawService)

    if (asBoolean(rawService.privileged)) {
      errors.push(`le service \`${name}\` demande \`privileged: true\`.`)
    }

    const networkMode = asString(rawService.network_mode)?.trim().toLowerCase()
    if (networkMode === 'host') {
      errors.push(`le service \`${name}\` utilise \`network_mode: host\`.`)
    } else if (networkMode && joinsOtherNamespace(networkMode)) {
      errors.push(`le service \`${name}\` rejoint le réseau d’un autre conteneur (\`network_mode: ${networkMode}\`).`)
    }

    for (const key of NAMESPACE_KEYS) {
      const value = asString(rawService[key])
      if (value && joinsOtherNamespace(value)) {
        errors.push(`le service \`${name}\` partage l’espace \`${key}\` de l’hôte ou d’un autre conteneur.`)
      }
    }
    if (isRecord(rawService.extends) && rawService.extends.file !== undefined) {
      errors.push(`le service \`${name}\` hérite d’un autre fichier (\`extends.file\`), qui ne serait pas vérifié.`)
    }
    for (const key of FORBIDDEN_SERVICE_KEYS) {
      if (rawService[key] !== undefined) {
        errors.push(`le service \`${name}\` utilise \`${key}\`, qui relâche l’isolement du conteneur.`)
      }
    }
    errors.push(...labelErrors(name, labelsOf(rawService), allowedHosts))

    if (rawService.build !== undefined) hasBuild = true

    const volumes = rawService.volumes
    if (Array.isArray(volumes)) {
      for (const volume of volumes) {
        if (typeof volume === 'string') {
          const source = shortVolumeSource(volume)
          if (source && (isHostPath(source) || source.includes('docker.sock'))) {
            errors.push(`le service \`${name}\` : ${hostMountError(source)}`)
          }
          continue
        }
        if (isRecord(volume)) {
          const type = asString(volume.type) ?? 'volume'
          if (type === 'npipe' || type === 'cluster') {
            errors.push(`le service \`${name}\` utilise un montage de type \`${type}\`.`)
          }
          const source = asString(volume.source)
          if (source && (type === 'bind' || isHostPath(source) || source.includes('docker.sock'))) {
            if (isHostPath(source) || source.includes('docker.sock')) {
              errors.push(`le service \`${name}\` : ${hostMountError(source)}`)
            }
          }
        }
      }
    }
  }

  errors.push(...topLevelErrors(parsed))

  if (errors.length > 0) {
    return {
      ok: false,
      error: `Compose refusé pour raison de sécurité : ${errors.join(' ')}`,
    }
  }

  const warnings: string[] = []
  const primary = primaryOf(ports)
  if (!primary) {
    warnings.push(
      'Aucun service HTTP reconnu : le domaine du projet ne sera pas attaché automatiquement au compose.',
    )
  }
  if (!/entrypoints\s*[:=][^\n]*websecure/i.test(content)) {
    warnings.push(
      'Le compose ne déclare pas de label Traefik `websecure` : Coolify génère ses propres labels avec l’entrypoint `https`, absent du Traefik de l’hôte. Ajoutez les labels du routeur au service public.',
    )
  }
  if (!hasBuild) {
    warnings.push(
      'Aucun service ne construit d’image (`build:`) : seules des images préconstruites seront déployées.',
    )
  }

  return { ok: true, services, primaryService: primary, ports, warnings }
}
