// Limpia el halo de alfa de árbol y roca (informe arte-m4): la sombra de contacto llegaba cortada
// por los bordes del marco y, sobre la hierba, dibujaba un rectángulo. Los píxeles casi
// transparentes (alfa ≤ 100, que no son el objeto) se desvanecen hacia los bordes laterales e
// inferior del marco y el alfa residual (≤ 3) se pone a 0. Los píxeles opacos no se tocan.
// Uso: node scripts/limpiar-halo-objetos.mjs   (reescribe los .webp de public/assets/objetos)
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const UMBRAL_SOMBRA = 100
const RUIDO = 3
/** Distancia de desvanecido, en px a cada escala (@1x: 5, @2x: 10). */
const FUNDIDO = { '1x': 5, '2x': 10 }

for (const objeto of ['arbol', 'roca']) {
  for (const escala of ['1x', '2x']) {
    const ruta = `public/assets/objetos/${objeto}@${escala}.webp`
    const { data, info } = await sharp(readFileSync(ruta))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const { width: w, height: h } = info
    const L = FUNDIDO[escala]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4 + 3
        const a = data[i]
        if (a === 0) continue
        if (a <= RUIDO) {
          data[i] = 0
          continue
        }
        if (a > UMBRAL_SOMBRA) continue
        const d = Math.min(x, w - 1 - x, h - 1 - y)
        const t = Math.min(1, (d + 0.5) / L)
        data[i] = Math.round(a * t * t * (3 - 2 * t))
      }
    }
    const salida = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer()
    writeFileSync(ruta, salida)
    console.log('limpio', ruta)
  }
}
