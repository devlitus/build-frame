import { describe, expect, it } from 'vitest'
import { CONFIG_TIEMPO } from '../../src/core'
import { AcumuladorTiempo } from '../../src/game/bucle'

/** Minutos de juego tras `segundos` de tiempo real en fotogramas de 16 ms. */
function minutos(velocidad: number, segundos: number): number {
  const acum = new AcumuladorTiempo()
  let total = 0
  for (let ms = 0; ms < segundos * 1000; ms += 16) total += acum.acumular(16, velocidad, false)
  return total
}

describe('velocidad del reloj', () => {
  it('x2 y x3 avanzan el doble y el triple que x1 (dentro del redondeo)', () => {
    const [v1, v2, v3] = CONFIG_TIEMPO.velocidades
    const base = minutos(v1 ?? 1, 600)
    expect(base).toBeGreaterThan(0)
    expect(Math.abs(minutos(v2 ?? 2, 600) - 2 * base)).toBeLessThanOrEqual(2)
    expect(Math.abs(minutos(v3 ?? 3, 600) - 3 * base)).toBeLessThanOrEqual(3)
  })
  it('detenido no avanza', () => {
    expect(new AcumuladorTiempo().acumular(16, 3, true)).toBe(0)
  })
})
