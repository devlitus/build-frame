/** Rompedor · M1-04. Valores raros de ?debug. */
import { describe, expect, it } from 'vitest'
import { leerParametros } from '../../src/game/parametros'

describe('?debug con valores raros', () => {
  it('debug=0 y debug=false lo desactivan', () => {
    expect(leerParametros('?debug=0').debug).toBe(false)
    expect(leerParametros('?debug=false').debug).toBe(false)
  })
  it('debug sin valor y debug=1 lo activan', () => {
    expect(leerParametros('?debug').debug).toBe(true)
    expect(leerParametros('?debug=1').debug).toBe(true)
  })
  it('debug=FALSE / False / off / no lo desactivan (insensible a mayúsculas)', () => {
    for (const v of ['FALSE', 'False', 'off', 'no'])
      expect(leerParametros(`?debug=${v}`).debug, v).toBe(false)
  })
  it('?DEBUG en mayúsculas no es un parámetro conocido', () => {
    expect(leerParametros('?DEBUG').debug).toBe(false)
  })
})
