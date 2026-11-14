import { describe, expect, it } from 'vitest'
import { varianteDeCasilla } from '../../src/game/valle/variantes'

describe('varianteDeCasilla', () => {
  it('es determinista y está en rango', () => {
    for (let i = 0; i < 500; i++) {
      const v = varianteDeCasilla(42, i % 96, Math.floor(i / 96))
      expect(v).toBe(varianteDeCasilla(42, i % 96, Math.floor(i / 96)))
      expect(Number.isInteger(v) && v >= 0 && v < 4).toBe(true)
    }
  })

  it('reparte las cuatro variantes de forma pareja y rompe la repetición', () => {
    const cuenta = [0, 0, 0, 0]
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++)
        cuenta[varianteDeCasilla(7, x, y)] = (cuenta[varianteDeCasilla(7, x, y)] ?? 0) + 1
    }
    for (const c of cuenta) expect(c).toBeGreaterThan(96 * 96 * 0.2)
    // Una casilla y su vecina de la derecha no suelen ser iguales.
    let iguales = 0
    for (let x = 0; x < 95; x++) {
      if (varianteDeCasilla(7, x, 10) === varianteDeCasilla(7, x + 1, 10)) iguales++
    }
    expect(iguales).toBeLessThan(60)
  })

  it('depende de la semilla y de la sal', () => {
    const a = Array.from({ length: 64 }, (_, i) => varianteDeCasilla(1, i, 3))
    expect(Array.from({ length: 64 }, (_, i) => varianteDeCasilla(2, i, 3))).not.toEqual(a)
    expect(Array.from({ length: 64 }, (_, i) => varianteDeCasilla(1, i, 3, 4, 99))).not.toEqual(a)
  })
})
