import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { IPC, MARKDOWN_EXTENSIONS, type Doc, type MenuAction, type ThemeSource } from '@shared/api'
import {
  DEFAULT_TEXT_FORMAT,
  UNTITLED_FILE,
  displayName,
  ensureMdExtension,
  findMarkdownArg,
  findUnencodable,
  isExistingFile,
  isMarkdownPath,
  isThemeSource,
  isUncPath,
  readTextFile,
  windowTitle,
  writeTextFile,
  type TextFormat
} from './files'
import { buildAppMenu, themeMenuItemId } from './menu'
import { backgroundColor, blockRemoteFileRequests, createMainWindow, denyAllPermissions } from './window'

const MD_FILTERS: Electron.FileFilter[] = [
  { name: 'Markdown', extensions: [...MARKDOWN_EXTENSIONS] },
  { name: 'Todos os arquivos', extensions: ['*'] }
]

// Estado do documento atual (uma janela só).
let mainWindow: BrowserWindow | null = null
let currentPath: string | null = null
/** Codificação/BOM/EOL do arquivo atual, para salvar de volta no mesmo formato. */
let currentFormat: TextFormat = { ...DEFAULT_TEXT_FORMAT }
let dirty = false
/**
 * Usuário escolheu "Salvar" ao fechar: fecha quando o renderer reportar o documento limpo
 * (setDirty(false) após o save). Limpo em cancelamento/erro ou se o documento continuar sujo.
 */
let closeAfterSave = false
/** Fecha sem perguntar (usuário escolheu "Não salvar" ou salvou antes de fechar). */
let forceClose = false

function liveWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function updateTitle(): void {
  const win = liveWindow()
  if (!win) return
  win.setTitle(windowTitle(currentPath, dirty))
  if (process.platform === 'darwin') win.setDocumentEdited(dirty)
}

function setDocState(path: string | null, format: TextFormat = DEFAULT_TEXT_FORMAT): void {
  currentPath = path
  currentFormat = { ...format }
  dirty = false
  updateTitle()
}

function sendMenu(action: MenuAction): void {
  liveWindow()?.webContents.send(IPC.menu, action)
}

function sendDocOpened(doc: Doc): void {
  liveWindow()?.webContents.send(IPC.docOpened, doc)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Só aceita IPC do frame principal da janela principal. */
function isTrustedSender(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const win = liveWindow()
  return !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame
}

type DiscardChoice = 'save' | 'discard' | 'cancel'

async function askUnsaved(win: BrowserWindow): Promise<DiscardChoice> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Salvar', 'Não salvar', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: 'MDR',
    message: `Deseja salvar as alterações em "${displayName(currentPath)}"?`,
    detail: 'Suas alterações serão perdidas se você não salvá-las.'
  })
  return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
}

/**
 * Antes de trocar de documento: se sujo, pergunta. "Salvar" pede ao renderer
 * que salve (IPC.menu 'save') e aborta a troca. true = pode prosseguir.
 */
async function confirmDiscard(): Promise<boolean> {
  const win = liveWindow()
  if (!win || !dirty) return true
  const choice = await askUnsaved(win)
  if (choice === 'save') sendMenu('save')
  return choice === 'discard'
}

async function loadPath(path: string): Promise<Doc | null> {
  if (!isMarkdownPath(path) || !isExistingFile(path)) {
    dialog.showErrorBox('Não foi possível abrir', `Não é um arquivo Markdown válido:\n${path}`)
    return null
  }
  try {
    const { text: content, ...format } = await readTextFile(path)
    setDocState(path, format)
    return { path, name: displayName(path), content }
  } catch (err) {
    dialog.showErrorBox('Não foi possível abrir', `${path}\n\n${errorMessage(err)}`)
    return null
  }
}

async function openViaDialog(): Promise<Doc | null> {
  const win = liveWindow()
  if (!win || !(await confirmDiscard())) return null
  const res = await dialog.showOpenDialog(win, {
    title: 'Abrir',
    properties: ['openFile'],
    filters: MD_FILTERS
  })
  if (res.canceled || res.filePaths.length === 0) return null
  return loadPath(res.filePaths[0]!)
}

async function openPathConfirmed(path: string): Promise<Doc | null> {
  if (!(await confirmDiscard())) return null
  return loadPath(path)
}

/** Abre arquivo arrastado: só caminho local (não UNC) e markdown. */
async function openDropped(path: string): Promise<Doc | null> {
  if (isUncPath(path)) {
    dialog.showErrorBox(
      'Não foi possível abrir',
      `Arquivos em caminho de rede não podem ser abertos arrastando. Use Arquivo > Abrir.\n${path}`
    )
    return null
  }
  if (!isMarkdownPath(path)) return null
  return openPathConfirmed(path)
}

/**
 * Formato para gravar `content`: o do documento; se a codificação não representar algum caractere,
 * pergunta se grava em UTF-8. null = cancelado.
 */
