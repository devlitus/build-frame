/** Rompedor · M1-04. Propiedades de la rejilla de trozos. */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { rejillaTrozos } from '../../src/game/valle/trozos'

describe('rejillaTrozos (propiedades)', () => {
  it('cubre el mundo exactamente: sin solapes ni huecos, en enteros', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6000 }),
        fc.integer({ min: 1, max: 2048 }),
        (m, tam) => {
          if (Math.ceil(m / tam) > 80) return true
          const t = rejillaTrozos(m, tam)
          const celdas = new Set<string>()
          let area = 0
          for (const z of t) {
            expect([z.x, z.y, z.ancho, z.alto].every(Number.isInteger)).toBe(true)
            expect(z.ancho).toBeGreaterThan(0)
            expect(z.alto).toBeGreaterThan(0)
            expect(z.ancho).toBeLessThanOrEqual(tam)
            expect(z.x + z.ancho).toBeLessThanOrEqual(m)
            expect(z.y + z.alto).toBeLessThanOrEqual(m)
            area += z.ancho * z.alto
            celdas.add(`${z.columna},${z.fila}`)
          }
          expect(celdas.size).toBe(t.length)
          expect(area).toBe(m * m)
          return true
        },
      ),
      { numRuns: 300 },
    )
  })

  it('rechaza 0, negativos, NaN e Infinity', () => {
    for (const m of [0, -1, -1024, NaN, Infinity, -Infinity, 0.5]) {
      expect(() => rejillaTrozos(m)).toThrow(RangeError)
    }
    for (const t of [0, -1, NaN, Infinity]) expect(() => rejillaTrozos(10, t)).toThrow(RangeError)
  })
})
