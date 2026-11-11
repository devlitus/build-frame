import { describe, expect, it } from 'vitest'
import { TAM_TROZO, rejillaTrozos } from '../../src/game/valle/trozos'

describe('rejillaTrozos', () => {
  it('3072 px en trozos de 1024 son 3x3 sin sobras', () => {
    const t = rejillaTrozos(3072)
    expect(t).toHaveLength(9)
    expect(t.every((z) => z.ancho === TAM_TROZO && z.alto === TAM_TROZO)).toBe(true)
    expect(t[4]).toMatchObject({ columna: 1, fila: 1, x: 1024, y: 1024 })
  })
  it('el último trozo es menor si el mundo no es múltiplo', () => {
    const t = rejillaTrozos(2500, 1024)
    expect(t).toHaveLength(9)
    expect(t.at(-1)).toMatchObject({ x: 2048, y: 2048, ancho: 452, alto: 452 })
  })
  it('un mundo menor que el trozo es un único trozo', () => {
    expect(rejillaTrozos(500)).toEqual([{ columna: 0, fila: 0, x: 0, y: 0, ancho: 500, alto: 500 }])
  })
  it('cubren el mundo exactamente, sin huecos ni solapes y en enteros', () => {
    const casos: [number, number][] = [
      [3072, 1024],
      [2500, 1024],
      [1025, 1024],
      [100, 7],
      [1, 1],
    ]
    for (const [mundo, tam] of casos) {
      const t = rejillaTrozos(mundo, tam)
      expect(t.reduce((a, z) => a + z.ancho * z.alto, 0)).toBe(mundo * mundo)
      for (const z of t) {
        expect([z.x, z.y, z.ancho, z.alto].every(Number.isInteger)).toBe(true)
        expect(z.ancho).toBeGreaterThan(0)
        expect(z.ancho).toBeLessThanOrEqual(tam)
        expect(z.x + z.ancho).toBeLessThanOrEqual(mundo)
      }
    }
  })
  it('rechaza entradas inválidas', () => {
    expect(() => rejillaTrozos(0)).toThrow(RangeError)
    expect(() => rejillaTrozos(10, 0)).toThrow(RangeError)
    expect(() => rejillaTrozos(10.5)).toThrow(RangeError)
  })
})
