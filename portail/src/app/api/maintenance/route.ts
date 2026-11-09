import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** État lu à l'exécution : la bannière reste correcte sur les pages statiques. */
export async function GET() {
  return NextResponse.json(
    {
      enabled: process.env.MAINTENANCE_MODE === 'true',
      message: process.env.MAINTENANCE_MESSAGE || null,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}
