// Editor CodeMirror 6 configurado para Markdown.

import { basicSetup } from 'codemirror'
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'

export interface EditorHandlers {
  /** Conteúdo mudou. */
  onChange(update: ViewUpdate): void
  /** Seleção/cursor mudou. */
  onCursor(view: EditorView): void
  /** Rolagem do editor. */
  onScroll(view: EditorView): void
}

// Tema claro coerente com as variáveis CSS do app (o escuro usa oneDark).
const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--bg)', color: 'var(--fg)' },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-subtle)',
      color: 'var(--fg-muted)',
      borderRight: '1px solid var(--border)'
    },
    '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' }
  },
  { dark: false }
)

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0' },
  '&.cm-focused': { outline: 'none' }
})

export class MdEditor {
  readonly view: EditorView
  private readonly themeSlot = new Compartment()
  private dark = false

  constructor(parent: HTMLElement, private readonly handlers: EditorHandlers) {
    this.view = new EditorView({ parent, state: this.createState('') })
    this.view.scrollDOM.addEventListener('scroll', () => this.handlers.onScroll(this.view), { passive: true })
  }

  private createState(doc: string): EditorState {
    const extensions: Extension[] = [
      basicSetup,
      markdown({ codeLanguages: languages }),
      EditorView.lineWrapping,
      keymap.of([indentWithTab]),
      baseTheme,
      this.themeSlot.of(this.dark ? oneDark : lightTheme),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) this.handlers.onChange(u)
        if (u.docChanged || u.selectionSet) this.handlers.onCursor(u.view)
      })
    ]
    return EditorState.create({ doc, extensions })
  }

  /** Substitui o documento inteiro (zera histórico de desfazer). */
  setContent(text: string): void {
    this.view.setState(this.createState(text))
    this.view.scrollDOM.scrollTop = 0
    this.handlers.onCursor(this.view)
  }

  setDark(dark: boolean): void {
    if (dark === this.dark) return
    this.dark = dark
    this.view.dispatch({ effects: this.themeSlot.reconfigure(dark ? oneDark : lightTheme) })
  }

  focus(): void {
    this.view.focus()
  }

  /** Topo da área visível em coordenadas do documento do editor (mesma base de lineTop). */
  viewTop(): number {
    return Math.max(0, this.view.scrollDOM.getBoundingClientRect().top - this.view.documentTop)
  }

  /** Altura (px, coordenadas do documento do editor) do topo de uma linha base 0. */
  lineTop(line: number): number {
    const doc = this.view.state.doc
    const n = Math.min(Math.max(line + 1, 1), doc.lines)
    return this.view.lineBlockAt(doc.line(n).from).top
  }
}
