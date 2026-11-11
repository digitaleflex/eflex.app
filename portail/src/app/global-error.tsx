'use client'

import { useEffect } from 'react'

/**
 * Dernier filet de sécurité : rendu quand la racine de l'application elle-même échoue.
 * Il doit rester lisible sans `globals.css`, sans thème résolu et sans données serveur :
 * tous les styles sont donc embarqués et les couleurs ont un contraste AA vérifié.
 */
const CRITICAL_STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.25rem;
    background: #f7f9fc;
    color: #0b1220;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    line-height: 1.5;
  }
  .screen { width: 100%; max-width: 34rem; text-align: center; }
  .brand { margin: 0 0 2rem; font-size: 1.125rem; font-weight: 800; letter-spacing: -0.02em; }
  .badge {
    display: flex; align-items: center; justify-content: center;
    width: 3.5rem; height: 3.5rem; margin: 0 auto 1rem;
    border-radius: 1rem; background: #fdecec; color: #b42318;
  }
  h1 { margin: 0 0 0.75rem; font-size: clamp(1.75rem, 5vw, 2.25rem); line-height: 1.15; letter-spacing: -0.03em; }
  p { margin: 0 0 0.5rem; color: #4b5563; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; margin-top: 1.75rem; }
  .button {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 2.75rem; padding: 0 1.25rem;
    border: 1px solid transparent; border-radius: 0.625rem;
    font: inherit; font-size: 0.875rem; font-weight: 600;
    text-decoration: none; cursor: pointer;
  }
  .primary { background: #1d4ed8; color: #ffffff; }
  .primary:hover { background: #1e40af; }
  .secondary { background: #ffffff; color: #0b1220; border-color: #9aa4b2; }
  .secondary:hover { background: #f1f3f7; }
  .button:focus-visible, a:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px; }
  .reference {
    margin-top: 1.5rem; overflow-wrap: anywhere;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem; color: #4b5563;
  }
  .footer { margin-top: 1.5rem; font-size: 0.875rem; color: #4b5563; }
  .footer a { color: #1d4ed8; text-decoration: underline; text-underline-offset: 2px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b111a; color: #eef2f7; }
    p, .reference, .footer { color: #aab4c4; }
    .badge { background: #3b1414; color: #ffb4ab; }
    .primary { background: #5b8cff; color: #0b111a; }
    .primary:hover { background: #7ba4ff; }
    .secondary { background: #111a26; color: #eef2f7; border-color: #5b6575; }
    .secondary:hover { background: #1a2431; }
    .footer a { color: #8db4ff; }
    .button:focus-visible, a:focus-visible { outline-color: #8db4ff; }
  }
`

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[eflex] Erreur critique', error)
  }, [error])

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>Erreur critique — Eflex</title>
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_STYLES }} />
      </head>
      <body>
        <main id="contenu" tabIndex={-1} className="screen">
          <p className="brand">Eflex</p>

          <span aria-hidden="true" className="badge">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>

          <h1>Eflex n’a pas pu charger cette page</h1>
          <p>Une erreur inattendue a empêché l’affichage de l’application.</p>
          <p>Réessayez dans quelques instants. Si le problème persiste, consultez le statut des services.</p>

          <div className="actions">
            <button type="button" onClick={reset} className="button primary">
              Réessayer
            </button>
            <a href="/status" className="button secondary">
              Statut des services
            </a>
          </div>

          {error.digest && (
            <p className="reference">
              Référence technique : {error.digest}
              <br />
              Communiquez cette référence au support pour retrouver l’incident.
            </p>
          )}

          <p className="footer">
            {/* Ancre native volontaire : cette page de secours ne doit dépendre d'aucun routeur client. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Retour à l’accueil</a>
          </p>
        </main>
      </body>
    </html>
  )
}
