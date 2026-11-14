import { describe, expect, it } from 'vitest'
import { ACELERAR_MAXIMO, leerParametros, minutoDeHora } from '../../src/game/parametros'

const h = (horas: number, min = 0) => horas * 60 + min

describe('parámetros de depuración del tiempo', () => {
  it('acelerar y hora solo valen con ?debug', () => {
    expect(leerParametros('?acelerar=200&hora=22:00')).toMatchObject({ debug: false })
    expect(leerParametros('?acelerar=200&hora=22:00').acelerar).toBeUndefined()
    expect(leerParametros('?acelerar=200&hora=22:00').hora).toBeUndefined()
    const p = leerParametros('?debug&acelerar=200&hora=22:00')
    expect(p.acelerar).toBe(200)
    expect(p.hora).toBe(h(22))
  })

  it('ignora lo inválido y acota el máximo', () => {
    expect(leerParametros('?debug&acelerar=0').acelerar).toBeUndefined()
    expect(leerParametros('?debug&acelerar=abc').acelerar).toBeUndefined()
    expect(leerParametros('?debug&acelerar=99999').acelerar).toBe(ACELERAR_MAXIMO)
    expect(leerParametros('?debug&hora=25:00').hora).toBeUndefined()
    expect(leerParametros('?debug&hora=03:00').hora).toBeUndefined()
    expect(leerParametros('?debug&hora=10:75').hora).toBeUndefined()
  })

  it('la madrugada hasta las 02:00 cuenta como 24:00-26:00', () => {
    expect(minutoDeHora('02:00')).toBe(h(26))
    expect(minutoDeHora('06:00')).toBe(h(6))
    expect(minutoDeHora(null)).toBeUndefined()
  })
})

describe('parámetro de depuración del aviso', () => {
  it('?aviso solo vale con ?debug y se acota', () => {
    expect(leerParametros('?aviso=300').aviso).toBeUndefined()
    expect(leerParametros('?debug&aviso=300').aviso).toBe(300)
    expect(leerParametros('?debug&aviso=0').aviso).toBeUndefined()
    expect(leerParametros('?debug&aviso=abc').aviso).toBeUndefined()
    expect(leerParametros('?debug&aviso=999999').aviso).toBe(60_000)
  })
})
