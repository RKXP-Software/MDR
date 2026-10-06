import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MARKDOWN_EXTENSIONS } from '@shared/api'
import {
  decodeText,
  decodeWindows1252,
  detectEol,
  encodeText,
  encodeWindows1252,
  findUnencodable,
  isMarkdownPath,
  isRemoteFileUrl,
  isUncPath,
  readTextFile,
  tempPathFor,
  writeTextFile,
  type TextFormat
} from '../../src/main/files'
import { isMarkdownPath as rendererIsMarkdownPath } from '../../src/renderer/src/markdown'

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b)
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('decodeText', () => {
  it('UTF-8 válido', () => {
    expect(decodeText(utf8('olá ção'))).toEqual({ text: 'olá ção', encoding: 'utf-8', bom: false, eol: 'lf' })
  })

  it('UTF-8 com BOM: bom true e texto sem BOM', () => {
    const r = decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('oi')]))
    expect(r).toMatchObject({ text: 'oi', encoding: 'utf-8', bom: true })
    expect(r.text.charCodeAt(0)).not.toBe(0xfeff)
  })

  it('bytes inválidos em UTF-8 caem em windows-1252', () => {
    const r = decodeText(bytes(0x61, 0xe7, 0xe3, 0x6f))
    expect(r).toMatchObject({ text: 'ação', encoding: 'windows-1252', bom: false })
  })

  it('1252: 0x80 vira euro e 0x93/0x94 viram aspas curvas', () => {
    expect(decodeText(bytes(0x80)).text).toBe('€')
    expect(decodeText(bytes(0x93, 0x61, 0x94)).text).toBe('\u201ca\u201d')
  })

  it('BOM seguido de bytes inválidos: 1252 e bom false', () => {
    const r = decodeText(bytes(0xef, 0xbb, 0xbf, 0xe7))
    expect(r.encoding).toBe('windows-1252')
    expect(r.bom).toBe(false)
  })

  it('buffer vazio', () => {
    expect(decodeText(new Uint8Array())).toEqual({ text: '', encoding: 'utf-8', bom: false, eol: 'lf' })
  })

  it('eol: crlf detectado e texto devolvido só com \\n', () => {
    const r = decodeText(utf8('a\r\nb\r\nc'))
    expect(r.eol).toBe('crlf')
    expect(r.text).toBe('a\nb\nc')
  })

  it('eol: lf', () => {
    expect(decodeText(utf8('a\nb')).eol).toBe('lf')
  })

  it('eol: maioria decide e o texto fica normalizado', () => {
    const r = decodeText(utf8('a\r\nb\r\nc\nd'))
    expect(r.eol).toBe('crlf')
    expect(r.text).toBe('a\nb\nc\nd')
    expect(decodeText(utf8('a\nb\nc\r\nd')).eol).toBe('lf')
  })

  it('eol: empate decide pela primeira quebra', () => {
    expect(decodeText(utf8('a\r\nb\nc')).eol).toBe('crlf')
    expect(decodeText(utf8('a\nb\r\nc')).eol).toBe('lf')
  })
})

describe('detectEol', () => {
  it('sem quebras: lf', () => expect(detectEol('abc')).toBe('lf'))
  it('\\n inicial conta como lf', () => expect(detectEol('\nabc\r\n')).toBe('lf'))
  it('maioria crlf', () => expect(detectEol('a\r\nb\r\nc\n')).toBe('crlf'))
})

