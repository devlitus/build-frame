import { describe, expect, it } from 'vitest'
import {
  CONFIG_PERSONAJE,
  CONFIG_TIEMPO,
  crearEstadoInicial,
  type EstadoJuego,
} from '../../src/core'
import { Partida } from '../../src/game/partida'
import { AcumuladorTiempo, acotarDelta, comandosMovimiento } from '../../src/game/bucle'

/** Valle sin obstáculos ni río, personaje en el centro: zona despejada para medir velocidad. */
function despejado(): EstadoJuego {
  const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
  return {
    ...e,
    obstaculos: [],
    cauce: { ...e.cauce, ancho: 0 },
    personaje: { x: 10.5, y: 10.5, orientacion: 'sur' },
  }
}

/** Simula `segundos` reales con fotogramas de `ms` (como EscenaValle.update). */
function simular(ms: number, segundos: number, dx = 1, dy = 0) {
  const p = new Partida(despejado())
  const t = new AcumuladorTiempo()
  const x0 = p.estado.personaje.x
  const y0 = p.estado.personaje.y
  const m0 = p.estado.minutoDelDia
  const n = Math.round((segundos * 1000) / ms)
  for (let i = 0; i < n; i++) {
    const d = acotarDelta(ms)
    for (const c of comandosMovimiento({ dx, dy }, d)) p.emitir(c)
    const min = t.acumular(d, p.estado.velocidad, p.estado.pausado)
    if (min > 0) p.emitir({ tipo: 'AvanzarTiempo', minutos: min })
  }
  const e = p.estado
  return { dist: Math.hypot(e.personaje.x - x0, e.personaje.y - y0), minutos: e.minutoDelDia - m0 }
}

describe('rompedor M2-03: velocidad y reloj en el bucle', () => {
  it.each([60, 144, 30])('a %i fps el personaje avanza ~4 casillas/s', (fps) => {
    const { dist } = simular(1000 / fps, 1)
    expect(dist).toBeGreaterThan(CONFIG_PERSONAJE.velocidadCasillasPorSegundo * 0.99)
    expect(dist).toBeLessThan(CONFIG_PERSONAJE.velocidadCasillasPorSegundo * 1.01)
  })

  it('la diagonal no es más rápida que la recta', () => {
    const { dist } = simular(1000 / 60, 1, 1, 1)
    expect(dist).toBeLessThan(4.04)
    expect(dist).toBeGreaterThan(3.96)
  })

  it('a 60 fps el reloj cuadra con un día de ~15 min reales (1200 min de juego)', () => {
    const { minutos } = simular(1000 / 60, 60, 0, 0)
    const esperado = (CONFIG_TIEMPO.horaFin - CONFIG_TIEMPO.horaInicio) / (15 * 60)
    expect(minutos).toBeGreaterThanOrEqual(Math.floor(esperado * 60) - 1)
    expect(minutos).toBeLessThanOrEqual(Math.ceil(esperado * 60))
  })

  it('a fps muy bajos (5 fps) el delta acotado pierde movimiento: documentado, no fallo', () => {
    const { dist } = simular(200, 1)
    // Por diseño: 200 ms se acotan a 100 -> mitad de distancia.
    expect(dist).toBeCloseTo(2, 1)
  })
})
