// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { effectiveTheme, parseThemeSource } from '../../src/renderer/src/theme'
import { clampRatio, parseViewMode } from '../../src/renderer/src/view'

describe('parseThemeSource', () => {
  it.each(['light', 'dark', 'system'] as const)('mantém %s', (v) => expect(parseThemeSource(v)).toBe(v))
  it.each([null, undefined, '', 'Dark', 1, {}])('%j -> system', (v) => expect(parseThemeSource(v)).toBe('system'))
})

describe('effectiveTheme', () => {
  it('system segue o SO', () => {
    expect(effectiveTheme('system', true)).toBe('dark')
    expect(effectiveTheme('system', false)).toBe('light')
  })
  it('explícito ignora o SO', () => {
    expect(effectiveTheme('light', true)).toBe('light')
    expect(effectiveTheme('dark', false)).toBe('dark')
  })
})

describe('parseViewMode', () => {
  it.each(['edit', 'split', 'preview'] as const)('mantém %s', (v) => expect(parseViewMode(v)).toBe(v))
  it.each([null, undefined, '', 'x', 0])('%j -> split', (v) => expect(parseViewMode(v)).toBe('split'))
})

describe('clampRatio', () => {
  it('dentro do intervalo', () => expect(clampRatio(0.4)).toBe(0.4))
  it('limites', () => {
    expect(clampRatio(0)).toBe(0.15)
    expect(clampRatio(-5)).toBe(0.15)
    expect(clampRatio(1)).toBe(0.85)
    expect(clampRatio(99)).toBe(0.85)
    expect(clampRatio(0.15)).toBe(0.15)
    expect(clampRatio(0.85)).toBe(0.85)
  })
  it('inválido -> 0.5', () => {
    expect(clampRatio(NaN)).toBe(0.5)
    expect(clampRatio(Infinity)).toBe(0.5)
    expect(clampRatio(-Infinity)).toBe(0.5)
  })
})
