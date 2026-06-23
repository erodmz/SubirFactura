// Preferencia de tema del usuario. 'system' sigue al sistema operativo.
// El atributo data-theme del <html> siempre resuelve a 'light' o 'dark'
// (lo aplica el script inline del layout para evitar parpadeo).
export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'facturard_theme';

export function getThemePref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  const t = localStorage.getItem(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Resuelve la preferencia a un tema concreto y lo aplica al documento. */
export function applyThemePref(pref: ThemePref): void {
  if (typeof window === 'undefined') return;
  const resolved = pref === 'system' ? systemTheme() : pref;
  document.documentElement.dataset.theme = resolved;
}

export function setThemePref(pref: ThemePref): void {
  if (pref === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyThemePref(pref);
}
