/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  buscarCamino,
  casillaBloqueada,
  crearEstadoInicial,
  mapaTransitabilidad,
} from '../../src/core'

const semilla = fc.integer({ min: 0, max: 2 ** 32 - 1 })

describe('buscarCamino (propiedades)', () => {
  it('siempre transitable, conectado y termina en el destino o la casilla libre más cercana', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.double({ min: 0, max: 95.999, noNaN: true }),
        fc.double({ min: 0, max: 95.999, noNaN: true }),
        (s, x, y) => {
          const estado = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          const mapa = mapaTransitabilidad(estado)
          const r = buscarCamino(estado, estado.personaje, { x, y })
          expect(r.length).toBeGreaterThan(0)
          r.forEach((p, i) => {
            expect(casillaBloqueada(mapa, Math.floor(p.x), Math.floor(p.y))).toBe(false)
            if (i === 0) return
            const dx = Math.abs(p.x - r[i - 1]!.x)
            const dy = Math.abs(p.y - r[i - 1]!.y)
            expect(Math.max(dx, dy)).toBe(1)
            if (dx === 1 && dy === 1) {
              const ox = Math.floor(r[i - 1]!.x)
              const oy = Math.floor(r[i - 1]!.y)
              expect(casillaBloqueada(mapa, Math.floor(p.x), oy)).toBe(false)
              expect(casillaBloqueada(mapa, ox, Math.floor(p.y))).toBe(false)
            }
          })
          const cx = Math.floor(x)
          const cy = Math.floor(y)
          const fin = r[r.length - 1]!
          if (!casillaBloqueada(mapa, cx, cy)) {
            expect(fin).toEqual({ x: cx + 0.5, y: cy + 0.5 })
          } else {
            // Ninguna casilla libre está estrictamente más cerca que la elegida.
            const d = Math.hypot(fin.x - x, fin.y - y)
            const lado = mapa.lado
            for (let c = 0; c < lado * lado; c++) {
              if (mapa.bloqueada[c] === 1) continue
              const dc = Math.hypot((c % lado) + 0.5 - x, Math.floor(c / lado) + 0.5 - y)
              if (dc < d - 1e-9) throw new Error(`la casilla ${c} está más cerca`)
            }
          }
        },
      ),
      { numRuns: 15 },
    )
  })

  it('rendimiento: el peor caso del valle de 96x96 tarda menos de 5 ms', () => {
    const estado = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const mapa = mapaTransitabilidad(estado)
    const p = (c: number) => ({ x: (c % mapa.lado) + 0.5, y: Math.floor(c / mapa.lado) + 0.5 })
    // Muchos destinos libres repartidos por todo el valle (incluido el otro lado del río,
    // lejos de los vados) desde la aparición y desde la esquina opuesta; se toma el peor caso.
    const origenes = [estado.personaje, p(mapa.bloqueada.lastIndexOf(0))]
    buscarCamino(estado, origenes[0]!, p(0)) // calentar
    let peor = 0
    for (const origen of origenes) {
      for (let c = 0; c < mapa.bloqueada.length; c += 61) {
        if (mapa.bloqueada[c] === 1) continue
        let mejor = Infinity
        for (let i = 0; i < 3; i++) {
          const t0 = performance.now()
          buscarCamino(estado, origen, p(c))
          mejor = Math.min(mejor, performance.now() - t0)
        }
        peor = Math.max(peor, mejor)
      }
    }
    expect(peor).toBeLessThan(5)
  })
})
