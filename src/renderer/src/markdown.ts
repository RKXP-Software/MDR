// Render Markdown -> HTML sanitizado. Módulo puro (sem estado de UI) para ser testável com vitest + jsdom.

import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import createDOMPurify, { type DOMPurify, type WindowLike } from 'dompurify'
import { MARKDOWN_EXTENSIONS } from '@shared/api'

export interface RenderOptions {
  /** Diretório do documento no disco; usado para resolver <img src> relativos para file://. */
  baseDir?: string | null
  /** Window usada pelo DOMPurify. Padrão: `window` global (navegador ou ambiente jsdom). */
  window?: WindowLike
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, lang) {
    const name = lang.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (name && hljs.getLanguage(name)) {
      try {
        return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
      } catch {
        // cai no fallback escapado
      }
    }
    return escapeHtml(code)
  }
}).use(taskLists, { enabled: false })

// Marca blocos de nível 0 com data-line (linha inicial, base 0) para o scroll sincronizado,
// gera ids nos títulos para âncoras '#...' e troca o alinhamento de tabela (style, proibido
// no sanitizador) por classe.
md.core.ruler.push('mdr_meta', (state) => {
  const used = new Map<string, number>()
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.map && t.level === 0 && t.nesting !== -1) t.attrSet('data-line', String(t.map[0]))
    if (t.type === 'th_open' || t.type === 'td_open') {
      const align = /^text-align:(left|center|right)$/.exec(String(t.attrGet('style') ?? ''))?.[1]
      if (align) {
        t.attrs = t.attrs?.filter(([k]) => k !== 'style') ?? null
        t.attrJoin('class', `align-${align}`)
      }
    }
    if (t.type === 'heading_open') {
      const inline = tokens[i + 1]
      const text = inline?.children?.map((c) => c.content).join('') ?? ''
      const base = slugify(text)
      if (!base) continue
      const n = used.get(base) ?? 0
      used.set(base, n + 1)
      t.attrSet('id', n ? `${base}-${n}` : base)
    }
  }
})

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Slug estilo GitHub: minúsculas, sem pontuação, espaços viram '-'. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/**
 * Converte caminho do disco em URL file://.
 * Windows: `C:\a b\c` -> `file:///C:/a%20b/c`; UNC `\\srv\share` -> `file://srv/share`.
 * Com `isDir`, garante a barra final (necessária para resolver relativos).
 */
export function toFileUrl(path: string, isDir = false): string {
  let p = path.replace(/\\/g, '/')
  if (isDir && !p.endsWith('/')) p += '/'
  const enc = (s: string): string => encodeURI(s).replace(/[?#]/g, encodeURIComponent)
  if (p.startsWith('//')) return 'file:' + enc(p)
  if (!p.startsWith('/')) p = '/' + p
  return 'file://' + enc(p)
}

/** Diretório de um caminho (aceita '/' e '\'). '' se não houver separador. */
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (i < 0) return ''
  // Mantém a raiz: 'C:\x.md' -> 'C:\', '/x.md' -> '/'
  if (i === 0 || (i === 2 && path[1] === ':')) return path.slice(0, i + 1)
  return path.slice(0, i)
}

/** true se a URL não tem esquema, não é protocol-relative nem âncora (ex.: 'img/a.png', '../b.png'). */
export function isRelativeUrl(url: string): boolean {
  const u = url.trim()
  if (!u || u.startsWith('#') || u.startsWith('//') || u.startsWith('/') || u.startsWith('\\')) return false
  return !/^[a-z][a-z0-9+.-]*:/i.test(u)
}

/** Resolve uma URL relativa contra o diretório do documento; null se não for possível. */
export function resolveRelative(url: string, baseDir: string): string | null {
  try {
    return new URL(url.trim(), toFileUrl(baseDir, true)).href
  } catch {
    return null
  }
}

const MARKDOWN_PATH_RE = new RegExp(`\\.(${MARKDOWN_EXTENSIONS.join('|')})$`, 'i')

/** Extensões tratadas como Markdown (abrir via arrastar e soltar). */
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_PATH_RE.test(path)
}

/** URL como o navegador a interpreta: sem tab/CR/LF em qualquer posição e sem controles/espaços no início. */
function normalizeUrl(url: string): string {
  return url.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+/, '')
}