describe('windows-1252', () => {
  it('decodeWindows1252 / encodeWindows1252 básicos', () => {
    expect(decodeWindows1252(bytes(0x61, 0xe7, 0x80))).toBe('aç€')
    expect(Array.from(encodeWindows1252('aç€'))).toEqual([0x61, 0xe7, 0x80])
  })

  it('encodeWindows1252 lança para caractere não representável', () => {
    expect(() => encodeWindows1252('日')).toThrow()
  })

  it('round-trip dos 256 bytes', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    const text = decodeWindows1252(all)
    expect(text).toHaveLength(256)
    expect(Array.from(encodeWindows1252(text))).toEqual(Array.from(all))
  })

  it('decodeWindows1252 lida com buffer grande (> 0x2000)', () => {
    const big = new Uint8Array(0x2000 * 2 + 5).fill(0x41)
    expect(decodeWindows1252(big)).toBe('A'.repeat(big.length))
  })

  it('findUnencodable', () => {
    expect(findUnencodable('abc 日 x', 'windows-1252')).toBe('日')
    expect(findUnencodable('ação €', 'windows-1252')).toBeNull()
    expect(findUnencodable('日 😀', 'utf-8')).toBeNull()
  })
})

describe('encodeText', () => {
  const fmt = (o: Partial<TextFormat>): TextFormat => ({ encoding: 'utf-8', bom: false, eol: 'lf', ...o })

  it('reaplica CRLF', () => {
    expect(encodeText('a\nb', fmt({ eol: 'crlf' })).toString('utf8')).toBe('a\r\nb')
  })

  it('não duplica \\r já existente', () => {
    expect(encodeText('a\r\nb', fmt({ eol: 'crlf' })).toString('utf8')).toBe('a\r\nb')
  })

  it('recoloca BOM', () => {
    expect(Array.from(encodeText('a', fmt({ bom: true })))).toEqual([0xef, 0xbb, 0xbf, 0x61])
  })

  it('codifica em 1252 e ignora bom', () => {
    expect(Array.from(encodeText('ação', fmt({ encoding: 'windows-1252', bom: true })))).toEqual([
      0x61, 0xe7, 0xe3, 0x6f
    ])
  })

  it('lança para caractere não representável em 1252', () => {
    expect(() => encodeText('日', fmt({ encoding: 'windows-1252' }))).toThrow()
  })

  it('round-trip dos 256 bytes em 1252', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    const d = decodeText(all)
    // 0x00..0x7F e todos os bytes: pode haver UTF-8 válido? 0x80 isolado é inválido => 1252.
    expect(d.encoding).toBe('windows-1252')
    expect(Array.from(encodeText(d.text, d))).toEqual(Array.from(all))
  })

  it('round-trip UTF-8 + BOM + CRLF', () => {
    const src = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('título\r\nlinha 😀\r\nfim\r\n')])
    const d = decodeText(src)
    expect(d).toMatchObject({ encoding: 'utf-8', bom: true, eol: 'crlf' })
    expect(Array.from(encodeText(d.text, d))).toEqual(Array.from(src))
  })
})

describe('isUncPath', () => {
  it.each(['\\\\srv\\share', '//srv/share', '\\\\?\\UNC\\srv\\share', '\\\\?\\C:\\x', '\\/srv'])('true: %s', (p) => {
    expect(isUncPath(p)).toBe(true)
  })
  it.each(['C:\\x', '/home/x', 'rel/x', '\\x', ''])('false: %j', (p) => {
    expect(isUncPath(p)).toBe(false)
  })
})

describe('isRemoteFileUrl', () => {
  it('file://host/x é remoto', () => {
    expect(isRemoteFileUrl('file://host/x')).toBe(true)
    expect(isRemoteFileUrl('FILE://srv/share/a.md')).toBe(true)
  })
  it('file:///C:/x é local', () => {
    expect(isRemoteFileUrl('file:///C:/x')).toBe(false)
  })
  it('outros esquemas não são file remoto', () => {
    expect(isRemoteFileUrl('https://host/x')).toBe(false)
    expect(isRemoteFileUrl('')).toBe(false)
  })
})

describe('tempPathFor', () => {
  it('mesmo diretório, nome oculto com pid', () => {
    const t = tempPathFor(join('/d', 'sub', 'a.md'), 42)
    expect(dirname(t)).toBe(join('/d', 'sub'))
    expect(t.endsWith('.a.md.42.tmp')).toBe(true)
  })
  it('usa process.pid por padrão', () => {
    expect(tempPathFor(join('/d', 'a.md'))).toContain(`.a.md.${process.pid}.tmp`)
  })
})

