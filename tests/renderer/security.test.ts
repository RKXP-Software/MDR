// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isAllowedResourceUrl, isHostRelativeUrl, renderMarkdown } from '../../src/renderer/src/markdown'

const dom = (src: string, baseDir?: string): HTMLElement => {
  const d = document.createElement('div')
  d.innerHTML = renderMarkdown(src, { baseDir })
  return d
}

/** Todos os valores de atributo do HTML renderizado, com o nome do atributo. */
const attrs = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll('*')).flatMap((e) => Array.from(e.attributes).map((a) => `${a.name}=${a.value}`))

describe('A1: URLs host-relativas não vazam', () => {
  const payloads = [
    '![](//attacker.com/x.png)',
    '<img src="\\\\attacker\\s\\x.png">',
    '<img src="/\\attacker/x">',
    '<img src="\\/attacker/x">',
    '<img srcset="//evil/a.png 1x">',
    '<img src="x.png" srcset="//evil/a.png 1x, //evil/b.png 2x">',
    '<svg><image href="//evil/x.png"/></svg>',
    '<svg><image xlink:href="//evil/x.png"/></svg>',
    '<picture><source srcset="//evil/x"></picture>',
    '<a href="//evil/x">x</a>',
    '<a href="\\\\evil\\x">x</a>',
    '<img src=" //evil/x">',
    '<img src="\t//evil/x">',
    '<img src="/\t/evil/x">',
    '<img src="\n//evil/x">',
    '<a href=" //evil/x">x</a>',
    '<a href="\t//evil/x">x</a>',
    '<video poster="//evil/p.png"></video>',
    '<table background="//evil/b.png"><tr><td>x</td></tr></table>'
  ]

  it.each(payloads)('%j', (p) => {
    const d = dom(p)
    const all = attrs(d).join('\n')
    expect(all).not.toMatch(/evil|attacker/)
  })

  it.each(['src', 'href', 'srcset', 'xlink:href'])('nenhum elemento mantém %s com host', (name) => {
    const d = dom(payloads.join('\n\n'))
    for (const e of Array.from(d.querySelectorAll('*'))) {
      expect(e.getAttribute(name) ?? '').not.toMatch(/evil|attacker/)
    }
  })

  it('imagem relativa com baseDir UNC fica sem src', () => {
    const img = dom('![x](img/a.png)', '\\\\srv\\share\\docs').querySelector('img')!
    expect(img.hasAttribute('src')).toBe(false)
  })

  it('imagem relativa local vira file:///C:/...', () => {
    const img = dom('![x](img/a.png)', 'C:\\docs\\meu dir').querySelector('img')!
    expect(img.getAttribute('src')).toBe('file:///C:/docs/meu%20dir/img/a.png')
  })

  it('http(s) e data:image são mantidos', () => {
    const d = dom(
      '![a](https://ex.com/a.png)\n\n![b](http://ex.com/b.png)\n\n![c](data:image/png;base64,iVBORw0KGgo=)'
    )
    const srcs = Array.from(d.querySelectorAll('img')).map((i) => i.getAttribute('src'))
    expect(srcs).toEqual(['https://ex.com/a.png', 'http://ex.com/b.png', 'data:image/png;base64,iVBORw0KGgo='])
  })

  it('data:text/html é removido', () => {
    const d = dom('<img src="data:text/html,<script>alert(1)</script>">')
    expect(d.querySelector('img')?.hasAttribute('src') ?? false).toBe(false)
    expect(d.innerHTML).not.toContain('data:text/html')
  })

  it('link http normal continua funcionando', () => {
    const a = dom('[x](https://ex.com/p)').querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://ex.com/p')
    expect(a.getAttribute('target')).toBe('_blank')
  })
})

describe('isHostRelativeUrl', () => {
  it.each(['//h/x', '\\\\h\\x', '/\\h', '\\/h', ' //h', '\t//h', '/\t/h', '\n\\\\h', '\x01//h'])('true: %j', (u) => {
    expect(isHostRelativeUrl(u)).toBe(true)
  })
  it.each(['/x', '\\x', 'a/b', 'a//b', 'https://h/x', '#id', '', 'C:\\x'])('false: %j', (u) => {
    expect(isHostRelativeUrl(u)).toBe(false)
  })
})

describe('isAllowedResourceUrl', () => {
  it.each(['img/a.png', '../a.png', 'https://h/a.png', 'HTTP://h/a.png', 'data:image/png;base64,AA', ' img/a.png'])(
    'true: %j',
    (u) => expect(isAllowedResourceUrl(u)).toBe(true)
  )
  it.each([
    '//h/a.png',
    '\\\\h\\a',
    ' //h/a',
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///C:/x',
    'ftp://h/x',
    'mailto:a@b.c',
    '/abs/path',
    '#id',
    ''
  ])('false: %j', (u) => expect(isAllowedResourceUrl(u)).toBe(false))
})

describe('M4: sem CSS inline', () => {
  it('<style> é removido', () => {
    const h = renderMarkdown('<style>body{background:url(//evil/x)}</style>\n\ntexto')
    expect(h).not.toMatch(/<style|evil|background/i)
    expect(h).toContain('texto')
  })

  it('atributo style é removido', () => {
    const d = dom('<p style="background:url(//evil/x)">oi</p>\n\n<div style="color:red">x</div>')
    expect(d.querySelector('[style]')).toBeNull()
    expect(d.innerHTML).not.toContain('evil')
  })

  it('alinhamento de tabela vira classe align-* sem style', () => {
    const d = dom('| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |')
    expect(d.querySelector('[style]')).toBeNull()
    expect(Array.from(d.querySelectorAll('th')).map((e) => e.className)).toEqual([
      'align-left',
      'align-center',
      'align-right'
    ])
    expect(Array.from(d.querySelectorAll('td')).map((e) => e.className)).toEqual([
      'align-left',
      'align-center',
      'align-right'
    ])
  })

  it('tabela sem alinhamento não ganha classe', () => {
    const d = dom('| a |\n| --- |\n| 1 |')
    expect(d.querySelector('th')!.className).toBe('')
  })
})

describe('B5: links mailto', () => {
  it('recebe target=_blank e rel noopener noreferrer', () => {
    const a = dom('[mail](mailto:a@b.com)').querySelector('a')!
    expect(a.getAttribute('href')).toBe('mailto:a@b.com')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('âncora interna não ganha target', () => {
    const a = dom('[s](#sec)').querySelector('a')!
    expect(a.hasAttribute('target')).toBe(false)
  })
})
