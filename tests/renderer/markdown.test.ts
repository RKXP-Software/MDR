// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  countWords,
  dirname,
  isMarkdownPath,
  isRelativeUrl,
  renderMarkdown,
  resolveRelative,
  slugify,
  toFileUrl
} from '../../src/renderer/src/markdown'

const html = (src: string, baseDir?: string): string => renderMarkdown(src, { baseDir })
const dom = (src: string, baseDir?: string): HTMLElement => {
  const d = document.createElement('div')
  d.innerHTML = html(src, baseDir)
  return d
}

describe('renderMarkdown - GFM', () => {
  it('tabelas', () => {
    const d = dom('| a | b |\n|---|---|\n| 1 | 2 |\n')
    expect(d.querySelectorAll('table th')).toHaveLength(2)
    expect(d.querySelector('td')?.textContent).toBe('1')
  })
  it('task list desabilitada', () => {
    const d = dom('- [x] feito\n- [ ] falta\n')
    const boxes = d.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect(boxes).toHaveLength(2)
    expect(boxes[0].checked).toBe(true)
    expect(boxes[1].checked).toBe(false)
    boxes.forEach((b) => expect(b.disabled).toBe(true))
  })
  it('tachado', () => {
    expect(html('~~x~~')).toMatch(/<s>x<\/s>/)
  })
  it('linkify de URL solta', () => {
    expect(dom('veja https://example.com ok').querySelector('a')?.getAttribute('href')).toBe('https://example.com')
  })
  it('string vazia', () => expect(html('')).toBe(''))
})

describe('renderMarkdown - código', () => {
  it('destaca linguagem conhecida com classe hljs', () => {
    const out = html('```js\nconst a = 1\n```')
    expect(out).toContain('hljs-keyword')
    expect(dom('```js\nconst a = 1\n```').querySelector('code')?.className).toMatch(/language-js/)
  })
  it('linguagem desconhecida: escapa sem quebrar', () => {
    const out = html('```zzz\n<b>&</b>\n```')
    expect(out).toContain('&lt;b&gt;&amp;&lt;/b&gt;')
    expect(out).not.toContain('<b>')
  })
  it('sem linguagem: escapa', () => {
    expect(html('```\n<i>x</i>\n```')).toContain('&lt;i&gt;')
  })
})

describe('renderMarkdown - sanitização', () => {
  it('remove script', () => {
    const out = html('a\n\n<script>alert(1)</script>\n\nb')
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toContain('alert(1)')
  })
  it('remove atributos on*', () => {
    const out = html('<img src="x.png" onerror="alert(1)" onclick="x()">')
    expect(out).not.toMatch(/onerror|onclick/i)
    expect(html('<p onmouseover="x()">t</p>')).not.toMatch(/onmouseover/i)
  })
  it('remove javascript: em href', () => {
    const out = html('[x](javascript:alert(1))\n\n<a href="javascript:alert(2)">y</a>')
    const d = document.createElement('div')
    d.innerHTML = out
    expect(d.querySelectorAll('a[href]')).toHaveLength(0)
    expect(dom('[x](javascript:alert(1))').querySelector('a')).toBeNull()
  })
  it.each(['iframe', 'object', 'embed'])('remove %s', (tag) => {
    const out = html(`<${tag} src="https://evil.com"></${tag}>`)
    expect(out).not.toMatch(new RegExp(`<${tag}`, 'i'))
  })
  it('remove form/meta/link/base', () => {
    const out = html(
      '<form action="x"><input></form><meta http-equiv="refresh" content="0"><base href="x"><link rel="stylesheet" href="x">'
    )
    expect(out).not.toMatch(/<(form|meta|base|link)\b/i)
  })
  it('mantém HTML seguro', () => {
    expect(html('<b>x</b>')).toContain('<b>x</b>')
  })
})

describe('renderMarkdown - links', () => {
  it('https abre em nova aba com rel seguro', () => {
    const a = dom('[s](https://example.com)').querySelector('a')!
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })
  it('http também', () => {
    expect(dom('[s](http://example.com)').querySelector('a')?.getAttribute('target')).toBe('_blank')
  })
  it('âncora e relativo sem target', () => {
    expect(dom('[s](#x)').querySelector('a')?.hasAttribute('target')).toBe(false)
    expect(dom('[s](outro.md)').querySelector('a')?.hasAttribute('target')).toBe(false)
  })
  it('remove target forjado em link não-http', () => {
    expect(dom('<a href="#x" target="_blank">s</a>').querySelector('a')?.hasAttribute('target')).toBe(false)
  })
  it('força rel seguro mesmo se autor definir rel', () => {
    const a = dom('<a href="https://e.com" rel="opener">s</a>').querySelector('a')!
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })
})

