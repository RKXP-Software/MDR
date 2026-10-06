import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  displayName,
  ensureMdExtension,
  findMarkdownArg,
  isAllowedExternalUrl,
  isExistingFile,
  isMarkdownPath,
  isThemeSource,
  readMarkdownFile,
  stripBom,
  windowTitle,
  writeTextFile
} from '../../src/main/files'

describe('isMarkdownPath', () => {
  it.each(['a.md', 'a.MD', 'a.markdown', 'x/y.mdown', 'C:\\d\\a.mkd'])('aceita %s', (p) => {
    expect(isMarkdownPath(p)).toBe(true)
  })
  it.each(['a.txt', 'a', 'a.md.bak', '.md', 'a.mdx', ''])('rejeita %j', (p) => {
    expect(isMarkdownPath(p)).toBe(false)
  })
})

describe('stripBom', () => {
  it('remove BOM inicial', () => expect(stripBom('\uFEFFolá')).toBe('olá'))
  it('mantém texto sem BOM e string vazia', () => {
    expect(stripBom('olá')).toBe('olá')
    expect(stripBom('')).toBe('')
  })
  it('só remove no início', () => expect(stripBom('a\uFEFF')).toBe('a\uFEFF'))
})

describe('ensureMdExtension', () => {
  it('acrescenta .md sem extensão', () => expect(ensureMdExtension('nota')).toBe('nota.md'))
  it('mantém qualquer extensão existente', () => {
    expect(ensureMdExtension('nota.txt')).toBe('nota.txt')
    expect(ensureMdExtension('nota.md')).toBe('nota.md')
  })
})

describe('displayName / windowTitle', () => {
  it('basename do path', () => expect(displayName(join('a', 'b', 'c.md'))).toBe('c.md'))
  it('Sem título sem path', () => {
    expect(displayName(null)).toBe('Sem título')
    expect(displayName('')).toBe('Sem título')
  })
  it('título limpo e sujo', () => {
    expect(windowTitle(join('x', 'doc.md'), false)).toBe('doc.md — MDR')
    expect(windowTitle(join('x', 'doc.md'), true)).toBe('• doc.md — MDR')
  })
  it('título sem path', () => {
    expect(windowTitle(null, false)).toBe('Sem título — MDR')
    expect(windowTitle(null, true)).toBe('• Sem título — MDR')
  })
})

describe('findMarkdownArg', () => {
  const cwd = resolve('/proj')
  const all = (): boolean => true
  it('retorna null para lista vazia', () => expect(findMarkdownArg([], cwd, all)).toBeNull())
  it('ignora flags e vazios', () => {
    expect(findMarkdownArg(['--inspect', '-x', '', 'a.md'], cwd, all)).toBe(resolve(cwd, 'a.md'))
  })
  it('resolve relativo a partir de cwd e mantém absoluto', () => {
    const abs = resolve('/outro/b.md')
    expect(findMarkdownArg(['a.md'], cwd, all)).toBe(resolve(cwd, 'a.md'))
    expect(findMarkdownArg([abs], cwd, all)).toBe(abs)
  })
  it('ignora não-markdown e inexistentes', () => {
    const exists = (p: string): boolean => p.endsWith('ok.md')
    expect(findMarkdownArg(['a.txt', 'nao.md', 'ok.md'], cwd, exists)).toBe(resolve(cwd, 'ok.md'))
    expect(findMarkdownArg(['a.txt', 'nao.md'], cwd, exists)).toBeNull()
  })
  it('retorna o primeiro válido', () => {
    expect(findMarkdownArg(['1.md', '2.md'], cwd, all)).toBe(resolve(cwd, '1.md'))
  })
})

describe('isThemeSource', () => {
  it.each(['system', 'light', 'dark'])('aceita %s', (v) => expect(isThemeSource(v)).toBe(true))
  it.each(['Dark', '', null, undefined, 1, {}])('rejeita %j', (v) => expect(isThemeSource(v)).toBe(false))
})

describe('isAllowedExternalUrl', () => {
  const p = ['http:', 'https:']
  it('aceita http/https', () => {
    expect(isAllowedExternalUrl('https://a.com/x?y=1', p)).toBe(true)
    expect(isAllowedExternalUrl('http://a.com', p)).toBe(true)
  })
  it('rejeita outros protocolos e inválidas', () => {
    expect(isAllowedExternalUrl('javascript:alert(1)', p)).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/a', p)).toBe(false)
    expect(isAllowedExternalUrl('não é url', p)).toBe(false)
    expect(isAllowedExternalUrl('', p)).toBe(false)
  })
  it('respeita a lista informada', () => {
    expect(isAllowedExternalUrl('mailto:a@b.c', ['mailto:'])).toBe(true)
    expect(isAllowedExternalUrl('https://a.com', [])).toBe(false)
  })
})

describe('I/O em diretório temporário', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdr-test-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lê UTF-8 com acentos', async () => {
    const f = join(dir, 'a.md')
    await writeFile(f, 'ação — coração ✓', 'utf8')
    expect(await readMarkdownFile(f)).toBe('ação — coração ✓')
  })
  it('remove BOM ao ler', async () => {
    const f = join(dir, 'bom.md')
    await writeFile(f, '\uFEFF# Título', 'utf8')
    expect(await readMarkdownFile(f)).toBe('# Título')
  })
  it('escreve UTF-8 sem BOM e faz round-trip', async () => {
    const f = join(dir, 'w.md')
    await writeTextFile(f, 'Olá, mundo — ñ')
    const buf = await readFile(f)
    expect(buf[0]).not.toBe(0xef)
    expect(buf.toString('utf8')).toBe('Olá, mundo — ñ')
    expect(await readMarkdownFile(f)).toBe('Olá, mundo — ñ')
  })
  it('sobrescreve conteúdo existente', async () => {
    const f = join(dir, 'o.md')
    await writeTextFile(f, 'longo longo longo')
    await writeTextFile(f, 'curto')
    expect(await readMarkdownFile(f)).toBe('curto')
  })
  it('lança em arquivo inexistente', async () => {
    await expect(readMarkdownFile(join(dir, 'nao.md'))).rejects.toThrow()
  })
  it('lança ao escrever em diretório inexistente', async () => {
    await expect(writeTextFile(join(dir, 'x', 'y.md'), 'a')).rejects.toThrow()
  })
  it('isExistingFile distingue arquivo, diretório e inexistente', async () => {
    const f = join(dir, 'e.md')
    await writeTextFile(f, '')
    expect(isExistingFile(f)).toBe(true)
    expect(isExistingFile(dir)).toBe(false)
    expect(isExistingFile(join(dir, 'zz.md'))).toBe(false)
  })
  it('findMarkdownArg usa o padrão real de existência', async () => {
    await writeTextFile(join(dir, 'real.md'), '')
    expect(findMarkdownArg(['real.md', 'x.md'], dir)).toBe(join(dir, 'real.md'))
    expect(findMarkdownArg(['x.md'], dir)).toBeNull()
  })
})
