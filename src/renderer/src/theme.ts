// Tema claro/escuro: preferência 'system'|'light'|'dark' persistida; aplica data-theme no <html>.

import type { ThemeSource } from '@shared/api'

export type EffectiveTheme = 'light' | 'dark'

const KEY = 'mdr.theme'

/** Valida um valor lido do armazenamento; qualquer coisa inválida vira 'system'. */
export function parseThemeSource(v: unknown): ThemeSource {
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

/** Tema efetivo a partir da preferência e do tema do sistema. */
export function effectiveTheme(pref: ThemeSource, systemDark: boolean): EffectiveTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

export interface ThemeController {
  readonly pref: ThemeSource
  readonly effective: EffectiveTheme
  set(pref: ThemeSource): void
  /** Alterna claro/escuro a partir do tema efetivo atual (grava escolha explícita). */
  toggle(): void
}

export function initTheme(onChange: (effective: EffectiveTheme) => void): ThemeController {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  let pref = parseThemeSource(localStorage.getItem(KEY))
  let effective = effectiveTheme(pref, mq.matches)

  const apply = (): void => {
    effective = effectiveTheme(pref, mq.matches)
    document.documentElement.dataset.theme = effective
    document.documentElement.style.colorScheme = effective
    onChange(effective)
  }

  const set = (p: ThemeSource): void => {
    pref = p
    localStorage.setItem(KEY, p)
    window.mdr.setTheme(p)
    apply()
  }

  // Com 'system', o main usa nativeTheme 'system' e o matchMedia acompanha o SO.
  mq.addEventListener('change', () => {
    if (pref === 'system') apply()
  })

  window.mdr.setTheme(pref)
  apply()

  return {
    get pref() {
      return pref
    },
    get effective() {
      return effective
    },
    set,
    toggle: () => set(effective === 'dark' ? 'light' : 'dark')
  }
}
