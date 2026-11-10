/**
 * Réglages de plateforme modifiables sans redéploiement (issue 31).
 *
 * Stockage : `PlatformSetting` (clé/valeur déjà utilisé par la GitHub App),
 * aucune migration. Les variables d'environnement historiques
 * (`MAINTENANCE_MODE`, `MAINTENANCE_MESSAGE`) restent prioritaires : un
 * conteneur forcé en maintenance ne peut pas être réactivé depuis l'interface.
 *
 * Ce module est serveur uniquement. Aucune valeur sensible n'y transite : les
 * seules clés sont des booléens et des messages d'interface.
 */
import { prisma } from '@/lib/prisma'

export const PLATFORM_SETTING_KEYS = {
  maintenanceEnabled: 'platform.maintenance.enabled',
  maintenanceMessage: 'platform.maintenance.message',
  signupsEnabled: 'platform.signups.enabled',
  announcement: 'platform.announcement.message',
  announcementLevel: 'platform.announcement.level',
} as const

export type AnnouncementLevel = 'info' | 'warning'

export interface PlatformSettings {
  /** Maintenance : bandeau global + refus des nouveaux déploiements. */
  maintenanceEnabled: boolean
  maintenanceMessage: string
  /** Inscriptions : fermées = création de compte désactivée. */
  signupsEnabled: boolean
  /** Annonce affichée dans la console (vide = aucune). */
  announcement: string
  announcementLevel: AnnouncementLevel
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  maintenanceEnabled: false,
  maintenanceMessage: '',
  signupsEnabled: true,
  announcement: '',
  announcementLevel: 'info',
}

export const MAX_MAINTENANCE_MESSAGE = 300
export const MAX_ANNOUNCEMENT = 280

/** Message renvoyé par l'API quand un déploiement est demandé pendant la maintenance. */
export const MAINTENANCE_DEPLOYMENT_MESSAGE =
  'La plateforme est en maintenance : les nouveaux déploiements sont suspendus. Le message affiché aux utilisateurs explique la situation ; réessayez une fois la maintenance terminée.'

export const MAINTENANCE_DEPLOYMENT_CODE = 'maintenance'

export interface PlatformSettingsSnapshot {
  settings: PlatformSettings
  source: 'database' | 'environment'
  /** Vrai quand `MAINTENANCE_MODE=true` impose la maintenance (non désactivable). */
  maintenanceForced: boolean
  /** Raison de l'échec de lecture en base, déjà expurgée. */
  error: string | null
}

function envFallback(): PlatformSettings {
  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    maintenanceEnabled: process.env.MAINTENANCE_MODE === 'true',
    maintenanceMessage: (process.env.MAINTENANCE_MESSAGE ?? '').trim(),
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function parseLevel(value: string | undefined): AnnouncementLevel {
  return value === 'warning' ? 'warning' : 'info'
}

/** Convertit les lignes `PlatformSetting` en réglages typés (pure). */
export function parsePlatformSettings(
  rows: readonly { key: string; value: string }[],
  fallback: PlatformSettings = DEFAULT_PLATFORM_SETTINGS,
): PlatformSettings {
  if (rows.length === 0) return fallback
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const read = (key: string): string | undefined => stored.get(key)

  return {
    maintenanceEnabled: parseBoolean(read(PLATFORM_SETTING_KEYS.maintenanceEnabled), fallback.maintenanceEnabled),
    maintenanceMessage: (read(PLATFORM_SETTING_KEYS.maintenanceMessage) ?? fallback.maintenanceMessage).slice(
      0,
      MAX_MAINTENANCE_MESSAGE,
    ),
    signupsEnabled: parseBoolean(read(PLATFORM_SETTING_KEYS.signupsEnabled), fallback.signupsEnabled),
    announcement: (read(PLATFORM_SETTING_KEYS.announcement) ?? fallback.announcement).slice(0, MAX_ANNOUNCEMENT),
    announcementLevel: parseLevel(read(PLATFORM_SETTING_KEYS.announcementLevel) ?? fallback.announcementLevel),
  }
}

export type SettingsPatchResult =
  | { ok: true; value: Partial<PlatformSettings> }
  | { ok: false; error: string }

const ALLOWED_KEYS = new Set<keyof PlatformSettings>([
  'maintenanceEnabled',
  'maintenanceMessage',
  'signupsEnabled',
  'announcement',
  'announcementLevel',
])

/**
 * Valide une modification venue du client. Toute clé inconnue est refusée
 * (pas d'écriture arbitraire dans `PlatformSetting` via cette route).
 */
export function parseSettingsPatch(input: unknown): SettingsPatchResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Corps de requête invalide.' }
  }
  const record = input as Record<string, unknown>
  const value: Partial<PlatformSettings> = {}

  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key as keyof PlatformSettings)) {
      return { ok: false, error: `Réglage inconnu : ${key}.` }
    }
  }

  if ('maintenanceEnabled' in record) {
    if (typeof record.maintenanceEnabled !== 'boolean') {
      return { ok: false, error: 'Le mode maintenance doit être un booléen.' }
    }
    value.maintenanceEnabled = record.maintenanceEnabled
  }

  if ('signupsEnabled' in record) {
    if (typeof record.signupsEnabled !== 'boolean') {
      return { ok: false, error: 'Les inscriptions doivent être un booléen.' }
    }
    value.signupsEnabled = record.signupsEnabled
  }

  if ('maintenanceMessage' in record) {
    if (typeof record.maintenanceMessage !== 'string') {
      return { ok: false, error: 'Le message de maintenance doit être un texte.' }
    }
    const message = record.maintenanceMessage.trim()
    if (message.length > MAX_MAINTENANCE_MESSAGE) {
      return { ok: false, error: `Le message de maintenance dépasse ${MAX_MAINTENANCE_MESSAGE} caractères.` }
    }
    value.maintenanceMessage = message
  }

  if ('announcement' in record) {
    if (typeof record.announcement !== 'string') {
      return { ok: false, error: "L'annonce doit être un texte." }
    }
    const announcement = record.announcement.trim()
    if (announcement.length > MAX_ANNOUNCEMENT) {
      return { ok: false, error: `L'annonce dépasse ${MAX_ANNOUNCEMENT} caractères.` }
    }
    value.announcement = announcement
  }

  if ('announcementLevel' in record) {
    if (record.announcementLevel !== 'info' && record.announcementLevel !== 'warning') {
      return { ok: false, error: "Le niveau d'annonce doit être « info » ou « warning »." }
    }
    value.announcementLevel = record.announcementLevel
  }

  if (Object.keys(value).length === 0) return { ok: false, error: 'Aucun réglage à enregistrer.' }
  return { ok: true, value }
}

