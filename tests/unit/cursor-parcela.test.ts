import { describe, expect, it } from 'vitest'
import { parcelaEnCentroDeVista, parcelaVecina } from '../../src/game/cursorParcela'

/** Estabilización M3 · selección de parcela con teclado (lógica pura). */

const G = { parcelasPorLado: 6, ladoParcelaPx: 512 }

describe('parcelaVecina (flechas sobre la cuadrícula)', () => {
  it('se mueve una parcela en cada dirección', () => {
    expect(parcelaVecina(6, 14, 'derecha')).toBe(15)
    expect(parcelaVecina(6, 14, 'izquierda')).toBe(13)
    expect(parcelaVecina(6, 14, 'arriba')).toBe(8)
    expect(parcelaVecina(6, 14, 'abajo')).toBe(20)
  })

  it('en los bordes y esquinas se queda donde está (no da la vuelta)', () => {
    expect(parcelaVecina(6, 0, 'arriba')).toBe(0)
    expect(parcelaVecina(6, 0, 'izquierda')).toBe(0)
    expect(parcelaVecina(6, 5, 'derecha')).toBe(5)
    expect(parcelaVecina(6, 5, 'arriba')).toBe(5)
    expect(parcelaVecina(6, 30, 'abajo')).toBe(30)
    expect(parcelaVecina(6, 30, 'izquierda')).toBe(30)
    expect(parcelaVecina(6, 35, 'derecha')).toBe(35)
    expect(parcelaVecina(6, 35, 'abajo')).toBe(35)
    // Fin de fila y principio de la siguiente no se enlazan.
    expect(parcelaVecina(6, 11, 'derecha')).toBe(11)
    expect(parcelaVecina(6, 12, 'izquierda')).toBe(12)
  })

  it('de ida y vuelta (donde hay vecina) se vuelve al origen', () => {
    for (let i = 0; i < 36; i++) {
      const r = parcelaVecina(6, i, 'derecha')
      if (r !== i) expect(parcelaVecina(6, r, 'izquierda')).toBe(i)
      const d = parcelaVecina(6, i, 'abajo')
      if (d !== i) expect(parcelaVecina(6, d, 'arriba')).toBe(i)
    }
  })
})

describe('parcelaEnCentroDeVista', () => {
  it('el centro del valle cae en una de las cuatro del medio', () => {
    expect(parcelaEnCentroDeVista(G, { zoom: 1, cx: 1536, cy: 1536 })).toBe(21)
  })

  it('el centro de una parcela da esa parcela', () => {
    expect(parcelaEnCentroDeVista(G, { zoom: 1, cx: 256, cy: 256 })).toBe(0)
    expect(parcelaEnCentroDeVista(G, { zoom: 2, cx: 5 * 512 + 256, cy: 2 * 512 + 256 })).toBe(17)
  })

  it('con el centro fuera del valle toma la parcela del borde más cercana', () => {
    expect(parcelaEnCentroDeVista(G, { zoom: 1, cx: -300, cy: -10 })).toBe(0)
    expect(parcelaEnCentroDeVista(G, { zoom: 1, cx: 99999, cy: 99999 })).toBe(35)
    expect(parcelaEnCentroDeVista(G, { zoom: 1, cx: 99999, cy: 0 })).toBe(5)
    expect(parcelaEnCentroDeVista(G, { zoom: 1, cx: Number.NaN, cy: 700 })).toBe(6)
  })
})
