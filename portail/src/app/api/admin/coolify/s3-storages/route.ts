import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { createS3Storage, listS3Storages } from '@/lib/coolify-admin'
import { coolifyError, noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Stockages S3 déclarés dans Coolify, sans leurs clés. */
export async function GET() {
  const guard = await requireAdminApi('admin.coolify.read')
  if ('response' in guard) return guard.response
  const storages = await listS3Storages()
  if ('error' in storages) return coolifyError(storages.error)
  return NextResponse.json(
    { storages, backupStorageId: process.env.COOLIFY_BACKUP_S3_STORAGE_UUID?.trim() || null },
    noStore,
  )
}

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  endpoint: z
    .string()
    .trim()
    .url('Adresse invalide.')
    .refine((value) => value.startsWith('https://'), 'L’adresse doit commencer par https://.'),
  bucket: z.string().trim().min(3).max(63),
  region: z.string().trim().min(1).max(64),
  key: z.string().trim().min(1).max(256),
  secret: z.string().trim().min(1).max(512),
})

/** Déclare un stockage S3 (Backblaze, R2, AURA…). Les clés partent vers Coolify et ne sont ni stockées ni journalisées. */
export async function POST(request: Request) {
  const guard = await requireAdminApi('admin.coolify.manage')
  if ('response' in guard) return guard.response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Champs invalides.' }, { status: 400 })
  }
  const created = await createS3Storage(parsed.data)
  if ('error' in created) return coolifyError(created.error)
  await audit({
    actor: { id: guard.session.user.id, email: guard.session.user.email },
    action: 'platform.coolify.s3.create',
    target: { type: 'coolify_s3_storage', id: created.id },
    details: { name: parsed.data.name, endpoint: parsed.data.endpoint, bucket: parsed.data.bucket },
    request,
  })
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
