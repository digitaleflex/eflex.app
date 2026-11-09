import { NextResponse } from 'next/server'
import { collectStatus } from '@/lib/status'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Sortie JSON pour la supervision externe (Uptime Kuma, Grafana, …). */
export async function GET() {
  const snapshot = await collectStatus()
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
