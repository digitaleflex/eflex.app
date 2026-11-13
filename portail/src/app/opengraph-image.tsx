import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'
export const alt = 'Eflex — Le déploiement depuis Git, sans DevOps'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  let logoSrc: string | null = null
  try {
    const logo = await readFile(join(process.cwd(), 'public', 'logo-mark.png'))
    logoSrc = `data:image/png;base64,${logo.toString('base64')}`
  } catch {
    logoSrc = null
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: 'linear-gradient(135deg, #0b1530 0%, #123a8f 55%, #1f5fd6 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {logoSrc ? (
            <img src={logoSrc} width={88} height={88} alt="" style={{ borderRadius: 20 }} />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 20,
                background: '#ffffff',
                color: '#123a8f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 42,
                fontWeight: 700,
              }}
            >
              E
            </div>
          )}
          <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: -1 }}>Eflex</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 900 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>Poussez votre code, Eflex le met en ligne.</div>
          <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.88)', lineHeight: 1.35 }}>
            Déploiement depuis GitHub, HTTPS automatique, sans serveur à configurer.
          </div>
        </div>
        <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.8)' }}>eflex.app</div>
      </div>
    ),
    { ...size }
  )
}