/**
 * true para URL relativa ao esquema/host (`//h/x`, `\\h\x`, `/\h`, `\/h`). Numa página file://
 * ela vira `file://h/...`, que no Windows é acesso SMB (vazamento de hash NTLM).
 */
export function isHostRelativeUrl(url: string): boolean {
  return /^[\\/]{2}/.test(normalizeUrl(url))
}

/** URL aceita para recurso carregado sem clique (img, svg image etc.): relativa, http(s) ou data:image/*. */
export function isAllowedResourceUrl(url: string): boolean {
  const u = normalizeUrl(url)
  if (isHostRelativeUrl(u)) return false
  return isRelativeUrl(u) || /^https?:/i.test(u) || /^data:image\//i.test(u)
}

/** true se a URL é file:// com host (UNC). */
function isRemoteFileUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'file:' && u.hostname !== ''
  } catch {
    return false
  }
}

/** Contagem de palavras (sequências separadas por espaço em branco). */
export function countWords(text: string): number {
  const m = text.match(/\S+/g)
  return m ? m.length : 0
}

const FORBID_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'frame',
  'frameset',
  'base',
  'meta',
  'link',
  'form',
  'style'
]
// style: CSS pode carregar URLs (background:url(//host/...)); srcset: candidatos não passam pela checagem de URL.
const FORBID_ATTR = ['style', 'srcset']

/** Atributos com URL. Os de recurso (carregados sem clique) passam por isAllowedResourceUrl. */
const URL_ATTRS = ['src', 'poster', 'background', 'href', 'xlink:href', 'action', 'formaction']
const LINK_ATTRS = new Set(['href', 'xlink:href'])
const LINK_TAGS = new Set(['a', 'area'])

const purifiers = new WeakMap<object, DOMPurify>()
let currentBaseDir: string | null = null

function getPurifier(win: WindowLike): DOMPurify {
  let p = purifiers.get(win)
  if (p) return p
  p = createDOMPurify(win)
  p.addHook('afterSanitizeAttributes', (el) => {
    const tag = el.nodeName.toLowerCase()
    const isLink = LINK_TAGS.has(tag)
    for (const attr of URL_ATTRS) {
      const value = el.getAttribute(attr)
      if (value === null) continue
      if (isHostRelativeUrl(value)) {
        el.removeAttribute(attr)
      } else if (!(isLink && LINK_ATTRS.has(attr))) {
        // Recurso: só relativa, http(s) ou data:image; '#id' interno do SVG também.
        const internal = LINK_ATTRS.has(attr) && value.trim().startsWith('#')
        if (!internal && !isAllowedResourceUrl(value)) el.removeAttribute(attr)
      }
    }
    // Atributos de apresentação do SVG (fill, mask, filter...) também aceitam url(); só url(#id) local.
    for (const { name, value } of Array.from(el.attributes)) {
      if (/url\s*\(\s*['"]?\s*[^'"#\s)]/i.test(value)) el.removeAttribute(name)
    }

    if (tag === 'a') {
      const href = el.getAttribute('href') ?? ''
      if (/^(https?|mailto):/i.test(href)) {
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      } else {
        el.removeAttribute('target')
      }
    } else if (tag === 'img' && currentBaseDir) {
      // Feito depois da sanitização: o DOMPurify não aceita file: na lista padrão de URIs.
      const src = el.getAttribute('src')
      if (src && isRelativeUrl(src)) {
        const abs = resolveRelative(src, currentBaseDir)
        // Documento em caminho de rede: relativas virariam file://host (SMB); não carrega.
        if (abs && !isRemoteFileUrl(abs)) el.setAttribute('src', abs)
        else el.removeAttribute('src')
      }
    }
  })
  purifiers.set(win, p)
  return p
}

/** Renderiza Markdown em HTML sanitizado (sem scripts, handlers on*, javascript:, iframes etc.). */
export function renderMarkdown(src: string, opts: RenderOptions = {}): string {
  const win = opts.window ?? (typeof window !== 'undefined' ? window : undefined)
  if (!win) throw new Error('renderMarkdown: DOM indisponível (passe opts.window)')
  const purifier = getPurifier(win)
  const html = md.render(src)
  currentBaseDir = opts.baseDir || null
  try {
    return purifier.sanitize(html, { FORBID_TAGS, FORBID_ATTR, ADD_ATTR: ['target'] })
  } finally {
    currentBaseDir = null
  }
}
