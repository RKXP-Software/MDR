// Gera build/icon.ico e build/icon.png a partir de build/icon.svg.
// Rasteriza com resvg (sem dependência de fontes ou do sistema gráfico).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const buildDir = fileURLToPath(new URL('../build/', import.meta.url))
const svg = readFileSync(buildDir + 'icon.svg')

const png = (size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

const tamanhos = [16, 24, 32, 48, 64, 128, 256]
const imagens = tamanhos.map((t) => ({ t, dados: png(t) }))

// ICO: cabeçalho (6) + diretório (16 por entrada) + imagens PNG embutidas
const cab = Buffer.alloc(6)
cab.writeUInt16LE(1, 2) // tipo: ícone
cab.writeUInt16LE(imagens.length, 4)
let deslocamento = 6 + 16 * imagens.length
const dir = imagens.map(({ t, dados }) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(t >= 256 ? 0 : t, 0) // 0 significa 256
  e.writeUInt8(t >= 256 ? 0 : t, 1)
  e.writeUInt16LE(1, 4) // planos
  e.writeUInt16LE(32, 6) // bits por pixel
  e.writeUInt32LE(dados.length, 8)
  e.writeUInt32LE(deslocamento, 12)
  deslocamento += dados.length
  return e
})
writeFileSync(buildDir + 'icon.ico', Buffer.concat([cab, ...dir, ...imagens.map((i) => i.dados)]))
writeFileSync(buildDir + 'icon.png', png(512))
console.log(`Gerado: icon.ico (${tamanhos.join('/')}) e icon.png (512)`)
