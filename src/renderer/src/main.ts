import './style.css'
import './preview.css'

import type { Text } from '@codemirror/state'
import type { Doc, MenuAction } from '@shared/api'
import { MdEditor } from './editor'
import { countWords, dirname, isMarkdownPath, renderMarkdown } from './markdown'
import { initTheme } from './theme'
import { initView, type ViewMode } from './view'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const mainEl = $<HTMLElement>('main')
const editorPane = $<HTMLElement>('editor-pane')
const previewPane = $<HTMLElement>('preview-pane')
const preview = $<HTMLElement>('preview')
const themeBtn = $<HTMLButtonElement>('theme-btn')
const stName = $<HTMLElement>('st-name')
const stDirty = $<HTMLElement>('st-dirty')
const stCount = $<HTMLElement>('st-count')
const stCursor = $<HTMLElement>('st-cursor')

// ---- Estado do documento ----

let docPath: string | null = null
let docName = 'Sem título'
let savedText: Text
let dirty = false
let saving = false
/** Save pedido durante outro save (ex.: "Salvar" ao fechar): repetido no fim com o conteúdo atual. */
let pendingSave: 'save' | 'saveAs' | null = null

function setDirtyState(d: boolean): void {
  if (d === dirty) return
  dirty = d
  window.mdr.setDirty(d)
  stDirty.textContent = d ? 'modificado' : ''
}

// ---- Editor e preview ----

const RENDER_DELAY = 150
let renderTimer: ReturnType<typeof setTimeout> | undefined

const editor = new MdEditor(editorPane, {
  onChange(u) {
    setDirtyState(!u.state.doc.eq(savedText))
    clearTimeout(renderTimer)
    renderTimer = setTimeout(renderNow, RENDER_DELAY)
  },
  onCursor(view) {
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    stCursor.textContent = `Ln ${line.number}, Col ${head - line.from + 1}`
  },
  onScroll: () => scheduleSync()
})
savedText = editor.view.state.doc

function renderNow(): void {
  clearTimeout(renderTimer)
  const doc = editor.view.state.doc
  const text = doc.toString()
  preview.innerHTML = renderMarkdown(text, { baseDir: docPath ? dirname(docPath) : null })
  const words = countWords(text)
  stCount.textContent = `${words} ${words === 1 ? 'palavra' : 'palavras'}, ${doc.lines} ${doc.lines === 1 ? 'linha' : 'linhas'}`
  syncPreview()
}

// ---- Scroll sincronizado editor -> preview (só nesse sentido, sem laço de eventos) ----

let syncFrame = 0

function scheduleSync(): void {
  if (syncFrame) return
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0
    syncPreview()
  })
}

function syncPreview(): void {
  if (view.mode !== 'split') return
  const sd = editor.view.scrollDOM
  if (sd.scrollTop <= 0) {
    previewPane.scrollTop = 0
    return
  }
  if (sd.scrollTop + sd.clientHeight >= sd.scrollHeight - 2) {
    previewPane.scrollTop = previewPane.scrollHeight
    return
  }
  const top = editor.viewTop()
  const paneTop = previewPane.getBoundingClientRect().top - previewPane.scrollTop
  const posOf = (el: HTMLElement): number => el.getBoundingClientRect().top - paneTop

  // Bloco do preview cuja linha de origem está logo acima do topo do editor, e o seguinte.
  let a = { ed: 0, pv: 0 }
  let b: { ed: number; pv: number } | null = null
  for (const el of preview.querySelectorAll<HTMLElement>('[data-line]')) {
    const ed = editor.lineTop(Number(el.dataset.line))
    if (ed <= top) a = { ed, pv: posOf(el) }
    else {
      b = { ed, pv: posOf(el) }
      break
    }
  }
  if (!b) b = { ed: editor.view.contentHeight, pv: previewPane.scrollHeight }
  const frac = b.ed > a.ed ? (top - a.ed) / (b.ed - a.ed) : 0
  previewPane.scrollTop = a.pv + frac * (b.pv - a.pv)
}

// ---- Carregar / salvar ----

function updateName(): void {
  stName.textContent = docName
  stName.title = docPath ?? ''
}

function loadDoc(doc: Doc): void {
  docPath = doc.path
  docName = doc.name
  editor.setContent(doc.content)
  savedText = editor.view.state.doc
  // Força a notificação: o main zera o estado ao abrir, mas garantimos coerência.
  dirty = true
  setDirtyState(false)
  updateName()
  renderNow()
  previewPane.scrollTop = 0
  editor.focus()
}

