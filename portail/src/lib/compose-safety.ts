/**
 * Inspection d'un `docker-compose.y(a)ml` fourni par le dépôt, avant tout
 * appel à Coolify.
 *
 * Coolify valide déjà l'injection shell (`validateDockerComposeForInjection`),
 * mais il accepte `privileged`, `network_mode: host` et les montages de l'hôte.
 * Ces clauses donneraient au conteneur un accès à l'infrastructure : le
 * portail les refuse explicitement, avec un message actionnable.
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

/**
 * Valide les clauses sensibles et décrit le compose. La fonction est pure :
 * elle ne lit ni ne modifie le dépôt.
 */
export function inspectCompose(content: string): ComposeInspectionResult {
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
    }

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
