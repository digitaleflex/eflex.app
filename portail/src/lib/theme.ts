export type Theme = 'system' | 'light' | 'dark'
export const THEME_COOKIE = 'eflex-theme'

/** Élément qui porte la classe `dark` : la console uniquement (le site public reste clair). */
const ROOT_ID = 'app-theme'

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'system'
  const m = /(?:^|;\s*)eflex-theme=(light|dark|system)/.exec(document.cookie)
  return (m?.[1] as Theme) ?? 'system'
}

export function applyTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.getElementById(ROOT_ID)?.classList.toggle('dark', dark)
}

/**
 * Script exécuté avant l'affichage : pose la classe `dark` sans flash (le cookie ne dit pas
 * ce que veut « système », seul le navigateur le sait).
 */
export const themeBootScript = `(function(){try{var m=/(?:^|;\\s*)eflex-theme=(light|dark|system)/.exec(document.cookie);var t=m?m[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var el=document.getElementById('${ROOT_ID}');if(el)el.classList.toggle('dark',d);}catch(e){}})()`
export const THEME_ROOT_ID = ROOT_ID
