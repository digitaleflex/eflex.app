import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import {
  parseSettingsPatch,
  readPlatformSettings,
  writePlatformSettings,
} from '@/lib/platform-settings'

export const dynamic = 'force-dynamic'

/** Réglages de plateforme : édités sans redéploiement, jamais de valeur sensible. */
export async function POST(request: Request) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  }

  const patch = parseSettingsPatch(body)
  if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 })

  const before = await readPlatformSettings()

  let after
  try {
    after = await writePlatformSettings(patch.value)
  } catch {
    return NextResponse.json(
      { error: 'Enregistrement impossible : la base de données est injoignable.' },
      { status: 503 },
    )
  }

  try {
    await audit({
      actor: { id: guard.session.user.id, email: guard.session.user.email },
      action: 'platform.settings.update',
      target: { type: 'platform', id: 'settings' },
      details: {
        changed: Object.keys(patch.value),
        before: before.settings,
        after: after.settings,
      },
      request,
    })
  } catch (error) {
    console.error('[eflex/infrastructure] audit des réglages impossible :', error)
  }

  return NextResponse.json({
    settings: after.settings,
    maintenanceForced: after.maintenanceForced,
    source: after.source,
  })
}
