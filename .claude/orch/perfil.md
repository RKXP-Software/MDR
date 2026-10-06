<!-- orch:perfil · versao-orch: 0.4.0 · analisado-em: 2026-10-06 · commit: a72e02c · modo: analise -->
# Perfil do projeto — MDR

Editor e visualizador de Markdown para desktop (Windows), com edição e pré-visualização lado a lado. App Electron single-window, ~1,6 mil linhas de código + ~900 de testes. Estado: v0.1.0, primeira versão funcional e testada (autor: RKXP Software).

## Stack

| Item | Valor | Evidência |
|---|---|---|
| Linguagem | TypeScript ~5.9 (strict via tsconfig), sem framework de UI (DOM puro) | `package.json`, `tsconfig.*.json` |
| Runtime / build | Electron 44, electron-vite 5, Vite 7 | `package.json`, `electron.vite.config.ts` |
| Editor / render | CodeMirror 6, markdown-it 15 (+task-lists), highlight.js, DOMPurify | `package.json` |
| Testes | Vitest 5 (+ jsdom no renderer) | `vitest.config.ts` |
| Empacotamento | electron-builder 26 (NSIS, Windows) | `electron-builder.yml` |
| Pacotes | npm (`package-lock.json`) | raiz |
| Banco / serviços | nenhum | — |

## Comandos

| Ação | Comando | Status |
|---|---|---|
| Instalar | `npm install` | não verificado |
| Build | `npm run build` | não verificado |
| Rodar (dev) | `npm run dev` | não verificado |
| Testes (todos) | `npm test` (vitest run) | verificado (263 passam) |
| Teste único | `npx vitest run tests/main/files.test.ts` ou `-t "<nome>"` | não verificado |
| Typecheck | `npm run typecheck` (node + web) | verificado |
| Instalador | `npm run dist` | não verificado |
| Lint / format | não encontrado (sem ESLint/Prettier; sem CI) | — |

## Estrutura

| Caminho | Responsabilidade |
|---|---|
| `src/main/` | Processo main: `index.ts` (ciclo de vida, IPC, estado do documento, diálogos), `files.ts` (leitura/escrita, codificação, validações puras), `menu.ts`, `window.ts` (janela, permissões, bloqueio de navegação) |
| `src/preload/index.ts` | Ponte `window.mdr` via contextBridge (sandbox: só importa `electron`; saída CJS) |
| `src/shared/api.ts` | Contrato main↔preload↔renderer: tipos, canais `IPC`, `MARKDOWN_EXTENSIONS`. Só tipos/constantes |
| `src/renderer/src/` | UI: `main.ts` (orquestra), `editor.ts` (CodeMirror), `markdown.ts` (render + sanitização), `theme.ts`, `view.ts` (modos/divisor), CSS |
| `tests/main`, `tests/renderer` | Testes espelhando as pastas de `src` |
| `out/`, `release/` | Saídas de build (gitignored) |

## Arquitetura

- Pontos de entrada: `src/main/index.ts` (main), `src/preload/index.ts`, `src/renderer/index.html` → `src/renderer/src/main.ts`.
- Fluxo: menu/atalho/drag-drop → main (diálogos, fs, estado `currentPath`/`dirty`) ↔ IPC (`IPC` em `src/shared/api.ts`) ↔ preload `window.mdr` ↔ renderer (edita, renderiza preview ~150 ms após digitar).
- Alias `@shared` → `src/shared` (vite e vitest).
- Referências ao criar algo novo: nova função de IPC → `src/shared/api.ts` + `src/preload/index.ts` + handler em `src/main/index.ts`; lógica pura testável → `src/main/files.ts`; render puro → `src/renderer/src/markdown.ts`.

## Convenções

- Nomes: arquivos em minúsculas com hífen, funções/variáveis camelCase em inglês; comentários e mensagens de UI em português (pt-BR).
- Estilo: sem formatter; código sem ponto e vírgula, aspas simples, 2 espaços — seguir o existente. Comentários explicam o "porquê" (segurança, restrições do Electron).
- Erros: funções do main devolvem `null` em cancelamento/falha em vez de lançar para o renderer.
- Commits: mensagens em português, curtas; histórico mínimo (2 commits).

## Testes

- Vitest · `tests/**/*.test.ts` · renderer roda em jsdom (`environmentMatchGlobs`), main em node.
- Exemplo a imitar: `tests/main/files.test.ts` (fs real em diretório temporário via `mkdtemp`, `it.each`); `tests/renderer/security.test.ts` para sanitização.
- Lógica de Electron fica fora de `files.ts` por não ser testável em node; teste só funções puras.

## Cuidados

- **Segurança é requisito central**: `sandbox: true`, `contextIsolation`, sem nodeIntegration, permissões negadas, navegação bloqueada, requisições `file://` com host (UNC/NTLM) canceladas, HTML do preview sanitizado com DOMPurify (sem `style`). Não afrouxe `window.ts`, `markdown.ts` nem os fuses em `electron-builder.yml` sem teste em `tests/renderer/security.test.ts`.
- Preload não pode importar além de `electron` (bundle CJS único); `shared/api.ts` não pode importar Node/Electron/DOM.
- Arquivos preservam codificação (UTF-8/Windows-1252), BOM e EOL ao salvar (`TextFormat` em `files.ts`).
- Não editar `out/`, `release/`, `*.tsbuildinfo`.
- Estado de documento único no main (uma janela só).

## Especialistas do projeto

Nenhum — projeto pequeno e homogêneo; os agentes genéricos do orch bastam.
