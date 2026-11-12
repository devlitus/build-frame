import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CONFIG_TIEMPO } from '../../src/core'
import { leerParametros, minutoDeHora } from '../../src/game/parametros'
import { luzDelMinuto } from '../../src/game/valle/luz'

/** M2-06 · Rompedor del HUD, la luz y los parámetros de depuración. */

describe('hora= de depuración', () => {
  it.each(['25:00', '30:00', '-1', 'abc', '', '24:00', '12:60', '6:0', '22:00:00'])(
    '%j se ignora',
    (t) => expect(minutoDeHora(t)).toBeUndefined(),
  )
  // La jornada va de 06:00 a 02:00 (360..1560). 02:01-05:59 queda fuera: el reloj mostraría una
  // hora en la que el juego nunca está y el primer avance provocaría un desmayo inmediato.
  it.each(['02:01', '03:00', '05:59'])('%s (fuera de la jornada) debería ignorarse', (t) => {
    expect(minutoDeHora(t)).toBeUndefined()
  })
  it('todo minuto aceptado cae dentro de la jornada', () => {
    for (let h = 0; h < 24; h++)
      for (let m = 0; m < 60; m++) {
        const r = minutoDeHora(`${h}:${String(m).padStart(2, '0')}`)
        if (r !== undefined) {
          expect(r, `${h}:${m}`).toBeGreaterThanOrEqual(CONFIG_TIEMPO.horaInicio)
          expect(r, `${h}:${m}`).toBeLessThanOrEqual(CONFIG_TIEMPO.horaFin)
        }
      }
  })
  it('sin debug, hora y acelerar se ignoran', () => {
    const p = leerParametros('?hora=22:00&acelerar=100')
    expect(p.hora).toBeUndefined()
    expect(p.acelerar).toBeUndefined()
  })
  it('acelerar se acota a 2000 y 0 o negativos se ignoran', () => {
    expect(leerParametros('?debug&acelerar=99999').acelerar).toBe(2000)
    expect(leerParametros('?debug&acelerar=0').acelerar).toBeUndefined()
    expect(leerParametros('?debug&acelerar=-5').acelerar).toBeUndefined()
  })
})

describe('luzDelMinuto', () => {
  it('alfa en [0,1] y color válido para cualquier entrada', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double({ noNaN: false }), fc.integer({ min: -5000, max: 9000 })),
        (m) => {
          const l = luzDelMinuto(m)
          expect(l.alfa).toBeGreaterThanOrEqual(0)
          expect(l.alfa).toBeLessThanOrEqual(1)
          expect(Number.isInteger(l.color)).toBe(true)
          expect(l.color).toBeGreaterThanOrEqual(0)
          expect(l.color).toBeLessThanOrEqual(0xffffff)
        },
      ),
    )
  })
  it('es continua: minutos consecutivos no saltan más de 0,01 de alfa', () => {
    for (let m = 360; m < 1560; m++) {
      expect(Math.abs(luzDelMinuto(m).alfa - luzDelMinuto(m + 1).alfa)).toBeLessThan(0.01)
    }
  })
  it('periódica: m y m+1440 dan lo mismo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1439 }), (m) => {
        expect(luzDelMinuto(m)).toEqual(luzDelMinuto(m + 1440))
      }),
    )
  })
})
