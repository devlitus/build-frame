/** Rompedor · pasada global de M2: simulación del núcleo con todos los comandos juntos. */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  CONFIG_PERSONAJE,
  CONFIG_TIEMPO,
  MODOS_JUEGO,
  aplicarComando,
  buscarCamino,
  casillaBloqueada,
  crearEstadoInicial,
  mapaTransitabilidad,
  tiempoDetenido,
  type Comando,
  type EstadoJuego,
} from '../../src/core'

const cmd = fc.oneof(
  fc.record({
    tipo: fc.constant('AvanzarTiempo' as const),
    minutos: fc.integer({ min: 0, max: 3000 }),
  }),
  fc.record({
    tipo: fc.constant('MoverPersonaje' as const),
    dx: fc.constantFrom(-1, -0.5, 0, 0.3, 1),
    dy: fc.constantFrom(-1, -0.5, 0, 0.3, 1),
    ms: fc.integer({ min: 0, max: 400 }),
  }),
  fc.constant({ tipo: 'Pausar' as const }),
  fc.constant({ tipo: 'Reanudar' as const }),
  fc.record({
    tipo: fc.constant('CambiarVelocidad' as const),
    velocidad: fc.constantFrom(...CONFIG_TIEMPO.velocidades),
  }),
  fc.record({ tipo: fc.constant('CambiarModo' as const), modo: fc.constantFrom(...MODOS_JUEGO) }),
  // Ruido: comandos inválidos que deben rechazarse sin romper nada.
  fc.constant({ tipo: 'CambiarModo', modo: 'volar' } as unknown as Comando),
  fc.constant({ tipo: 'AvanzarTiempo', minutos: 1.5 } as unknown as Comando),
  fc.constant({ tipo: 'MoverPersonaje', dx: 2, dy: 0, ms: 10 } as unknown as Comando),
)

function validar(e: EstadoJuego, aparicion: { x: number; y: number }): void {
  expect(e.minutoDelDia).toBeGreaterThanOrEqual(CONFIG_TIEMPO.horaInicio)
  expect(e.minutoDelDia).toBeLessThanOrEqual(CONFIG_TIEMPO.horaFin)
  expect(Number.isInteger(e.minutoDelDia)).toBe(true)
  expect(Number.isSafeInteger(e.dia) && e.dia >= 1).toBe(true)
  expect(MODOS_JUEGO).toContain(e.modo)
  expect(typeof e.pausado).toBe('boolean')
  expect(CONFIG_TIEMPO.velocidades).toContain(e.velocidad)
  const m = mapaTransitabilidad(e)
  const h = CONFIG_PERSONAJE.tamanoCaja / 2
  const { x, y } = e.personaje
  for (const [cx, cy] of [
    [x - h, y - h],
    [x + h, y - h],
    [x - h, y + h],
    [x + h, y + h],
  ] as const) {
    expect(casillaBloqueada(m, Math.floor(cx), Math.floor(cy)), `caja en bloqueo (${x},${y})`).toBe(
      false,
    )
  }
  expect(aparicion.x).toBeGreaterThan(0)
}