async function save(as: boolean): Promise<void> {
  if (saving) {
    if (as || !pendingSave) pendingSave = as ? 'saveAs' : 'save'
    return
  }
  saving = true
  try {
    const snapshot = editor.view.state.doc
    const content = snapshot.toString()
    const res = await (as ? window.mdr.saveAs(content) : window.mdr.save(content))
    if (!res) return
    const pathChanged = res.path !== docPath
    docPath = res.path
    docName = res.name
    savedText = snapshot
    // Se o usuário digitou durante o salvamento, continua modificado.
    const stillDirty = !editor.view.state.doc.eq(snapshot)
    dirty = !stillDirty
    setDirtyState(stillDirty)
    updateName()
    if (pathChanged) renderNow() // imagens relativas dependem do diretório
  } finally {
    saving = false
    const next = pendingSave
    pendingSave = null
    // "Salvar" sem nada novo (já gravado e com caminho) não precisa repetir.
    if (next === 'saveAs' || (next === 'save' && (dirty || !docPath))) void save(next === 'saveAs')
  }
}

async function openDialog(): Promise<void> {
  const doc = await window.mdr.openFile()
  if (doc) loadDoc(doc)
}

// ---- Tema e modos ----

const theme = initTheme((eff) => {
  editor.setDark(eff === 'dark')
  themeBtn.textContent = eff === 'dark' ? '☀' : '🌙'
  themeBtn.title = eff === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'
})

const view = initView(mainEl, $<HTMLElement>('divider'), (mode: ViewMode) => {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('button[data-mode]')) {
    btn.classList.toggle('active', btn.dataset.mode === mode)
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode))
  }
  if (mode !== 'preview') requestAnimationFrame(() => editor.view.requestMeasure())
  scheduleSync()
})

// ---- Ações (toolbar e menu) ----

function runAction(action: MenuAction): void {
  switch (action) {
    case 'open':
      void openDialog()
      break
    case 'save':
      void save(false)
      break
    case 'saveAs':
      void save(true)
      break
    case 'viewEdit':
      view.setMode('edit')
      break
    case 'viewSplit':
      view.setMode('split')
      break
    case 'viewPreview':
      view.setMode('preview')
      break
    case 'toggleTheme':
      theme.toggle()
      break
    case 'themeSystem':
      theme.set('system')
      break
    case 'themeLight':
      theme.set('light')
      break
    case 'themeDark':
      theme.set('dark')
      break
    case 'new':
      // Novo é resolvido no main (confirmação + reset do path) e chega via onDocOpened.
      // Criar o documento só aqui deixaria o path antigo no main e o próximo "Salvar" sobrescreveria o arquivo anterior.
      break
  }
}

document.querySelector('.toolbar')?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
  if (btn) runAction(btn.dataset.action as MenuAction)
})

window.mdr.onMenu(runAction)
window.mdr.onDocOpened(loadDoc)

// ---- Links no preview ----

preview.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  const href = a.getAttribute('href') ?? ''
  if (href.startsWith('#')) {
    e.preventDefault()
    let id = href.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch {
      // id literal
    }
    const target = id ? document.getElementById(id) : null
    if (target && preview.contains(target)) target.scrollIntoView({ block: 'start' })
    else if (!id) previewPane.scrollTop = 0
    return
  }
  // http(s)/mailto têm target=_blank e o main abre fora; o resto não deve navegar a janela do app.
  if (!/^(https?|mailto):/i.test(href)) e.preventDefault()
})

// ---- Arrastar e soltar ----

document.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer?.types.includes('Files')) e.dataTransfer.dropEffect = 'copy'
})

// Captura: impede que o CodeMirror insira o conteúdo do arquivo solto no texto.
// Arrastar texto dentro do editor (sem arquivos) segue normal.
document.addEventListener(
  'drop',
  (e) => {
    const file = e.dataTransfer?.files[0]
    if (!file) {
      if (!editorPane.contains(e.target as Node)) e.preventDefault()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (!isMarkdownPath(file.name)) return
    void window.mdr.openDroppedFile(file).then((doc) => {
      if (doc) loadDoc(doc)
    })
  },
  true
)

// ---- Início ----

updateName()
renderNow()
editor.focus()
