import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { validateS3Storage } from '@/lib/coolify-admin'
import { COOLIFY_ID, coolifyError } from '../../../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Teste la connexion de Coolify au stockage S3. */
export async function POST(request: Request, { params }: { params: Promise<{ storageId: string }> }) {
  const guard = await requireAdminApi('admin.coolify.manage')
  if ('response' in guard) return guard.response
  const { storageId } = await params
  if (!COOLIFY_ID.test(storageId)) return NextResponse.json({ error: 'Stockage introuvable.' }, { status: 404 })
  const result = await validateS3Storage(storageId)
  if ('error' in result) return coolifyError(result.error)
  await audit({
    actor: { id: guard.session.user.id, email: guard.session.user.email },
    action: 'platform.coolify.s3.validate',
    target: { type: 'coolify_s3_storage', id: storageId },
    details: { valid: result.valid },
    request,
  })
  return NextResponse.json(result)
}
