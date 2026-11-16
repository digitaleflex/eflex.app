import { NextResponse } from 'next/server'

/** Identifiant Coolify accepté dans une URL d'administration (évite toute injection de chemin). */
export const COOLIFY_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Réponse uniforme quand Coolify refuse ou ne répond pas : le message reste lisible, sans secret. */
export function coolifyError(error: string, status = 502): NextResponse {
  const notFound = error.includes('API 404')
  return NextResponse.json(
    { error: notFound ? 'Ressource introuvable dans Coolify (ou version de Coolify trop ancienne).' : error },
    { status: notFound ? 404 : status },
  )
}

export const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } }
