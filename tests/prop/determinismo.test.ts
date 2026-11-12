import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComandos,
  CONFIG_TIEMPO,
  crearEstadoInicial,
  siguienteAleatorio,
  type Comando,
} from '../../src/core'

const comando: fc.Arbitrary<Comando> = fc.oneof(
  fc.record({
    tipo: fc.constant('AvanzarTiempo' as const),
    minutos: fc.integer({ min: -10, max: 1440 }),
  }),
  fc.constant({ tipo: 'Pausar' as const }),
  fc.constant({ tipo: 'Reanudar' as const }),
  fc.record({
    tipo: fc.constant('CambiarVelocidad' as const),
    velocidad: fc.integer({ min: 0, max: 4 }),
  }),
)

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

  it('el reloj nunca retrocede dentro del día ni sale de [06:00, 02:00]; el día nunca retrocede', () => {
    fc.assert(
      fc.property(fc.array(comando), (comandos) => {
        let estado = crearEstadoInicial({ semilla: 1, dineroInicial: 0 })
        for (const c of comandos) {
          const antes = estado
          estado = aplicarComandos(estado, [c])
          expect(estado.dia).toBeGreaterThanOrEqual(antes.dia)
          expect(estado.minutoDelDia).toBeGreaterThanOrEqual(CONFIG_TIEMPO.horaInicio)
          expect(estado.minutoDelDia).toBeLessThanOrEqual(CONFIG_TIEMPO.horaFin)
          if (estado.dia === antes.dia) {
            expect(estado.minutoDelDia).toBeGreaterThanOrEqual(antes.minutoDelDia)
          }
        }
      }),
    )
  })

  it('nunca avanza más de un día por comando', () => {
    fc.assert(
      fc.property(fc.array(comando), (comandos) => {
        let estado = crearEstadoInicial({ semilla: 1, dineroInicial: 0 })
        for (const c of comandos) {
          const antes = estado
          estado = aplicarComandos(estado, [c])
          expect(estado.dia - antes.dia).toBeLessThanOrEqual(1)
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
