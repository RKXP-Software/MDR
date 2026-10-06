<!-- orch:plano · id: 20261005-2324-editor-md-electron · status: em-execucao · criado: 2026-10-05 23:24 · commit-inicial: sem-git · versao-orch: 0.4.0 -->
# MDR — editor e visualizador de Markdown (Electron)

**Demanda original:** Criar um app para pode editar e visualizar arquivos .md; repositorio do git: https://github.com/RKXP-Software/MDR
**Grupo:** — · **Depende dos planos:** —

## Objetivo

App desktop (Windows) em Electron que abre, edita, visualiza (preview ao vivo) e salva arquivos `.md`, com código versionado e enviado para `origin/main` em https://github.com/RKXP-Software/MDR.

## Suposições e decisões

- Plataforma: **Electron desktop** (escolha do usuário). Node 24 / npm 10 disponíveis.
- Stack: **electron-vite + TypeScript**, editor **CodeMirror 6** (`@codemirror/lang-markdown`), render **markdown-it** (+ GFM: tabelas, task lists) com **highlight.js** e sanitização via **DOMPurify**; empacotamento via **electron-builder** (alvo NSIS, só configurado).
- Segurança: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; renderer acessa o sistema só pela API do preload; links externos abrem no navegador.
- Contrato preload ↔ renderer fixado em `src/shared/api.ts` (criado na T1) para T2 e T3 rodarem em paralelo:
  `window.mdr = { openFile(): Promise<Doc|null>; save(content): Promise<Doc|null>; saveAs(content): Promise<Doc|null>; setDirty(dirty: boolean): void; onDocOpened(cb: (doc: Doc) => void); onMenu(cb: (action: MenuAction) => void) }`,
  `Doc = { path: string|null; name: string; content: string }`, `MenuAction = 'new'|'open'|'save'|'saveAs'|'viewEdit'|'viewSplit'|'viewPreview'|'toggleTheme'`.
- Funcionalidades: novo/abrir/salvar/salvar como, modos editar/dividido/visualizar, scroll sincronizado, tema claro/escuro, título com nome + `•` quando modificado, confirmação ao fechar com alterações, abrir `.md` via argumento de linha de comando, arrastar-e-soltar arquivo.
- **Dark mode** (pedido do usuário durante a execução): segue o tema do SO por padrão, alternância claro/escuro na toolbar e no menu (Ctrl+Shift+T), preferência persistida, `nativeTheme.themeSource` sincronizado (barra de título/menus), editor com tema escuro (one-dark) e preview/highlight.js com paleta escura.
- Git: usuário autorizou `git init`, commit e **push para `main`** ao final.

## Tarefas

| ID | Tarefa | Executor | Depende de | Arquivos (escrita) | Status |
|---|---|---|---|---|---|
| T1 | Criar esqueleto electron-vite + TS e contrato da API | `orch:desenvolvedor` | — | `package.json`, configs, `.gitignore`, `src/shared/**`, esqueleto de `src/**` | concluida |
| T2 | Implementar processo principal e preload (arquivos, menu, diálogos) | `orch:desenvolvedor` | T1 | `src/main/**`, `src/preload/**` | concluida |
| T3 | Implementar UI: editor CodeMirror + preview markdown-it | `orch:desenvolvedor` | T1 | `src/renderer/**` | concluida |
| T4 | Escrever e rodar testes (vitest) + build | `orch:testador` | T2, T3 | `tests/**`, `vitest.config.ts` | concluida |
| T5 | Revisar código e segurança | `orch:revisor` | T2, T3 | — (leitura) | concluida |
| T6 | Escrever README | `orch:documentador` | T2, T3 | `README.md` | concluida |
| T8 | Corrigir achados da revisão (A1, A2, M1–M4, B1–B6) | `orch:desenvolvedor` | T5 | `src/**`, `electron-builder.yml`, `package.json` | concluida |
| T9 | Testes de regressão dos achados corrigidos | `orch:testador` | T8 | `tests/**` | concluida |
| T7 | git init, commit e push para origin/main | orquestrador | T4, T5, T6, T9 | `.git` | em-andamento |

Status: `pendente` · `em-andamento` · `concluida` · `falhou` · `pulada`

## Ondas de execução

```
Onda 1: T1
Onda 2: T2 ∥ T3            (após T1)
Onda 3: T4 ∥ T5 ∥ T6       (após T2, T3)
Onda 4: T8                 (após T5)
Onda 5: T9                 (após T8)
Onda 6: T7                 (após T4, T6, T9)
```

