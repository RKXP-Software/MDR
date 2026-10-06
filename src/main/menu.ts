import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction, ThemeSource } from '@shared/api'

/** id do radio de Exibir > Tema (para o main marcar o tema atual). */
export function themeMenuItemId(theme: ThemeSource): string {
  return `theme-${theme}`
}

export interface MenuHandlers {
  /** Novo/Abrir são resolvidos no main (confirmação de descarte + docOpened). */
  onNew(): void
  onOpen(): void
  onAbout(): void
  /** Demais ações vão ao renderer via IPC.menu. */
  send(action: MenuAction): void
}

export function buildAppMenu(h: MenuHandlers, isDev: boolean): Menu {
  const view: MenuItemConstructorOptions[] = [
    { label: 'Somente editor', accelerator: 'CmdOrCtrl+1', click: () => h.send('viewEdit') },
    { label: 'Dividido', accelerator: 'CmdOrCtrl+2', click: () => h.send('viewSplit') },
    { label: 'Somente visualização', accelerator: 'CmdOrCtrl+3', click: () => h.send('viewPreview') },
    { type: 'separator' },
    {
      label: 'Tema',
      submenu: [
        {
          id: themeMenuItemId('system'),
          label: 'Sistema',
          type: 'radio',
          checked: true,
          click: () => h.send('themeSystem')
        },
        { id: themeMenuItemId('light'), label: 'Claro', type: 'radio', click: () => h.send('themeLight') },
        { id: themeMenuItemId('dark'), label: 'Escuro', type: 'radio', click: () => h.send('themeDark') }
      ]
    },
    {
      label: 'Alternar tema claro/escuro',
      accelerator: 'CmdOrCtrl+Shift+T',
      click: () => h.send('toggleTheme')
    },
    { type: 'separator' },
    { role: 'resetZoom', label: 'Tamanho original' },
    { role: 'zoomIn', label: 'Aumentar zoom' },
    { role: 'zoomOut', label: 'Diminuir zoom' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Tela cheia' }
  ]
  if (isDev) {
    view.push({ type: 'separator' }, { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' })
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Novo', accelerator: 'CmdOrCtrl+N', click: () => h.onNew() },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: () => h.onOpen() },
        { label: 'Salvar', accelerator: 'CmdOrCtrl+S', click: () => h.send('save') },
        { label: 'Salvar como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => h.send('saveAs') },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Selecionar tudo' }
      ]
    },
    { label: 'Exibir', submenu: view },
    {
      label: 'Ajuda',
      submenu: [{ label: 'Sobre o MDR', click: () => h.onAbout() }]
    }
  ]
  return Menu.buildFromTemplate(template)
}
