import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, crearEstadoInicial, tiempoDetenido, type Comando } from '../../src/core'

/** M2-05 · Rompedor: secuencias de pausa y modos sobre el núcleo. */

const comando = fc.oneof(
  fc.constant<Comando>({ tipo: 'Pausar' }),
  fc.constant<Comando>({ tipo: 'Reanudar' }),
  fc.constant<Comando>({ tipo: 'CambiarModo', modo: 'plano' }),
  fc.constant<Comando>({ tipo: 'CambiarModo', modo: 'vida' }),
  fc.integer({ min: 0, max: 400 }).map<Comando>((minutos) => ({ tipo: 'AvanzarTiempo', minutos })),
  fc
    .tuple(
      fc.integer({ min: -1, max: 1 }),
      fc.integer({ min: -1, max: 1 }),
      fc.integer({ min: 0, max: 300 }),
    )
    .map<Comando>(([dx, dy, ms]) => ({ tipo: 'MoverPersonaje', dx, dy, ms })),
)

describe('modos: propiedades', () => {
  it('pausado solo lo cambian Pausar y Reanudar; volver a Vida lo deja como lo dejó el jugador', () => {
    fc.assert(
      fc.property(fc.array(comando, { maxLength: 80 }), (secuencia) => {
        let e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
        let pausaJugador = false
        for (const c of secuencia) {
          const r = aplicarComando(e, c)
          if (!r.ok) continue
          if (c.tipo === 'Pausar') pausaJugador = true
          if (c.tipo === 'Reanudar') pausaJugador = false
          e = r.estado
          expect(e.pausado).toBe(pausaJugador)
          expect(tiempoDetenido(e)).toBe(pausaJugador || e.modo === 'plano')
        }
        const v = aplicarComando(e, { tipo: 'CambiarModo', modo: 'vida' })
        if (!v.ok) throw new Error('rechazado')
        expect(v.estado.pausado).toBe(pausaJugador)
        expect(tiempoDetenido(v.estado)).toBe(pausaJugador)
      }),
      { numRuns: 200 },
    )
  })

  it('en Plano ni el reloj ni el personaje cambian con AvanzarTiempo o Mover', () => {
    fc.assert(
      fc.property(fc.array(comando, { maxLength: 60 }), (secuencia) => {
        let e = crearEstadoInicial({ semilla: 7, dineroInicial: 0 })
        for (const c of secuencia) {
          const r = aplicarComando(e, c)
          if (!r.ok) continue
          if (e.modo === 'plano' && (c.tipo === 'AvanzarTiempo' || c.tipo === 'MoverPersonaje')) {
            expect(r.estado).toBe(e)
          }
          e = r.estado
        }
      }),
      { numRuns: 200 },
    )
  })

  it('CambiarModo rechaza modos inválidos sin tocar el estado', () => {
    const e = crearEstadoInicial({ semilla: 1, dineroInicial: 0 })
    const malos: unknown[] = ['', 'Plano', 'VIDA', 'toString', '__proto__', 0, null, undefined, {}]
    for (const modo of malos) {
      const r = aplicarComando(e, { tipo: 'CambiarModo', modo } as unknown as Comando)
      expect(r.ok, String(modo)).toBe(false)
      expect(r.estado).toBe(e)
    }
  })
})
