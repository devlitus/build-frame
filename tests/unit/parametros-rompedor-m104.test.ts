/** Rompedor · M1-04. Valores raros de ?debug. */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
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

// E2E-16 · Rompedor: the URL parameters the e2e opened the game with (valle-rompedor «URL rara …:
// portada» and «URL …: abre el valle», seleccion-parcela «?seleccion=N abre el panel (solo con
// debug)» / «sin debug no hay ganchos de selección ni ?seleccion funciona», selección-rompedor
// «con ?propias=14,15…», compra-parcela «con ?debug&dinero=N…», modos «?modo=plano…», personaje
// «con ?debug&en=vado…», tiempo-hud «la hora de la madrugada… 02:00», rendimiento-rompedor
// «?debug=0, ?debug=false y ?DEBUG no crean el contador»). The game starts directly in the valley
// when `semilla` is valid (`arrancaDirecto`), otherwise on the start screen.
describe('URL parameters used by the e2e', () => {
  it.each([
    '?semilla=abc',
    '?semilla=',
    '?semilla=-3',
    '?semilla=1.5',
    '?semilla=99999999999999999999',
    '?debug&propias=1',
  ])('%s has no valid seed: start screen', (q) => {
    expect(leerParametros(q).semilla).toBeUndefined()
  })

  it.each([
    ['?semilla=0', 0],
    ['?semilla=4294967295', 4294967295],
    ['?semilla=1&semilla=2', 1],
    ['?semilla=5&debug&propias=0,99,x,-1,5,5', 5],
  ])('%s opens the valley with seed %i', (q, semilla) => {
    expect(leerParametros(q).semilla).toBe(semilla)
  })

  it('?propias keeps unique non-negative integers, only with debug (out of range is ignored later)', () => {
    expect(leerParametros('?semilla=5&debug&propias=0,99,x,-1,5,5').propias).toEqual([0, 99, 5])
    expect(leerParametros('?semilla=42&debug&propias=14,15').propias).toEqual([14, 15])
    expect(leerParametros('?semilla=42&propias=14,15').propias).toEqual([])
  })

  it('?seleccion only with debug; ?modo=plano also without it', () => {
    expect(leerParametros('?semilla=42&debug&modo=plano&seleccion=14').seleccion).toBe(14)
    expect(leerParametros('?semilla=42&modo=plano&seleccion=14').seleccion).toBeUndefined()
    expect(leerParametros('?semilla=42&modo=plano').modo).toBe('plano')
    expect(leerParametros('?semilla=42&modo=PLANO').modo).toBe('plano')
    expect(leerParametros('?semilla=42&modo=vida').modo).toBeUndefined()
  })

  it('?en=vado, ?hora, ?acelerar, ?dinero and ?aviso only with debug', () => {
    const con = leerParametros(
      '?semilla=42&debug&en=vado&hora=02:00&acelerar=100&dinero=0&aviso=300',
    )
    expect(con).toMatchObject({ en: 'vado', hora: 1560, acelerar: 100, dinero: 0, aviso: 300 })
    const sin = leerParametros('?semilla=42&en=vado&hora=02:00&acelerar=100&dinero=0&aviso=300')
    for (const k of ['en', 'hora', 'acelerar', 'dinero', 'aviso'] as const)
      expect(sin[k], k).toBeUndefined()
    expect(leerParametros('?debug&hora=01:59').hora).toBe(1559)
  })

  it('?debug=0, ?debug=false and ?DEBUG do not enable debug (no fps counter, no hooks)', () => {
    for (const q of ['?debug=0', '?debug=false', '?DEBUG'])
      expect(leerParametros(q).debug, q).toBe(false)
  })

  it('property: any query string is parsed without throwing and gives sane values', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (q) => {
        const p = leerParametros(q)
        expect(typeof p.debug).toBe('boolean')
        if (p.semilla !== undefined) {
          expect(Number.isInteger(p.semilla)).toBe(true)
          expect(p.semilla).toBeGreaterThanOrEqual(0)
          expect(p.semilla).toBeLessThanOrEqual(0xffffffff)
        }
        for (const n of p.propias) expect(Number.isSafeInteger(n) && n >= 0).toBe(true)
        if (!p.debug) expect(p.propias).toEqual([])
      }),
      { numRuns: 500 },
    )
  })
})
