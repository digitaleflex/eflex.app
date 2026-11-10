import { NextResponse } from 'next/server'
import { readPlatformSettings } from '@/lib/platform-settings'

export const dynamic = 'force-dynamic'

/**
 * État lu à l'exécution : la bannière reste correcte sur les pages statiques.
 * Les réglages viennent de la base (`/admin/infrastructure`) avec repli sur les
 * variables `MAINTENANCE_MODE` / `MAINTENANCE_MESSAGE`.
 */
export async function GET() {
  const { settings } = await readPlatformSettings()
  return NextResponse.json(
    {
      enabled: settings.maintenanceEnabled,
      message: settings.maintenanceMessage || null,
      announcement: settings.announcement || null,
      announcementLevel: settings.announcementLevel,
      signupsEnabled: settings.signupsEnabled,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
