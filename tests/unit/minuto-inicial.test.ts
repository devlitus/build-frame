import { describe, expect, it } from 'vitest'
import { CONFIG_TIEMPO, crearEstadoInicial } from '../../src/core'

describe('crearEstadoInicial · minutoInicial', () => {
  it('por defecto empieza a las 06:00', () => {
    expect(crearEstadoInicial({ semilla: 1, dineroInicial: 0 }).minutoDelDia).toBe(
      CONFIG_TIEMPO.horaInicio,
    )
  })
  it.each([CONFIG_TIEMPO.horaInicio, 1320, CONFIG_TIEMPO.horaFin])('acepta %i', (m) => {
    expect(
      crearEstadoInicial({ semilla: 1, dineroInicial: 0, minutoInicial: m }).minutoDelDia,
    ).toBe(m)
  })
  it.each([0, 359, 1561, 1800, -1, 400.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza %s (fuera de la jornada)',
    (m) => {
      expect(() => crearEstadoInicial({ semilla: 1, dineroInicial: 0, minutoInicial: m })).toThrow(
        RangeError,
      )
    },
  )
})
