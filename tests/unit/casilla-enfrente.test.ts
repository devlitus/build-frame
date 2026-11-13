import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  casillaDeEnfrente,
  crearEstadoInicial,
  type Orientacion,
} from '../../src/core'

describe('casilla de enfrente (M5-00, para las herramientas de M5-01)', () => {
  it.each<[Orientacion, number, number]>([
    ['norte', 10, 9],
    ['sur', 10, 11],
    ['este', 11, 10],
    ['oeste', 9, 10],
  ])('mirando al %s desde la casilla (10, 10) da (%i, %i)', (orientacion, x, y) => {
    expect(casillaDeEnfrente({ x: 10.7, y: 10.2, orientacion })).toEqual({ x, y })
  })

  it('usa la casilla que ocupa el centro del personaje, también en el borde de la casilla', () => {
    expect(casillaDeEnfrente({ x: 10, y: 10, orientacion: 'este' })).toEqual({ x: 11, y: 10 })
    expect(casillaDeEnfrente({ x: 9.999, y: 10, orientacion: 'este' })).toEqual({ x: 10, y: 10 })
  })

  it('la dirección es la del último movimiento y se conserva al pararse', () => {
    let e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const mover = (dx: number, dy: number, ms: number): void => {
      const r = aplicarComando(e, { tipo: 'MoverPersonaje', dx, dy, ms })
      if (!r.ok) throw new Error(r.error)
      e = r.estado
    }
    mover(0, -1, 50)
    expect(e.personaje.orientacion).toBe('norte')
    const mira = casillaDeEnfrente(e.personaje)
    // Sin intención (0, 0) el personaje no cambia: sigue mirando hacia el norte.
    mover(0, 0, 100)
    expect(e.personaje.orientacion).toBe('norte')
    expect(casillaDeEnfrente(e.personaje)).toEqual(mira)
    expect(mira.y).toBe(Math.floor(e.personaje.y) - 1)
  })
})
