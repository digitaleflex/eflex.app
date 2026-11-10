export type Theme = 'system' | 'light' | 'dark'
export const THEME_COOKIE = 'eflex-theme'

/** Classe posée sur `<html>` : elle pilote les tokens CSS et les variantes `dark:`. */
const DARK_CLASS = 'dark'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'system'
  const m = /(?:^|;\s*)eflex-theme=(light|dark|system)/.exec(document.cookie)
  return (m?.[1] as Theme) ?? 'system'
}

/** Applique un thème déjà choisi (cookie relu côté client). */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark()) ? 'dark' : 'light'
}

function paint(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(DARK_CLASS, resolveTheme(theme) === 'dark')
}

export function applyTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`
  paint(theme)
}

/**
 * Script exécuté avant l'affichage : pose ou retire `dark` sur `<html>` sans flash
 * (le cookie ne dit pas ce que veut « système », seul le navigateur le sait).
 */
export const themeBootScript = `(function(){try{var m=/(?:^|;\\s*)eflex-theme=(light|dark|system)/.exec(document.cookie);var t=m?m[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('${DARK_CLASS}',d);}catch(e){}})()`
