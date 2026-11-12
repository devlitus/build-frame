import { describe, expect, it } from 'vitest'
import { acercar, type Vista } from '../../src/game/camara/matematica'

const v: Vista = { zoom: 1, cx: 0, cy: 0 }
const o = { x: 100, y: -50 }

describe('acercar (seguimiento suave)', () => {
  it('delta 0 o inválido no cambia la vista', () => {
    expect(acercar(v, o, 0, 120)).toBe(v)
    expect(acercar(v, o, -5, 120)).toBe(v)
    expect(acercar(v, o, NaN, 120)).toBe(v)
  })
  it('se acerca al objetivo sin pasarse y converge', () => {
    let a = v
    let previa = Infinity
    for (let i = 0; i < 200; i++) {
      a = acercar(a, o, 16, 120)
      const d = Math.hypot(o.x - a.cx, o.y - a.cy)
      expect(d).toBeLessThanOrEqual(previa)
      expect(a.cx).toBeLessThanOrEqual(o.x)
      expect(a.cy).toBeGreaterThanOrEqual(o.y)
      previa = d
    }
    expect(previa).toBeLessThan(0.01)
  })
  it('un delta enorme llega al objetivo sin pasarse', () => {
    const a = acercar(v, o, 1e9, 120)
    expect(a.cx).toBeCloseTo(o.x)
    expect(a.cy).toBeCloseTo(o.y)
  })
  it('no toca el zoom', () => {
    expect(acercar({ ...v, zoom: 2 }, o, 16, 120).zoom).toBe(2)
  })
})
