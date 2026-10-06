// Contrato compartilhado entre main, preload e renderer.
// Só tipos e constantes: não importe nada de Node/Electron/DOM aqui.

/** Documento aberto no editor. `path` é null para documento novo ainda não salvo. */
export interface Doc {
  path: string | null
  name: string
  content: string
}

/** Ações disparadas pelo menu da aplicação (main -> renderer). */
export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'viewEdit'
  | 'viewSplit'
  | 'viewPreview'
  | 'toggleTheme'
  | 'themeSystem'
  | 'themeLight'
  | 'themeDark'

/** Extensões tratadas como Markdown (sem ponto, minúsculas). Fonte única para main e renderer. */
export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdwn', 'mdtxt', 'mdtext'] as const

/** Preferência de tema. 'system' segue o tema do sistema operacional. */
export type ThemeSource = 'system' | 'light' | 'dark'

/** API exposta pelo preload em `window.mdr`. */
export interface MdrApi {
  /** Mostra o diálogo de abrir; null se cancelado. */
  openFile(): Promise<Doc | null>
  /** Abre um File solto na janela (o preload obtém o caminho via webUtils); null se recusado/falhou. */
  openDroppedFile(file: File): Promise<Doc | null>
  /** Aplica o tema no main (nativeTheme.themeSource: barra de título, menus, diálogos). */
  setTheme(theme: ThemeSource): void
  /** Salva no path atual; se não houver, comporta-se como saveAs. null se cancelado/falhou. */
  save(content: string): Promise<Doc | null>
  /** Mostra o diálogo de salvar como; null se cancelado/falhou. */
  saveAs(content: string): Promise<Doc | null>
  /** Informa ao main se há alterações não salvas (título com `•` e confirmação ao fechar). */
  setDirty(dirty: boolean): void
  /** Documento aberto pelo main (argv, segunda instância, menu, novo). Retorna função para remover o listener. */
  onDocOpened(cb: (doc: Doc) => void): () => void
  /** Ação de menu. Retorna função para remover o listener. */
  onMenu(cb: (action: MenuAction) => void): () => void
}

/**
 * Canais IPC.
 * - invoke (renderer -> main, ipcRenderer.invoke / ipcMain.handle):
 *     openFile  () => Doc | null
 *     openDropped (path: string) => Doc | null   (só pelo preload; recusa UNC e não-markdown)
 *     save      (content: string) => Doc | null
 *     saveAs    (content: string) => Doc | null
 * - send (renderer -> main, ipcRenderer.send / ipcMain.on):
 *     setDirty  (dirty: boolean)
 *     setTheme  (theme: ThemeSource)
 * - eventos (main -> renderer, webContents.send / ipcRenderer.on):
 *     docOpened (doc: Doc)
 *     menu      (action: MenuAction)
 */
export const IPC = {
  openFile: 'mdr:open-file',
  openDropped: 'mdr:open-dropped',
  save: 'mdr:save',
  saveAs: 'mdr:save-as',
  setDirty: 'mdr:set-dirty',
  setTheme: 'mdr:set-theme',
  docOpened: 'mdr:doc-opened',
  menu: 'mdr:menu'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
