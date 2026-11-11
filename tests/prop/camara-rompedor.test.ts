import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { limitesZoom, zoomInicial } from '../../src/game/camara/config'
import {
  limitarVista,
  medirDedos,
  pasoPellizco,
  transformar,
  type Vista,
} from '../../src/game/camara/matematica'

const MUNDO = 3072
const pantallaArb = fc.record({
  ancho: fc.integer({ min: 1, max: 4000 }),
  alto: fc.integer({ min: 1, max: 4000 }),
})
const puntoArb = fc.record({
  x: fc.double({ min: -5000, max: 9000, noNaN: true }),
  y: fc.double({ min: -5000, max: 9000, noNaN: true }),
})
const factorArb = fc.oneof(
  fc.double({ min: 0, max: 50, noNaN: true }),
  fc.constantFrom(0, Infinity, 1e-300, 1e300),
)
const gestoArb = fc.record({ desde: puntoArb, hasta: puntoArb, factor: factorArb })

function validar(v: Vista, p: { ancho: number; alto: number }, lim: { min: number; max: number }) {
  for (const n of [v.zoom, v.cx, v.cy]) expect(Number.isFinite(n)).toBe(true)
  expect(v.zoom).toBeGreaterThanOrEqual(lim.min - 1e-12)
  expect(v.zoom).toBeLessThanOrEqual(lim.max + 1e-12)
  for (const [c, pant] of [
    [v.cx, p.ancho],
    [v.cy, p.alto],
  ] as const) {
    const vis = pant / v.zoom
    if (vis >= MUNDO) expect(c).toBeCloseTo(MUNDO / 2, 6)
    else {
      expect(c - vis / 2).toBeGreaterThanOrEqual(-1e-6)
      expect(c + vis / 2).toBeLessThanOrEqual(MUNDO + 1e-6)
    }
  }
}

describe('cámara: propiedades', () => {
  it('secuencias aleatorias de gestos: finito, en límites, zoom en [min,max]', () => {
    fc.assert(
      fc.property(pantallaArb, fc.array(gestoArb, { maxLength: 40 }), (p, gestos) => {
        const lim = limitesZoom(p, MUNDO)
        let v: Vista = { zoom: zoomInicial(p, MUNDO), cx: MUNDO / 2, cy: MUNDO / 2 }
        for (const g of gestos) {
          v = transformar(v, p, g.desde, g.hasta, g.factor, lim, MUNDO)
          validar(v, p, lim)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('pellizco con dedos superpuestos (distancia 0) no cambia el zoom a mínimo', () => {
    fc.assert(
      fc.property(pantallaArb, puntoArb, (p, a) => {
        const lim = limitesZoom(p, MUNDO)
        const v: Vista = { zoom: lim.max, cx: MUNDO / 2, cy: MUNDO / 2 }
        const r = pasoPellizco(
          v,
          p,
          medirDedos(a, { x: a.x + 80, y: a.y }),
          medirDedos(a, a),
          lim,
          MUNDO,
        )
        validar(r, p, lim)
        expect(r.zoom).toBe(v.zoom)
      }),
    )
  })

  it('zoom inicial >= 0.6 siempre que el mínimo lo permita', () => {
    fc.assert(
      fc.property(pantallaArb, (p) => {
        const lim = limitesZoom(p, MUNDO)
        expect(zoomInicial(p, MUNDO)).toBeGreaterThanOrEqual(Math.min(0.6, lim.max))
      }),
    )
  })

  it('pantalla de tamaño 0 no produce NaN', () => {
    const p = { ancho: 0, alto: 0 }
    const lim = limitesZoom(p, MUNDO)
    const v = transformar(
      { zoom: 0.6, cx: 100, cy: 100 },
      p,
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      1,
      lim,
      MUNDO,
    )
    expect(Number.isFinite(v.cx) && Number.isFinite(v.cy) && v.zoom > 0).toBe(true)
  })

  it('limitarVista es idempotente', () => {
    fc.assert(
      fc.property(
        pantallaArb,
        puntoArb,
        fc.double({ min: 0.01, max: 2.5, noNaN: true }),
        (p, c, zoom) => {
          const a = limitarVista({ zoom, cx: c.x, cy: c.y }, p, MUNDO)
          const b = limitarVista(a, p, MUNDO)
          expect(b.cx).toBeCloseTo(a.cx, 9)
          expect(b.cy).toBeCloseTo(a.cy, 9)
        },
      ),
    )
  })
})
