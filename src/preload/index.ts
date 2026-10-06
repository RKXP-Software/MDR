import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type Doc, type MdrApi, type MenuAction } from '@shared/api'

// Com sandbox: true o preload só pode importar 'electron' (o resto vai bundlado).

const api: MdrApi = {
  openFile: () => ipcRenderer.invoke(IPC.openFile),
  // O caminho vem do File (webUtils), não da página: ela não escolhe o que o main abre.
  openDroppedFile: (file) => {
    let path = ''
    try {
      path = webUtils.getPathForFile(file)
    } catch {
      path = ''
    }
    return path ? ipcRenderer.invoke(IPC.openDropped, path) : Promise.resolve(null)
  },
  setTheme: (theme) => ipcRenderer.send(IPC.setTheme, theme),
  save: (content) => ipcRenderer.invoke(IPC.save, content),
  saveAs: (content) => ipcRenderer.invoke(IPC.saveAs, content),
  setDirty: (dirty) => ipcRenderer.send(IPC.setDirty, dirty),
  onDocOpened: (cb) => {
    const listener = (_e: IpcRendererEvent, doc: Doc): void => cb(doc)
    ipcRenderer.on(IPC.docOpened, listener)
    return () => ipcRenderer.removeListener(IPC.docOpened, listener)
  },
  onMenu: (cb) => {
    const listener = (_e: IpcRendererEvent, action: MenuAction): void => cb(action)
    ipcRenderer.on(IPC.menu, listener)
    return () => ipcRenderer.removeListener(IPC.menu, listener)
  }
}

contextBridge.exposeInMainWorld('mdr', api)