describe('M2 global: simulación de varios días con todos los comandos', () => {
  it('el estado siempre es válido y el desmayo coloca al personaje en la aparición', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.array(cmd, { minLength: 50, maxLength: 250 }),
        (semilla, comandos) => {
          let e = crearEstadoInicial({ semilla, dineroInicial: 0 })
          const ap = e.aparicion
          for (const c of comandos) {
            const antes = e
            const r = aplicarComando(e, c)
            e = r.estado
            validar(e, ap)
            expect(e.dia).toBeGreaterThanOrEqual(antes.dia)
            expect(e.dia - antes.dia).toBeLessThanOrEqual(1)
            const desmayo = r.ok && r.eventos.some((ev) => ev.tipo === 'desmayo')
            expect(desmayo).toBe(e.dia === antes.dia + 1)
            if (desmayo) {
              expect(e.minutoDelDia).toBe(CONFIG_TIEMPO.horaInicio)
              expect(e.personaje.x).toBe(ap.x)
              expect(e.personaje.y).toBe(ap.y)
              // Nunca con el tiempo detenido.
              expect(tiempoDetenido(antes)).toBe(false)
            }
            // Detenido: ni reloj ni personaje se mueven.
            if (c.tipo === 'AvanzarTiempo' || c.tipo === 'MoverPersonaje') {
              if (tiempoDetenido(antes) && r.ok) expect(e).toBe(antes)
            }
            // La pausa solo la tocan Pausar/Reanudar; el modo solo CambiarModo.
            if (c.tipo !== 'Pausar' && c.tipo !== 'Reanudar') expect(e.pausado).toBe(antes.pausado)
            if (c.tipo !== 'CambiarModo') expect(e.modo).toBe(antes.modo)
          }
        },
      ),
      { numRuns: 60 },
    )
  })

  it('misma semilla + mismos comandos => mismo estado (JSON idéntico), sin mutar la entrada', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.array(cmd, { maxLength: 200 }),
        (semilla, comandos) => {
          const a0 = crearEstadoInicial({ semilla, dineroInicial: 0 })
          const congelado = JSON.stringify(a0)
          const correr = (e0: EstadoJuego) =>
            comandos.reduce((e, c) => aplicarComando(e, c).estado, e0)
          const a = correr(a0)
          const b = correr(crearEstadoInicial({ semilla, dineroInicial: 0 }))
          expect(JSON.stringify(a)).toBe(JSON.stringify(b))
          expect(JSON.stringify(a0)).toBe(congelado)
          expect(JSON.parse(JSON.stringify(a))).toStrictEqual(a)
        },
      ),
      { numRuns: 40 },
    )
  })

  it('seguir una ruta de buscarCamino con MoverPersonaje, con desmayos y pausas en medio, nunca invalida el estado', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.integer({ min: 0, max: 95 }),
        fc.integer({ min: 0, max: 95 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 4 }),
        (semilla, tx, ty, pausasEn) => {
          let e = crearEstadoInicial({ semilla, dineroInicial: 0, minutoInicial: 1555 })
          const ruta = buscarCamino(e, e.personaje, { x: tx + 0.5, y: ty + 0.5 })
          expect(ruta.length).toBeGreaterThan(0)
          let paso = 0
          for (const p of ruta) {
            for (let i = 0; i < 60; i++) {
              const dx = p.x - e.personaje.x
              const dy = p.y - e.personaje.y
              const d = Math.hypot(dx, dy)
              if (d < 0.02) break
              e = aplicarComando(e, {
                tipo: 'MoverPersonaje',
                dx: dx / d,
                dy: dy / d,
                ms: 50,
              }).estado
              if (paso % 37 === 0)
                e = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: 2 }).estado
              if (pausasEn.includes(paso % 7))
                e = aplicarComando(e, { tipo: e.pausado ? 'Reanudar' : 'Pausar' }).estado
              paso++
              validar(e, e.aparicion)
            }
          }
        },
      ),
      { numRuns: 25 },
    )
  })

  it('pausar en Plano y volver a Vida conserva la pausa del jugador; Reanudar en Plano no arranca el reloj', () => {
    let e = crearEstadoInicial({ semilla: 7, dineroInicial: 0 })
    const ap = (c: Comando) => (e = aplicarComando(e, c).estado)
    ap({ tipo: 'CambiarModo', modo: 'plano' })
    ap({ tipo: 'Pausar' })
    ap({ tipo: 'CambiarModo', modo: 'vida' })
    expect(e.pausado).toBe(true)
    ap({ tipo: 'AvanzarTiempo', minutos: 10 })
    expect(e.minutoDelDia).toBe(CONFIG_TIEMPO.horaInicio)
    ap({ tipo: 'Reanudar' })
    ap({ tipo: 'CambiarModo', modo: 'plano' })
    ap({ tipo: 'AvanzarTiempo', minutos: 10 })
    expect(e.minutoDelDia).toBe(CONFIG_TIEMPO.horaInicio)
  })
})