describe('MARKDOWN_EXTENSIONS / isMarkdownPath (main x renderer)', () => {
  it('são 8 extensões', () => expect(MARKDOWN_EXTENSIONS).toHaveLength(8))

  it.each([...MARKDOWN_EXTENSIONS])('ambos aceitam .%s (case-insensitive)', (ext) => {
    for (const e of [ext, ext.toUpperCase()]) {
      expect(isMarkdownPath(`doc.${e}`)).toBe(true)
      expect(rendererIsMarkdownPath(`doc.${e}`)).toBe(true)
    }
  })

  it('concordam entre si', () => {
    const cases = ['a.md', 'a.MD', 'a.txt', 'a', 'a.md.bak', 'C:\\d\\a.mkd', 'x/y.MdText', 'a.mdx', 'a.', '', 'dir.md/file']
    for (const c of cases) expect(rendererIsMarkdownPath(c), c).toBe(isMarkdownPath(c))
  })
})

describe('I/O de texto (os.tmpdir)', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mdr-enc-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writeTextFile grava conteúdo e não deixa .tmp', async () => {
    const p = join(dir, 'a.md')
    await writeTextFile(p, 'olá\nmundo')
    expect((await readFile(p)).toString('utf8')).toBe('olá\nmundo')
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('sobrescreve arquivo existente', async () => {
    const p = join(dir, 'b.md')
    await writeFile(p, 'velho')
    await writeTextFile(p, 'novo')
    expect((await readFile(p)).toString('utf8')).toBe('novo')
  })

  it('preserva CRLF + BOM', async () => {
    const p = join(dir, 'c.md')
    await writeTextFile(p, 'a\nb', { encoding: 'utf-8', bom: true, eol: 'crlf' })
    expect(Array.from(await readFile(p))).toEqual([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62])
  })

  it('preserva windows-1252', async () => {
    const p = join(dir, 'd.md')
    await writeTextFile(p, 'ação', { encoding: 'windows-1252', bom: false, eol: 'lf' })
    expect(Array.from(await readFile(p))).toEqual([0x61, 0xe7, 0xe3, 0x6f])
  })

  it('caractere não representável: rejeita, não cria nem altera o arquivo, sem .tmp', async () => {
    const p = join(dir, 'e.md')
    await writeFile(p, 'intacto')
    await expect(writeTextFile(p, '日', { encoding: 'windows-1252', bom: false, eol: 'lf' })).rejects.toThrow()
    expect((await readFile(p)).toString('utf8')).toBe('intacto')
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('diretório inexistente: rejeita e não deixa .tmp', async () => {
    const missing = join(dir, 'nao-existe', 'x.md')
    await expect(writeTextFile(missing, 'x')).rejects.toThrow()
    await expect(access(join(dir, 'nao-existe'))).rejects.toThrow()
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('readTextFile retorna DecodedText e faz round-trip via writeTextFile', async () => {
    const p = join(dir, 'f.md')
    const raw = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x\r\ny\r\n')])
    await writeFile(p, raw)
    const d = await readTextFile(p)
    expect(d).toEqual({ text: 'x\ny\n', encoding: 'utf-8', bom: true, eol: 'crlf' })
    await writeTextFile(p, d.text, d)
    expect(Array.from(await readFile(p))).toEqual(Array.from(raw))
  })

  it('readTextFile em arquivo 1252', async () => {
    const p = join(dir, 'g.md')
    await writeFile(p, Buffer.from([0x61, 0xe7, 0xe3, 0x6f]))
    expect(await readTextFile(p)).toMatchObject({ text: 'ação', encoding: 'windows-1252' })
  })

  it('readTextFile rejeita arquivo inexistente', async () => {
    await expect(readTextFile(join(dir, 'nada.md'))).rejects.toThrow()
  })
})
