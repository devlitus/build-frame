/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, buscarCamino, crearEstadoInicial, type EstadoJuego } from '../../src/core'
import { SeguidorCamino } from '../../src/game/seguirCamino'

/** M2-04 rompedor: el seguimiento simulado con la colisión real del núcleo. */

const semilla = fc.integer({ min: 0, max: 2 ** 32 - 1 })

function simular(
  estado0: EstadoJuego,
  hasta: { x: number; y: number },
  delta: number,
): EstadoJuego {
  let estado = estado0
  const s = new SeguidorCamino()
  s.fijar(estado, estado.personaje, hasta)
  let n = 0
  while (s.destino && n < 20_000) {
    n++
    const c = s.siguiente(estado.personaje, delta)
    if (c) estado = aplicarComando(estado, c).estado
  }
  return estado
}

describe('seguimiento de la ruta con colisiones reales (propiedades)', () => {
  it('llega al centro de la casilla destino desde la aparición, con delta de 8 a 100 ms', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.integer({ min: 0, max: 95 }),
        fc.integer({ min: 0, max: 95 }),
        fc.constantFrom(8, 16, 33, 100),
        (s, cx, cy, delta) => {
          const e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          const ruta = buscarCamino(e, e.personaje, { x: cx + 0.5, y: cy + 0.5 })
          if (ruta.length === 0) return
          const fin = ruta[ruta.length - 1]!
          const p = simular(e, { x: cx + 0.5, y: cy + 0.5 }, delta).personaje
          expect(Math.hypot(p.x - fin.x, p.y - fin.y)).toBeLessThan(0.05)
        },
      ),
      { numRuns: 60 },
    )
  })

  it('desde posiciones no centradas dentro de la casilla también llega', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 95 }),
        fc.integer({ min: 0, max: 95 }),
        (s, fx, fy, cx, cy) => {
          const e0 = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          const cx0 = Math.floor(e0.personaje.x)
          const cy0 = Math.floor(e0.personaje.y)
          const e = {
            ...e0,
            personaje: { ...e0.personaje, x: cx0 + 0.3 + fx * 0.4, y: cy0 + 0.3 + fy * 0.4 },
          }
          const ruta = buscarCamino(e, e.personaje, { x: cx + 0.5, y: cy + 0.5 })
          if (ruta.length === 0) return
          const p = simular(e, { x: cx + 0.5, y: cy + 0.5 }, 16).personaje
          const fin = ruta[ruta.length - 1]!
          expect(Math.hypot(p.x - fin.x, p.y - fin.y)).toBeLessThan(0.05)
        },
      ),
      { numRuns: 60 },
    )
  })
})
