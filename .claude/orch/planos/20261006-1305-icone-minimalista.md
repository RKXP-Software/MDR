<!-- orch:plano · id: 20261006-1305-icone-minimalista · status: concluido · criado: 2026-10-06 13:05 · commit-inicial: a72e02c · versao-orch: 0.4.0 -->
# Novo ícone minimalista do MDR

**Demanda original:** Novo icone para a aplicação — Criar um novo icone para a aplicação, entendo que é o app é simples, só serve para ler arquivos .md. Então, crie uma logo minimalista para o .md reader
**Grupo:** — · **Depende dos planos:** —

## Objetivo

O MDR passa a ter uma logo própria e minimalista (SVG fonte em `build/`) e os ícones gerados a partir dela (`build/icon.ico` multi-tamanho e `build/icon.png`), usados pelo instalador/executável e pela janela em modo dev.

## Suposições e decisões

- Hoje não há ícone algum: não existe `build/` (que é o `buildResources` do `electron-builder.yml`), então sai o ícone padrão do Electron. Basta criar `build/icon.ico` para o electron-builder usá-lo no .exe, no instalador NSIS e na associação de arquivos `.md`.
- Conceito visual (padrão assumido, ajustável): quadrado de cantos arredondados em uma cor de destaque sólida, com um glifo branco "M↓" (convenção da Markdown Mark, domínio público) desenhado como **caminhos geométricos** — sem fontes, para renderizar igual em qualquer máquina. Sem gradientes nem detalhes finos: precisa ser legível em 16×16.
- Fonte única: `build/icon.svg`. PNG/ICO são gerados por script versionado (`npm run icon`), não editados à mão. Os binários gerados também são versionados (o `dist` não depende de rodar o script).
- Rasterização via devDependency `@resvg/resvg-js` (sem binário nativo de sistema); o .ico é montado no próprio script (contêiner ICO com entradas PNG: 16, 24, 32, 48, 64, 128, 256). Se o desenvolvedor achar alternativa mais simples sem dependência nova, pode usar, justificando.
- Ícone da janela: em produção no Windows a janela herda o ícone do .exe. Em `npm run dev` só aparece se passar `icon` ao `BrowserWindow`; isso é feito apenas em dev (sem afrouxar nada de segurança em `window.ts`).

## Tarefas

| ID | Tarefa | Executor | Depende de | Arquivos (escrita) | Status |
|---|---|---|---|---|---|
| T1 | Desenhar a logo SVG e criar o gerador de ícones | `orch:desenvolvedor` | — | `build/icon.svg`, `build/icon.ico`, `build/icon.png`, `scripts/gerar-icone.mjs`, `package.json`, `package-lock.json` | concluida |
| T2 | Usar o ícone na janela em modo dev | `orch:desenvolvedor` | T1 | `src/main/window.ts` | concluida |
| T3 | Revisar visual, ICO e verificar typecheck/testes | `orch:revisor` | T1, T2 | — (leitura) | concluida |

Status: `pendente` · `em-andamento` · `concluida` · `falhou` · `pulada`

## Ondas de execução

```
Onda 1: T1
Onda 2: T2            (após T1)
Onda 3: T3            (após T1, T2)
```

Caminho crítico: T1 → T2 → T3. Uma tarefa começa assim que **todas** as suas dependências terminam — não espera a onda inteira.

## Detalhe das tarefas

### T1 — Desenhar a logo SVG e criar o gerador de ícones
- **Executor:** `orch:desenvolvedor`
- **Faz:** cria `build/icon.svg` (viewBox 0 0 256 256; quadrado arredondado em cor sólida + glifo "M↓" em branco feito de paths/retângulos, traços grossos, margem segura ~12%); cria `scripts/gerar-icone.mjs` que rasteriza o SVG em 16/24/32/48/64/128/256 px e grava `build/icon.ico` (entradas PNG) e `build/icon.png` (512 px); adiciona o script `"icon": "node scripts/gerar-icone.mjs"` e a devDependency `@resvg/resvg-js` em `package.json`; roda o script e versiona as saídas. Estilo do código: sem ponto e vírgula, aspas simples, comentários em pt-BR.
- **Pronto quando:** `npm run icon` roda sem erro e regenera os arquivos; `build/icon.ico` contém os 7 tamanhos (cabeçalho ICO válido) e `build/icon.png` é 512×512; o glifo é reconhecível em 16 e 32 px (conferir abrindo os PNGs intermediários ou o 512).
- **Resultado:** criados `build/icon.svg` (quadrado azul + glifo M↓), `scripts/gerar-icone.mjs`, `build/icon.ico` (7 tamanhos) e `build/icon.png` (512). `npm run icon`, typecheck e 263 testes passam.

### T2 — Usar o ícone na janela em modo dev
- **Executor:** `orch:desenvolvedor`
- **Faz:** em `src/main/window.ts`, passa `icon` ao `BrowserWindow` apenas quando o app não está empacotado (`!app.isPackaged`), apontando para `build/icon.png` a partir da raiz do projeto. Não altera `webPreferences`, permissões nem bloqueio de navegação.
- **Pronto quando:** `npm run typecheck` e `npm test` passam; diff de `window.ts` restrito à opção `icon`.
- **Resultado:** `window.ts` passa `icon` (`build/icon.png`) ao `BrowserWindow` só quando `!app.isPackaged`. Typecheck e 263 testes passam.

### T3 — Revisar visual, ICO e verificar typecheck/testes
- **Executor:** `orch:revisor`
- **Faz:** abre `build/icon.png` e confere minimalismo/legibilidade; valida o cabeçalho e os tamanhos do `.ico`; revisa o script (sem caminhos absolutos, idempotente); confirma que `window.ts` não teve segurança afrouxada; roda `npm run typecheck` e `npm test`.
- **Pronto quando:** relatório sem problemas bloqueantes, typecheck e 263+ testes passando.
- **Resultado:** Revisão sem problemas bloqueantes; ICO válido (7 tamanhos), PNG 512, window.ts sem segurança afrouxada; typecheck e 263 testes passam. Menores: cantos da base do M retos (estético).

## Registro de execução

| Quando | Evento |
|---|---|
| 2026-10-06 13:05 | Plano criado |
| 2026-10-06 13:20 | Execução iniciada · T1 em andamento (orch:desenvolvedor) |
| 2026-10-06 13:23 | T1 concluída por orch:desenvolvedor · T2 iniciada |
| 2026-10-06 13:26 | T2 concluída por orch:desenvolvedor · T3 iniciada |
| 2026-10-06 13:29 | T3 concluída por orch:revisor · plano concluído |

## Resultado final

Logo minimalista (quadrado azul + M↓) em `build/icon.svg`, ícones gerados por `npm run icon` (`build/icon.ico`, `build/icon.png`) e ícone da janela em dev. Revisado; typecheck e 263 testes passam.
