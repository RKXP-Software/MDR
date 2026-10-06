import { existsSync, statSync } from 'node:fs'
import { readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { MARKDOWN_EXTENSIONS, type ThemeSource } from '@shared/api'

// Funções puras/de I/O sem dependência do Electron (testáveis com vitest).

export { MARKDOWN_EXTENSIONS }

export const UNTITLED_NAME = 'Sem título'
export const UNTITLED_FILE = 'sem-titulo.md'

/** true se o caminho tem extensão markdown (sem diferenciar maiúsculas). */
export function isMarkdownPath(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase()
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)
}

/** Remove o BOM UTF-8 do início do texto, se houver. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** true para caminho UNC/de dispositivo (`\\srv\share`, `//srv/share`, `\\?\...`). */
export function isUncPath(path: string): boolean {
  return /^[\\/]{2}/.test(path)
}

/** Acrescenta `.md` quando o caminho não tem extensão. */
export function ensureMdExtension(path: string): string {
  return extname(path) === '' ? `${path}.md` : path
}

/** Nome exibido do documento: basename do path ou "Sem título". */
export function displayName(path: string | null): string {
  return path ? basename(path) : UNTITLED_NAME
}

/** Título da janela: "• nome — MDR" quando sujo, "nome — MDR" senão. */
export function windowTitle(path: string | null, dirty: boolean): string {
  return `${dirty ? '• ' : ''}${displayName(path)} — MDR`
}

/** true se o caminho é um arquivo existente (não diretório). */
export function isExistingFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Primeiro argumento de linha de comando que seja arquivo markdown existente.
 * Ignora flags (`-x`, `--x`); relativos são resolvidos a partir de `cwd`.
 */
export function findMarkdownArg(
  args: readonly string[],
  cwd: string,
  exists: (path: string) => boolean = isExistingFile
): string | null {
  for (const arg of args) {
    if (!arg || arg.startsWith('-')) continue
    const full = isAbsolute(arg) ? arg : resolve(cwd, arg)
    if (isMarkdownPath(full) && exists(full)) return full
  }
  return null
}

// ---- Codificação, BOM e fim de linha ----

export type TextEncodingName = 'utf-8' | 'windows-1252'
export type Eol = 'lf' | 'crlf'

/** Formato em disco de um documento, para salvar de volta como foi lido. */
export interface TextFormat {
  encoding: TextEncodingName
  bom: boolean
  eol: Eol
}

export interface DecodedText extends TextFormat {
  /** Texto com quebras CRLF normalizadas para `\n` e sem BOM. */
  text: string
}

/** Documento novo: UTF-8, sem BOM, LF. */
export const DEFAULT_TEXT_FORMAT: Readonly<TextFormat> = { encoding: 'utf-8', bom: false, eol: 'lf' }

// windows-1252 (WHATWG) em 0x80–0x9F; as posições indefinidas (0x81, 0x8D, 0x8F, 0x90, 0x9D)
// mapeiam para o próprio code point C1, então todo byte faz round-trip. O resto é latin1 direto.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178
]
const CP1252_REVERSE = new Map(CP1252_HIGH.map((cp, i) => [cp, 0x80 + i]))

/** Byte windows-1252 de um code point; undefined se não representável. */
function cp1252Byte(cp: number): number | undefined {
  if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) return cp
  return CP1252_REVERSE.get(cp)
}

/** Decodifica bytes windows-1252 (tabela própria, sem depender do ICU do runtime). */
export function decodeWindows1252(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x2000) {
    const codes = Array.from(bytes.subarray(i, i + 0x2000), (b) => (b >= 0x80 && b < 0xa0 ? CP1252_HIGH[b - 0x80]! : b))
    out += String.fromCharCode(...codes)
  }
  return out
}

/** Codifica em windows-1252. Lança se houver caractere não representável (ver findUnencodable). */
export function encodeWindows1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const b = cp1252Byte(text.charCodeAt(i))
    if (b === undefined) throw new Error(`Caractere não representável em windows-1252: ${JSON.stringify(text[i])}`)
    out[i] = b
  }
  return out
}

/** Primeiro caractere que não pode ser gravado na codificação; null se todos podem. */
export function findUnencodable(text: string, encoding: TextEncodingName): string | null {
  if (encoding === 'utf-8') return null
  for (const ch of text) {
    if (cp1252Byte(ch.codePointAt(0)!) === undefined) return ch
  }
  return null
}

