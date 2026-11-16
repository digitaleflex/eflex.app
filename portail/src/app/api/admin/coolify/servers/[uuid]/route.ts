import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { getServerControl, runServerAction, updateDockerCleanup } from '@/lib/coolify-admin'
import { COOLIFY_ID, coolifyError, noStore } from '../../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ uuid: string }> }

/** Proxy, nettoyage Docker (réglages et dernières exécutions) et analyse d'images d'un serveur. */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { uuid } = await params
  if (!COOLIFY_ID.test(uuid)) return NextResponse.json({ error: 'Serveur introuvable.' }, { status: 404 })
  return NextResponse.json(await getServerControl(uuid), noStore)
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('proxy-restart') }),
  z.object({ action: z.literal('validate') }),
  z.object({
    action: z.literal('cleanup-run'),
    deleteUnusedVolumes: z.boolean().default(false),
    deleteUnusedNetworks: z.boolean().default(false),
  }),
  z.object({ action: z.literal('image-scan'), enabled: z.boolean() }),
])

const MESSAGES: Record<string, string> = {
  'proxy-restart': 'Redémarrage du proxy demandé. Les sites peuvent être brièvement indisponibles.',
  validate: 'Validation du serveur lancée.',
  'cleanup-run': 'Nettoyage Docker lancé.',
  'image-scan': 'Réglage de l’analyse des images enregistré.',
}

/** Actions sur un serveur : redémarrer le proxy, valider, nettoyer Docker, activer l'analyse d'images. */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { uuid } = await params
  if (!COOLIFY_ID.test(uuid)) return NextResponse.json({ error: 'Serveur introuvable.' }, { status: 404 })

  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Action invalide.' }, { status: 400 })

  const result = await runServerAction(uuid, parsed.data)
  if ('error' in result) return coolifyError(result.error)
  await audit({
    actor: { id: guard.session.user.id, email: guard.session.user.email },
    action: `platform.coolify.server.${parsed.data.action}`,
    target: { type: 'coolify_server', id: uuid },
    details: parsed.data,
    request,
  })
  return NextResponse.json({ ok: true, message: MESSAGES[parsed.data.action] })
}

const cleanupSchema = z
  .object({
    // Cron (5 champs) ou mot-clé accepté par Coolify.
    frequency: z
      .string()
      .trim()
      .regex(/^(daily|hourly|weekly|monthly|yearly|\S+(\s+\S+){4})$/, 'Fréquence invalide (cron à 5 champs).')
      .optional(),
    threshold: z.number().int().min(10).max(99).optional(),
    deleteUnusedVolumes: z.boolean().optional(),
    deleteUnusedNetworks: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), 'Aucun réglage fourni.')

/** Réglages du nettoyage Docker automatique (fréquence, seuil de disque). */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { uuid } = await params
  if (!COOLIFY_ID.test(uuid)) return NextResponse.json({ error: 'Serveur introuvable.' }, { status: 404 })

  const parsed = cleanupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Réglages invalides.' }, { status: 400 })
  }
  const result = await updateDockerCleanup(uuid, parsed.data)
  if ('error' in result) return coolifyError(result.error)
  await audit({
    actor: { id: guard.session.user.id, email: guard.session.user.email },
    action: 'platform.coolify.server.cleanup-settings',
    target: { type: 'coolify_server', id: uuid },
    details: parsed.data,
    request,
  })
  return NextResponse.json({ ok: true, message: 'Réglages du nettoyage enregistrés.' })
}