describe('renderMarkdown - imagens', () => {
  const base = 'C:\\Meus Docs\\notas'
  it('relativa vira file:/// com baseDir Windows e espaços codificados', () => {
    const src = dom('![a](img/foto%201.png)', base).querySelector('img')!.getAttribute('src')
    expect(src).toBe('file:///C:/Meus%20Docs/notas/img/foto%201.png')
  })
  it('../ resolve relativo ao diretório', () => {
    expect(dom('![a](../x.png)', base).querySelector('img')?.getAttribute('src')).toBe(
      'file:///C:/Meus%20Docs/x.png'
    )
  })
  it('sem baseDir mantém relativa', () => {
    expect(dom('![a](img/x.png)').querySelector('img')?.getAttribute('src')).toBe('img/x.png')
  })
  it('http(s) e data mantidos', () => {
    expect(dom('![a](https://e.com/a.png)', base).querySelector('img')?.getAttribute('src')).toBe(
      'https://e.com/a.png'
    )
    expect(dom('![a](http://e.com/a.png)', base).querySelector('img')?.getAttribute('src')).toBe(
      'http://e.com/a.png'
    )
    const data = 'data:image/png;base64,iVBORw0KGgo='
    expect(dom(`![a](${data})`, base).querySelector('img')?.getAttribute('src')).toBe(data)
  })
})

describe('renderMarkdown - ids e data-line', () => {
  it('ids estilo GitHub e duplicados numerados', () => {
    const d = dom('# Olá Mundo!\n\n## Olá Mundo!\n\n### Outro\n')
    const ids = [...d.querySelectorAll('h1,h2,h3')].map((h) => h.id)
    expect(ids).toEqual(['olá-mundo', 'olá-mundo-1', 'outro'])
  })
  it('título só com símbolos não recebe id', () => {
    expect(dom('# !!!').querySelector('h1')?.hasAttribute('id')).toBe(false)
  })
  it('data-line nos blocos de nível 0 (base 0)', () => {
    const d = dom('# T\n\npar\n\n- a\n- b\n\n```\nx\n```\n')
    const lines = [...d.querySelectorAll('[data-line]')].map((e) => `${e.tagName}:${e.getAttribute('data-line')}`)
    expect(lines).toContain('H1:0')
    expect(lines).toContain('P:2')
    expect(lines).toContain('UL:4')
    expect(lines).toContain('CODE:7')
  })
})

describe('renderMarkdown - janela', () => {
  it('usa opts.window quando informado', () => {
    expect(renderMarkdown('**x**', { window })).toContain('<strong>x</strong>')
  })
})

describe('toFileUrl', () => {
  it('unidade Windows', () => expect(toFileUrl('C:\\a b\\c.md')).toBe('file:///C:/a%20b/c.md'))
  it('isDir garante barra final', () => {
    expect(toFileUrl('C:\\a', true)).toBe('file:///C:/a/')
    expect(toFileUrl('C:\\a\\', true)).toBe('file:///C:/a/')
  })
  it('UNC', () => expect(toFileUrl('\\\\srv\\share\\x')).toBe('file://srv/share/x'))
  it('POSIX', () => expect(toFileUrl('/home/u/a b')).toBe('file:///home/u/a%20b'))
  it('codifica ? e #', () => expect(toFileUrl('C:\\a#b?c')).toBe('file:///C:/a%23b%3Fc'))
  it('acentos', () => expect(toFileUrl('C:\\ação')).toBe('file:///C:/a%C3%A7%C3%A3o'))
})

describe('dirname', () => {
  it('Windows e POSIX', () => {
    expect(dirname('C:\\a\\b\\c.md')).toBe('C:\\a\\b')
    expect(dirname('/a/b/c.md')).toBe('/a/b')
  })
  it('mantém a raiz', () => {
    expect(dirname('C:\\x.md')).toBe('C:\\')
    expect(dirname('/x.md')).toBe('/')
  })
  it('sem separador -> vazio', () => expect(dirname('x.md')).toBe(''))
})

describe('isRelativeUrl', () => {
  it.each(['img/a.png', '../b.png', './c.png', 'a.png'])('%s é relativa', (u) =>
    expect(isRelativeUrl(u)).toBe(true)
  )
  it.each(['', '#x', '//cdn/x', '/abs', '\\x', 'https://a', 'data:image/png;base64,AA', 'mailto:a@b', 'C:/x'])(
    '%j não é relativa',
    (u) => expect(isRelativeUrl(u)).toBe(false)
  )
})

describe('resolveRelative', () => {
  it('resolve contra diretório Windows', () => {
    expect(resolveRelative('a/b.png', 'C:\\d e')).toBe('file:///C:/d%20e/a/b.png')
    expect(resolveRelative('../b.png', 'C:\\d\\e')).toBe('file:///C:/d/b.png')
  })
  it('apara espaços', () => expect(resolveRelative('  a.png ', 'C:\\d')).toBe('file:///C:/d/a.png'))
})

describe('isMarkdownPath (renderer)', () => {
  it.each(['a.md', 'A.MARKDOWN', 'a.mdown', 'a.mkd', 'a.mkdn', 'a.mdwn', 'a.mdtxt', 'a.mdtext'])('aceita %s', (p) =>
    expect(isMarkdownPath(p)).toBe(true)
  )
  it.each(['a.txt', 'md', 'a.md.txt', ''])('rejeita %j', (p) => expect(isMarkdownPath(p)).toBe(false))
})

describe('countWords', () => {
  it('conta', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\t')).toBe(0)
    expect(countWords('um dois\ntrês  quatro')).toBe(4)
  })
})

describe('slugify', () => {
  it('casos', () => {
    expect(slugify('Hello World')).toBe('hello-world')
    expect(slugify('  Olá, Mundo!  ')).toBe('olá-mundo')
    expect(slugify('a_b-c 2')).toBe('a_b-c-2')
    expect(slugify('???')).toBe('')
  })
})
