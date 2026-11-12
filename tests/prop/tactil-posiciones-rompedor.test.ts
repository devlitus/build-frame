/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, buscarCamino, crearEstadoInicial } from '../../src/core'
import { SeguidorCamino } from '../../src/game/seguirCamino'

/** M2-04 rompedor: tocar un destino tras andar con el joystick (posición arbitraria). */

const semilla = fc.integer({ min: 0, max: 2 ** 32 - 1 })

describe('tras andar con el joystick (posición arbitraria junto a obstáculos)', () => {
  it('desde donde acabe el personaje, la ruta A* llega sin darse por atascada', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.array(
          fc.record({
            dx: fc.double({ min: -1, max: 1, noNaN: true }),
            dy: fc.double({ min: -1, max: 1, noNaN: true }),
            ms: fc.integer({ min: 1, max: 600 }),
          }),
          { minLength: 5, maxLength: 60 },
        ),
        fc.integer({ min: 0, max: 95 }),
        fc.integer({ min: 0, max: 95 }),
        (s, pasos, cx, cy) => {
          let e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          for (const p of pasos) {
            e = aplicarComando(e, { tipo: 'MoverPersonaje', ...p }).estado
          }
          const meta = { x: cx + 0.5, y: cy + 0.5 }
          const ruta = buscarCamino(e, e.personaje, meta)
          if (ruta.length === 0) return
          const seg = new SeguidorCamino()
          seg.fijar(e, e.personaje, meta)
          let n = 0
          while (seg.destino && n < 20_000) {
            n++
            const c = seg.siguiente(e.personaje, 16)
            if (c) e = aplicarComando(e, c).estado
          }
          const fin = ruta[ruta.length - 1]!
          expect(Math.hypot(e.personaje.x - fin.x, e.personaje.y - fin.y)).toBeLessThan(0.05)
        },
      ),
      { numRuns: 150 },
    )
  })

  it('20 destinos seguidos (peor caso) se calculan en menos de 150 ms en total', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const s = new SeguidorCamino()
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) s.fijar(e, e.personaje, { x: 95.5 - i * 0.1, y: 95.5 })
    expect(performance.now() - t0).toBeLessThan(150)
  })
})