Caminho crítico: T1 → T3 → T5 → T8 → T9 → T7. Uma tarefa começa assim que **todas** as suas dependências terminam — não espera a onda inteira.

## Detalhe das tarefas

### T1 — Esqueleto do projeto
- **Executor:** `orch:desenvolvedor`
- **Faz:** projeto electron-vite (TS) na raiz, dependências instaladas, scripts `dev`/`build`/`typecheck`/`test`/`dist`, `src/shared/api.ts` com o contrato, stubs mínimos em `src/main`, `src/preload`, `src/renderer`, `electron-builder` configurado, `.gitignore`.
- **Pronto quando:** `npm install` e `npm run build` passam; contrato em `src/shared/api.ts`.
- **Resultado:** electron 44.5 + electron-vite 5 (vite 7) + TS 5.9 strict; alias `@shared`; preload CJS (sandbox); electron-builder (NSIS, associação .md, saída `release/`). typecheck e build OK; `npm test` falha só por não haver testes. Binário do Electron exigiu `node node_modules/electron/install.js`; npm 10.8.1 teve bug de instalação em lote. Orquestrador ampliou o contrato depois: `openPath`, `getPathForFile` (drag-and-drop com sandbox) e `setTheme`/`ThemeSource` (dark mode).

### T2 — Processo principal e preload
- **Executor:** `orch:desenvolvedor`
- **Faz:** janela segura, menu (Arquivo/Exibir com atalhos), diálogos abrir/salvar filtrando `.md`, leitura/escrita UTF-8, título com estado sujo, confirmação ao fechar, abrir arquivo via argv / segunda instância, links externos no navegador; preload expõe `window.mdr` conforme contrato.
- **Pronto quando:** `npm run typecheck` e `npm run build` passam; API completa exposta.
- **Resultado:** `src/main/{index,files,menu,window}.ts` + `src/preload/index.ts`. IPC valida remetente e tipos; Novo/Abrir do menu resolvidos no main (envia `docOpened`); main só envia `save`/`saveAs`/`view*`/`toggleTheme` via `menu`; confirmação de descarte em openFile/openPath e ao fechar (fechar-após-salvar); argv + instância única; navegação/janelas/permissões bloqueadas. Funções puras em `files.ts` (isMarkdownPath, stripBom, ensureMdExtension, displayName, windowTitle, findMarkdownArg, isThemeSource, isAllowedExternalUrl). typecheck:node e build OK. Riscos: sem método `newFile` no contrato; backgroundColor não acompanha `setTheme`.

### T3 — UI de edição e visualização
- **Executor:** `orch:desenvolvedor`
- **Faz:** layout com toolbar, CodeMirror 6 (markdown, quebra de linha), preview markdown-it + highlight.js + DOMPurify, modos editar/dividido/visualizar, scroll sincronizado, tema claro/escuro persistido, drag-and-drop, estado sujo via `setDirty`; lógica de render em módulo puro testável (`src/renderer/src/markdown.ts`).
- **Pronto quando:** `npm run typecheck` e `npm run build` passam.
- **Resultado:** `src/renderer/src/{main,editor,markdown,theme,view}.ts` + `style.css`/`preview.css`. CodeMirror 6; preview com debounce 150 ms, sanitização DOMPurify, links externos `target=_blank`, imagens relativas -> `file://`, ids nos títulos, `data-line` para scroll sincronizado; modos e divisor persistidos; drag-and-drop via `getPathForFile`/`openPath`; dark mode (preferência system/light/dark em `mdr.theme`, `data-theme`, oneDark, hljs GitHub claro/escuro, `setTheme` no main). Novo só no menu (evita sobrescrever arquivo antigo). typecheck:web e build OK; GUI não exercitada.

### T4 — Testes
- **Executor:** `orch:testador`
- **Faz:** vitest para o render markdown (GFM, código, sanitização de `<script>`/`onerror`/`javascript:`) e utilitários do main; roda typecheck, testes e build.
- **Pronto quando:** `npm test` e `npm run build` passam.
- **Resultado:** `vitest.config.ts` + `tests/main/files.test.ts`, `tests/renderer/markdown.test.ts`, `tests/renderer/theme-view.test.ts`: 134 testes passando; typecheck e build OK. Nenhum bug em `src`. Sem cobertura: controladores `initTheme`/`initView`.

