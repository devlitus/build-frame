import { describe, expect, it } from 'vitest'
import { crearEstadoInicial } from '../../src/core'
import { luzDelMinuto } from '../../src/game/valle/luz'
import { tamanoMundoPx } from '../../src/game/valle/dibujar'
import { PROFUNDIDAD_TINTE, PUNTOS_LUZ } from '../../src/game/valle/estilo'

const h = (horas: number, min = 0) => horas * 60 + min

describe('ciclo día/noche (M2-06)', () => {
  it('a mediodía no hay tinte', () => {
    expect(luzDelMinuto(h(12)).alfa).toBe(0)
    expect(luzDelMinuto(h(7, 30)).alfa).toBe(0)
    expect(luzDelMinuto(h(18)).alfa).toBe(0)
  })

  it('de noche el tinte es el más oscuro', () => {
    for (const m of [h(22), h(0), h(2), h(5), h(20), h(26)]) {
      expect(luzDelMinuto(m).alfa).toBeCloseTo(0.55)
    }
  })

  it('amanece y anochece de forma gradual y monótona', () => {
    const alfas = (desde: number, hasta: number) =>
      Array.from({ length: hasta - desde + 1 }, (_, i) => luzDelMinuto(desde + i).alfa)
    const amanecer = alfas(h(5), h(7, 30))
    const atardecer = alfas(h(18), h(20))
    // Del tinte de noche al del alba y de ahí a cero, sin saltos grandes entre minutos.
    for (const serie of [amanecer, atardecer]) {
      for (let i = 1; i < serie.length; i++) {
        expect(Math.abs((serie[i] ?? 0) - (serie[i - 1] ?? 0))).toBeLessThan(0.01)
      }
    }
    expect(amanecer[0]).toBeCloseTo(0.55)
    expect(amanecer.at(-1)).toBe(0)
    expect(atardecer[0]).toBe(0)
    expect(atardecer.at(-1)).toBeCloseTo(0.55)
  })

  it('el color se interpola entre puntos y coincide en los puntos de control', () => {
    for (const p of PUNTOS_LUZ) {
      expect(luzDelMinuto(p.minuto)).toEqual({ color: p.color, alfa: p.alfa })
    }
    const medio = luzDelMinuto(h(19, 30))
    expect(medio.color).not.toBe(0xf07a3c)
    expect(medio.color).not.toBe(0x0b1233)
  })

  it('las 26:00 son las 02:00 y entradas no válidas dan la noche o el valor por defecto sin romper', () => {
    expect(luzDelMinuto(h(26))).toEqual(luzDelMinuto(h(2)))
    expect(luzDelMinuto(Number.NaN)).toEqual(luzDelMinuto(0))
    expect(luzDelMinuto(-60)).toEqual(luzDelMinuto(h(23)))
  })
})

describe('profundidad del tinte', () => {
  it('queda por encima de cualquier objeto del mundo (depth = y en px del personaje)', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    expect(PROFUNDIDAD_TINTE).toBeGreaterThan(tamanoMundoPx(e.valle))
  })
})
