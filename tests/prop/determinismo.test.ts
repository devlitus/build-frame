import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComandos,
  crearEstadoInicial,
  siguienteAleatorio,
  type Comando,
} from '../../src/core'

const comando: fc.Arbitrary<Comando> = fc.record({
  tipo: fc.constant('AvanzarTiempo' as const),
  minutos: fc.integer({ min: -10, max: 1440 }),
})

describe('núcleo determinista', () => {
  it('misma semilla + mismos comandos ⇒ mismo estado', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(comando), (semilla, comandos) => {
        const a = aplicarComandos(crearEstadoInicial({ semilla, dineroInicial: 0 }), comandos)
        const b = aplicarComandos(crearEstadoInicial({ semilla, dineroInicial: 0 }), comandos)
        expect(a).toEqual(b)
      }),
    )
  })

  it('el reloj nunca retrocede', () => {
    fc.assert(
      fc.property(fc.array(comando), (comandos) => {
        let estado = crearEstadoInicial({ semilla: 1, dineroInicial: 0 })
        for (const c of comandos) {
          const antes = estado.minutos
          estado = aplicarComandos(estado, [c])
          expect(estado.minutos).toBeGreaterThanOrEqual(antes)
        }
      }),
    )
  })

  it('el RNG devuelve valores en [0, 1) y es reproducible', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (s) => {
        const a = siguienteAleatorio(s)
        expect(a.valor).toBeGreaterThanOrEqual(0)
        expect(a.valor).toBeLessThan(1)
        expect(siguienteAleatorio(s)).toEqual(a)
      }),
    )
  })
})
