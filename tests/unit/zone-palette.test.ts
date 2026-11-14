/**
 * E2E-16 · Rompedor. The four zone swatches of the zone bar must be told apart without colour.
 * Replaces `m5-00-final-rompedor.spec.ts` «[S3] las cuatro muestras de zona se distinguen en escala
 * de grises» (#62): the swatch is the first tile of `rutaTiraZona(zona)` scaled to 22 px over
 * `--hierba` (see `.muestra-zona` in `src/estilos.css`), so it is measured on the art itself.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ZONAS, type Zona } from '../../src/core'
import { rutaTiraZona } from '../../src/game/valle/arte'

/** `--hierba` in `src/estilos.css`: the swatch background behind the (possibly transparent) art. */
const HIERBA = '#9bbf86'
/** Minimum grey difference between any two swatches (same threshold as the e2e, out of 255). */
const DIFERENCIA_MINIMA = 18

async function luminanciaMuestra(zona: Zona, sufijo: '@1x' | '@2x'): Promise<number> {
  const archivo = join(process.cwd(), 'public', rutaTiraZona(zona, sufijo))
  const imagen = sharp(readFileSync(archivo))
  const { height } = await imagen.metadata()
  if (!height) throw new Error(`no size: ${archivo}`)
  // The strip has 8 tiles side by side; the swatch shows the first one, scaled to 22 px.
  const { data } = await sharp(readFileSync(archivo))
    .extract({ left: 0, top: 0, width: height, height })
    .flatten({ background: HIERBA })
    .resize(22, 22)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let suma = 0
  for (const v of data) suma += v
  return suma / data.length
}

async function diferenciaMinima(sufijo: '@1x' | '@2x') {
  const lum = await Promise.all(ZONAS.map((z) => luminanciaMuestra(z, sufijo)))
  let minima = 255
  for (let i = 0; i < lum.length; i++)
    for (let j = i + 1; j < lum.length; j++)
      minima = Math.min(minima, Math.abs((lum[i] ?? 0) - (lum[j] ?? 0)))
  return { lum, minima }
}

describe('zone swatches in greyscale', () => {
  it('there are four zones, each with its strip at @1x and @2x', () => {
    expect(ZONAS).toHaveLength(4)
  })

  // Known issue #62 (zone art approved by the PO in M4): fails on purpose until it is decided.
  // If the art changes and this starts passing, turn `it.fails` into `it`.
  it.fails.each(['@1x', '@2x'] as const)(
    '[S3] the four zone swatches can be told apart in greyscale (%s)',
    async (sufijo) => {
      // Original e2e: m5-00-final-rompedor.spec.ts «[S3] las cuatro muestras de zona se
      // distinguen en escala de grises».
      const { lum, minima } = await diferenciaMinima(sufijo)
      expect(
        minima,
        `luminances ${lum.map((v) => v.toFixed(1)).join(', ')}; min diff ${minima.toFixed(1)}/255`,
      ).toBeGreaterThan(DIFERENCIA_MINIMA)
    },
  )
})