### T5 — Revisão
- **Executor:** `orch:revisor`
- **Faz:** revisa bugs, XSS no preview, configuração de segurança do Electron, perda de dados (fechar sem salvar).
- **Pronto quando:** relatório com achados priorizados.
- **Resultado:** Base correta (isolamento, sandbox, IPC validado, navegação bloqueada). Achados: **A1** vazamento NTLM (`//host`, `\\host`, `srcset`, svg image, `url()` resolvem para `file://host`); **A2** arquivo não-UTF-8 corrompido ao salvar; **M1** escrita não atômica; **M2** CRLF/BOM não preservados; **M3** `openPath` aceita qualquer caminho do renderer; **M4** `<style>`/`style` permitidos no preview; **B1** salvar-ao-fechar com save em andamento; **B2** extensões divergentes main/renderer; **B3** sem volta ao tema `system`; **B4** `backgroundColor` desatualizado; **B5** `mailto:` não funciona; **B6** sem electron fuses.

### T8 — Correções da revisão
- **Executor:** `orch:desenvolvedor`
- **Faz:** corrige A1, A2, M1–M4 e B1–B6 conforme a T5.
- **Pronto quando:** achados corrigidos; typecheck, testes e build passam.
- **Resultado:** Todos os 12 corrigidos. A1: `webRequest` cancela `file://` com host + hook DOMPurify remove URLs `//`/`\\`, `srcset` proibido, só relativa/http(s)/`data:image`. A2: UTF-8 estrito com fallback windows-1252 (tabela própria) e diálogo se não representável. M1: tmp + rename. M2: formato (encoding/BOM/EOL) guardado no main e reaplicado. M3: `openDroppedFile(file)` no preload, UNC recusado. M4: `<style>`/`style` proibidos (alinhamento de tabela via classes). B1–B6 conforme revisão (submenu Tema com Sistema/Claro/Escuro). README ajustado. typecheck, 134 testes e build OK. Não verificado em runtime: bloqueio via `webRequest` e fuses no instalador.

### T9 — Testes de regressão
- **Executor:** `orch:testador`
- **Faz:** testes para A1 (sanitização de URLs de rede), A2 (decodificação), M2 (CRLF/BOM), M4 (style), B2 (extensões compartilhadas), escrita atômica.
- **Pronto quando:** `npm test` e build passam.
- **Resultado:** `tests/main/encoding.test.ts`, `tests/main/menu.test.ts`, `tests/renderer/security.test.ts` (19 payloads de A1, codificação, escrita atômica, style, mailto, extensões). Suíte: 263 testes passando; typecheck e build OK. Nenhum bug.

### T6 — README
- **Executor:** `orch:documentador`
- **Faz:** README em pt-BR: o que é, funcionalidades, atalhos, como rodar/buildar/empacotar, estrutura.
- **Pronto quando:** `README.md` reflete o código real.
- **Resultado:** README pt-BR criado; atalhos e scripts conferidos contra `menu.ts`/`package.json`. Pendência: `package.json` declara MIT mas não há `LICENSE`; sem `engines`.

### T7 — Versionar e publicar
- **Executor:** orquestrador
- **Faz:** `git init -b main`, remote `origin`, commit, `git push -u origin main`.
- **Pronto quando:** `git ls-remote origin` mostra `refs/heads/main`.
- **Resultado:** —

## Registro de execução

| Quando | Evento |
|---|---|
| 2026-10-05 23:24 | Plano criado |
| 2026-10-05 23:27 | Execução iniciada · T1 iniciada por orch:desenvolvedor |
| 2026-10-05 23:41 | T1 concluída por orch:desenvolvedor |
| 2026-10-05 23:42 | Replanejado: dark mode explícito (pedido do usuário) e contrato ampliado (openPath, getPathForFile, setTheme) |
| 2026-10-05 23:42 | T2 e T3 iniciadas por orch:desenvolvedor |
| 2026-10-06 03:22 | T2 e T3 interrompidas por limite de uso da API; retomadas nos mesmos agentes |
| 2026-10-06 03:22 | T2 concluída por orch:desenvolvedor |
| 2026-10-06 03:28 | T3 concluída por orch:desenvolvedor · T4, T5, T6 iniciadas |
| 2026-10-06 03:31 | T6 concluída por orch:documentador |
| 2026-10-06 03:31 | T4 concluída por orch:testador |
| 2026-10-06 03:33 | T5 concluída por orch:revisor · Replanejado: T8 (correções) e T9 (regressão) antes do push · T8 iniciada |
| 2026-10-06 03:49 | T8 concluída por orch:desenvolvedor · T9 iniciada |
| 2026-10-06 03:52 | T9 concluída por orch:testador · T7 iniciada |

## Resultado final

—
