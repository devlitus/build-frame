import { describe, expect, it } from 'vitest'
import { leerParametros } from '../../src/game/parametros'

describe('parámetros ?en y ?contador', () => {
  it('?en=vado sigue valiendo y ?en=x,y da una casilla', () => {
    expect(leerParametros('?debug&en=vado').en).toBe('vado')
    expect(leerParametros('?debug&en=3,12').en).toEqual({ x: 3, y: 12 })
    expect(leerParametros('?debug&en= 0,0 ').en).toEqual({ x: 0, y: 0 })
  })

  it('?en solo vale con ?debug y se ignora lo inválido', () => {
    expect(leerParametros('?en=3,12').en).toBeUndefined()
    for (const malo of ['3', '3,', ',4', '-1,2', '1.5,2', 'a,b', '1,2,3', '']) {
      expect(leerParametros(`?debug&en=${malo}`).en, malo).toBeUndefined()
    }
  })

  it('?contador=0 quita el contador solo con ?debug', () => {
    expect(leerParametros('?debug').contador).toBeUndefined()
    expect(leerParametros('?debug&contador=0').contador).toBe(false)
    expect(leerParametros('?debug&contador=1').contador).toBeUndefined()
    expect(leerParametros('?contador=0').contador).toBeUndefined()
  })
})