/** Fim de linha predominante (empate: o da primeira quebra). Sem quebras: 'lf'. */
export function detectEol(text: string): Eol {
  let crlf = 0
  let lf = 0
  let first: Eol | null = null
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
    const kind: Eol = i > 0 && text[i - 1] === '\r' ? 'crlf' : 'lf'
    if (kind === 'crlf') crlf++
    else lf++
    first ??= kind
  }
  if (crlf !== lf) return crlf > lf ? 'crlf' : 'lf'
  return first ?? 'lf'
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]

/**
 * Decodifica o conteúdo de um arquivo: UTF-8 estrito (com ou sem BOM); se não for UTF-8 válido,
 * windows-1252. Devolve o texto com `\n` e o formato original para salvar de volta.
 */
export function decodeText(buf: Uint8Array): DecodedText {
  const bom = buf.length >= 3 && buf[0] === UTF8_BOM[0] && buf[1] === UTF8_BOM[1] && buf[2] === UTF8_BOM[2]
  let raw: string
  let encoding: TextEncodingName = 'utf-8'
  try {
    raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bom ? buf.subarray(3) : buf)
  } catch {
    raw = decodeWindows1252(buf)
    encoding = 'windows-1252'
  }
  return { text: raw.replace(/\r\n/g, '\n'), encoding, bom: bom && encoding === 'utf-8', eol: detectEol(raw) }
}

/** Codifica texto (com `\n`) no formato dado. Lança se houver caractere não representável. */
export function encodeText(text: string, format: TextFormat): Buffer {
  const body = format.eol === 'crlf' ? text.replace(/\r?\n/g, '\r\n') : text
  const bytes = format.encoding === 'windows-1252' ? encodeWindows1252(body) : new TextEncoder().encode(body)
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return format.bom && format.encoding === 'utf-8' ? Buffer.concat([Buffer.from(UTF8_BOM), data]) : data
}

// ---- I/O ----

/** Lê e decodifica um arquivo texto (ver decodeText). Lança em erro de I/O. */
export async function readTextFile(path: string): Promise<DecodedText> {
  return decodeText(await readFile(path))
}

/** Lê um arquivo texto (UTF-8 ou windows-1252), sem BOM e com `\n`. Lança em erro de I/O. */
export async function readMarkdownFile(path: string): Promise<string> {
  return (await readTextFile(path)).text
}

/** Temporário da escrita atômica: no mesmo diretório do destino (rename não cruza volumes). */
export function tempPathFor(path: string, pid: number = process.pid): string {
  return join(dirname(path), `.${basename(path)}.${pid}.tmp`)
}

/**
 * Escreve atomicamente: grava num temporário no mesmo diretório e renomeia por cima do destino
 * (segue symlink e preserva o modo). Padrão: UTF-8 sem BOM, LF. Lança em erro de I/O ou de codificação.
 */
export async function writeTextFile(
  path: string,
  content: string,
  format: TextFormat = DEFAULT_TEXT_FORMAT
): Promise<void> {
  const data = encodeText(content, format)
  const target = await realpath(path).catch(() => path)
  const mode = await stat(target).then(
    (s) => s.mode & 0o777,
    () => undefined
  )
  const tmp = tempPathFor(target)
  try {
    await writeFile(tmp, data, mode === undefined ? undefined : { mode })
    await renameWithRetry(tmp, target)
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

/** No Windows o rename falha transitoriamente se outro processo (antivírus, indexador) segura o destino. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) throw err
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)))
    }
  }
}

export function isThemeSource(value: unknown): value is ThemeSource {
  return value === 'system' || value === 'light' || value === 'dark'
}

/**
 * true para URL file:// com host (`file://srv/share/x`): no Windows vira acesso SMB e vaza hash NTLM.
 * URLs inválidas com esquema file também são recusadas.
 */
export function isRemoteFileUrl(url: string): boolean {
  if (!/^file:/i.test(url)) return false
  try {
    return new URL(url).hostname !== ''
  } catch {
    return true
  }
}

/** true se a URL usa um dos protocolos permitidos (ex.: ['http:', 'https:']). */
export function isAllowedExternalUrl(url: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(url).protocol)
  } catch {
    return false
  }
}
