// Modos de visualização (editar/dividido/visualizar) e divisor arrastável, persistidos em localStorage.

export type ViewMode = 'edit' | 'split' | 'preview'

const MODE_KEY = 'mdr.viewMode'
const RATIO_KEY = 'mdr.splitRatio'

export function parseViewMode(v: unknown): ViewMode {
  return v === 'edit' || v === 'preview' || v === 'split' ? v : 'split'
}

/** Limita a fração do painel editor para nenhum painel sumir. */
export function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0.5
  return Math.min(0.85, Math.max(0.15, r))
}

export interface ViewController {
  readonly mode: ViewMode
  setMode(mode: ViewMode): void
}

export function initView(
  container: HTMLElement,
  divider: HTMLElement,
  onModeChange: (mode: ViewMode) => void
): ViewController {
  let mode = parseViewMode(localStorage.getItem(MODE_KEY))
  let ratio = clampRatio(parseFloat(localStorage.getItem(RATIO_KEY) ?? '0.5'))

  const applyRatio = (): void => container.style.setProperty('--split', String(ratio))

  const setMode = (m: ViewMode): void => {
    mode = m
    localStorage.setItem(MODE_KEY, m)
    container.classList.remove('mode-edit', 'mode-split', 'mode-preview')
    container.classList.add(`mode-${m}`)
    onModeChange(m)
  }

  divider.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    divider.setPointerCapture(e.pointerId)
    container.classList.add('dragging')
    const rect = container.getBoundingClientRect()
    const move = (ev: PointerEvent): void => {
      ratio = clampRatio((ev.clientX - rect.left) / rect.width)
      applyRatio()
    }
    const up = (): void => {
      divider.removeEventListener('pointermove', move)
      divider.removeEventListener('pointerup', up)
      divider.removeEventListener('pointercancel', up)
      container.classList.remove('dragging')
      localStorage.setItem(RATIO_KEY, String(ratio))
    }
    divider.addEventListener('pointermove', move)
    divider.addEventListener('pointerup', up)
    divider.addEventListener('pointercancel', up)
  })

  // Duplo clique volta para 50/50.
  divider.addEventListener('dblclick', () => {
    ratio = 0.5
    applyRatio()
    localStorage.setItem(RATIO_KEY, String(ratio))
  })

  applyRatio()
  setMode(mode)

  return {
    get mode() {
      return mode
    },
    setMode
  }
}
