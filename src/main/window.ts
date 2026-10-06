import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, session, shell } from 'electron'
import { isAllowedExternalUrl, isRemoteFileUrl } from './files'

const OPEN_PROTOCOLS = ['http:', 'https:', 'mailto:']
const NAVIGATE_PROTOCOLS = ['http:', 'https:']

/** Nega todas as permissões (câmera, notificações etc.) na sessão padrão. */
export function denyAllPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}

/**
 * Cancela qualquer requisição file:// com host (UNC). A página é file:// no app empacotado, então
 * `//host/x.png` ou `\\host\x.png` no preview viraria acesso SMB (vazamento de hash NTLM).
 */
export function blockRemoteFileRequests(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: isRemoteFileUrl(details.url) })
  })
}

/** Cor de fundo nativa conforme o tema efetivo (evita flash ao redimensionar/abrir). */
export function backgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff'
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    title: 'MDR',
    show: false,
    autoHideMenuBar: false,
    backgroundColor: backgroundColor(),
    // Em dev não há .exe para herdar o ícone (__dirname é out/main); empacotado, a janela usa o do .exe.
    ...(!app.isPackaged && { icon: join(__dirname, '../../build/icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())
  // O título é controlado pelo main (nome do documento e estado sujo).
  win.on('page-title-updated', (e) => e.preventDefault())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url, OPEN_PROTOCOLS)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Bloqueia qualquer navegação (links, arquivo solto na janela); http/https abre fora.
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    if (isAllowedExternalUrl(url, NAVIGATE_PROTOCOLS)) void shell.openExternal(url)
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