async function formatForSave(content: string): Promise<TextFormat | null> {
  const ch = findUnencodable(content, currentFormat.encoding)
  if (ch === null) return currentFormat
  const win = liveWindow()
  const opts: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['Salvar em UTF-8', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: 'MDR',
    message: `O documento contém caracteres que não podem ser gravados em ${currentFormat.encoding} (ex.: ${JSON.stringify(ch)}).`,
    detail: 'Salvar em UTF-8 preserva todo o texto, mas muda a codificação do arquivo.'
  }
  const { response } = await (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
  return response === 0 ? { ...currentFormat, encoding: 'utf-8', bom: false } : null
}

async function writeDoc(path: string, content: string): Promise<Doc | null> {
  const format = await formatForSave(content)
  if (!format) {
    closeAfterSave = false
    return null
  }
  try {
    await writeTextFile(path, content, format)
  } catch (err) {
    closeAfterSave = false
    dialog.showErrorBox('Não foi possível salvar', `${path}\n\n${errorMessage(err)}`)
    return null
  }
  // O fechamento pedido ao salvar acontece quando o renderer confirmar setDirty(false).
  setDocState(path, format)
  return { path, name: displayName(path), content }
}

async function saveAs(content: string): Promise<Doc | null> {
  const win = liveWindow()
  if (!win) return null
  const res = await dialog.showSaveDialog(win, {
    title: 'Salvar como',
    defaultPath: currentPath ?? UNTITLED_FILE,
    filters: MD_FILTERS
  })
  if (res.canceled || !res.filePath) {
    closeAfterSave = false
    return null
  }
  return writeDoc(ensureMdExtension(res.filePath), content)
}

async function save(content: string): Promise<Doc | null> {
  return currentPath ? writeDoc(currentPath, content) : saveAs(content)
}

function registerIpc(): void {
  ipcMain.handle(IPC.openFile, (e) => (isTrustedSender(e) ? openViaDialog() : null))
  ipcMain.handle(IPC.openDropped, (e, path: unknown) =>
    isTrustedSender(e) && typeof path === 'string' && path !== '' ? openDropped(path) : null
  )
  ipcMain.handle(IPC.save, (e, content: unknown) =>
    isTrustedSender(e) && typeof content === 'string' ? save(content) : null
  )
  ipcMain.handle(IPC.saveAs, (e, content: unknown) =>
    isTrustedSender(e) && typeof content === 'string' ? saveAs(content) : null
  )
  ipcMain.on(IPC.setDirty, (e, value: unknown) => {
    if (!isTrustedSender(e) || typeof value !== 'boolean') return
    dirty = value
    updateTitle()
    if (!closeAfterSave) return
    // "Salvar" ao fechar: limpo = o conteúdo do editor está no disco, fecha.
    // Sujo (digitou durante o save) = desiste de fechar; a janela fica aberta com o indicador.
    closeAfterSave = false
    if (!value) closeNow()
  })
  ipcMain.on(IPC.setTheme, (e, theme: unknown) => {
    if (!isTrustedSender(e) || !isThemeSource(theme)) return
    nativeTheme.themeSource = theme
    syncThemeUi(theme)
  })
}

/** Fecha sem perguntar; adiado para o IPC em andamento responder antes. */
function closeNow(): void {
  forceClose = true
  setImmediate(() => liveWindow()?.close())
}

/** Marca o radio de Exibir > Tema e ajusta o fundo nativo da janela. */
function syncThemeUi(theme: ThemeSource): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById(themeMenuItemId(theme))
  if (item) item.checked = true
  liveWindow()?.setBackgroundColor(backgroundColor())
}

async function menuNew(): Promise<void> {
  if (!(await confirmDiscard())) return
  setDocState(null)
  sendDocOpened({ path: null, name: displayName(null), content: '' })
}

async function menuOpen(): Promise<void> {
  const doc = await openViaDialog()
  if (doc) sendDocOpened(doc)
}

function showAbout(): void {
  const win = liveWindow()
  const opts: Electron.MessageBoxOptions = {
    type: 'info',
    title: 'Sobre o MDR',
    message: `MDR ${app.getVersion()}`,
    detail: 'Editor e visualizador de Markdown.'
  }
  void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
}

function focusWindow(): void {
  const win = liveWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

function openWindow(initialPath: string | null): void {
  currentPath = null
  currentFormat = { ...DEFAULT_TEXT_FORMAT }
  dirty = false
  closeAfterSave = false
  forceClose = false
  const win = createMainWindow()
  mainWindow = win
  updateTitle()

  win.on('close', (e) => {
    if (forceClose || !dirty) return
    e.preventDefault()
    void askUnsaved(win).then((choice) => {
      if (choice === 'save') {
        // Pode ter ficado limpo com o diálogo aberto (um save em andamento terminou).
        if (!dirty) return closeNow()
        closeAfterSave = true
        sendMenu('save')
      } else if (choice === 'discard') {
        forceClose = true
        win.close()
      }
    })
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (initialPath) {
    win.webContents.once('did-finish-load', () => {
      void loadPath(initialPath).then((doc) => doc && sendDocOpened(doc))
    })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, workingDirectory) => {
    focusWindow()
    const path = findMarkdownArg(argv.slice(1), workingDirectory)
    if (!path) return
    void openPathConfirmed(path).then((doc) => doc && sendDocOpened(doc))
  })

  void app.whenReady().then(() => {
    denyAllPermissions()
    blockRemoteFileRequests()
    registerIpc()
    nativeTheme.on('updated', () => liveWindow()?.setBackgroundColor(backgroundColor()))
    Menu.setApplicationMenu(
      buildAppMenu(
        {
          onNew: () => void menuNew(),
          onOpen: () => void menuOpen(),
          onAbout: showAbout,
          send: sendMenu
        },
        !app.isPackaged
      )
    )
    openWindow(findMarkdownArg(process.argv.slice(1), process.cwd()))
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow(null)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
