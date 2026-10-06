import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ Menu: { buildFromTemplate: vi.fn() } }))

import { themeMenuItemId } from '../../src/main/menu'

describe('themeMenuItemId', () => {
  it('um id por tema', () => {
    expect(themeMenuItemId('system')).toBe('theme-system')
    expect(themeMenuItemId('light')).toBe('theme-light')
    expect(themeMenuItemId('dark')).toBe('theme-dark')
  })
  it('ids distintos', () => {
    expect(new Set((['system', 'light', 'dark'] as const).map(themeMenuItemId)).size).toBe(3)
  })
})