/**
 * Lit les réglages. Une base indisponible ne doit jamais casser une page :
 * on retombe sur l'environnement (comportement historique) en signalant l'erreur.
 */
export async function readPlatformSettings(): Promise<PlatformSettingsSnapshot> {
  const maintenanceForced = process.env.MAINTENANCE_MODE === 'true'
  const fallback = envFallback()

  let rows: { key: string; value: string }[]
  try {
    rows = await prisma.platformSetting.findMany({
      where: { key: { in: Object.values(PLATFORM_SETTING_KEYS) } },
      select: { key: true, value: true },
    })
  } catch (error) {
    return {
      settings: fallback,
      source: 'environment',
      maintenanceForced,
      error: error instanceof Error ? error.message.slice(0, 200) : 'Lecture des réglages impossible.',
    }
  }

  const settings = parsePlatformSettings(rows, fallback)
  return {
    settings: {
      ...settings,
      // Variable d'environnement prioritaire : jamais de sortie de maintenance involontaire.
      maintenanceEnabled: settings.maintenanceEnabled || maintenanceForced,
      maintenanceMessage: settings.maintenanceMessage || fallback.maintenanceMessage,
    },
    source: rows.length > 0 ? 'database' : 'environment',
    maintenanceForced,
    error: null,
  }
}

function serialize(patch: Partial<PlatformSettings>): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = []
  if (patch.maintenanceEnabled !== undefined) {
    rows.push({ key: PLATFORM_SETTING_KEYS.maintenanceEnabled, value: patch.maintenanceEnabled ? 'true' : 'false' })
  }
  if (patch.maintenanceMessage !== undefined) {
    rows.push({ key: PLATFORM_SETTING_KEYS.maintenanceMessage, value: patch.maintenanceMessage })
  }
  if (patch.signupsEnabled !== undefined) {
    rows.push({ key: PLATFORM_SETTING_KEYS.signupsEnabled, value: patch.signupsEnabled ? 'true' : 'false' })
  }
  if (patch.announcement !== undefined) {
    rows.push({ key: PLATFORM_SETTING_KEYS.announcement, value: patch.announcement })
  }
  if (patch.announcementLevel !== undefined) {
    rows.push({ key: PLATFORM_SETTING_KEYS.announcementLevel, value: patch.announcementLevel })
  }
  return rows
}

/** Écrit les réglages fournis (upsert) et renvoie l'état relu. */
export async function writePlatformSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettingsSnapshot> {
  const rows = serialize(patch)
  if (rows.length > 0) {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.platformSetting.upsert({
          where: { key: row.key },
          create: row,
          update: { value: row.value },
        }),
      ),
    )
  }
  return readPlatformSettings()
}

/** Vrai si les nouveaux déploiements doivent être refusés (base ou environnement). */
export async function isMaintenanceActive(): Promise<boolean> {
  if (process.env.MAINTENANCE_MODE === 'true') return true
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: PLATFORM_SETTING_KEYS.maintenanceEnabled },
      select: { value: true },
    })
    return row?.value === 'true'
  } catch {
    return false
  }
}

/** Vrai si la création de compte est ouverte (défaut : ouverte). */
export async function isSignupOpen(): Promise<boolean> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: PLATFORM_SETTING_KEYS.signupsEnabled },
      select: { value: true },
    })
    return row?.value !== 'false'
  } catch {
    return true
  }
}
