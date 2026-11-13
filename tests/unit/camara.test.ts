import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { CONFIG_CAMARA, limitesZoom, zoomInicial } from '../../src/game/camara/config'
import {
  factorPellizco,
  limitarVista,
  limitarZoom,
  medirDedos,
  pasoPellizco,
  puntoMundo,
  transformar,
  zoomEn,
  type Vista,
} from '../../src/game/camara/matematica'

const MUNDO = 3072
const pantalla = { ancho: 800, alto: 600 }
const lim = { min: 0.25, max: 2.5 }
const cerca = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

const vistaArb = fc.record({
  zoom: fc.double({ min: 0.25, max: 2.5, noNaN: true }),
  cx: fc.double({ min: 0, max: MUNDO, noNaN: true }),
  cy: fc.double({ min: 0, max: MUNDO, noNaN: true }),
})
const puntoArb = fc.record({
  x: fc.double({ min: 0, max: 800, noNaN: true }),
  y: fc.double({ min: 0, max: 600, noNaN: true }),
})

describe('matemática de la cámara', () => {
  it('limitarZoom respeta mínimo y máximo', () => {
    expect(limitarZoom(0.01, lim)).toBe(0.25)
    expect(limitarZoom(9, lim)).toBe(2.5)
    expect(limitarZoom(1, lim)).toBe(1)
  })

  it('el zoom en un punto lo deja fijo en pantalla (zona sin límites)', () => {
    const v: Vista = { zoom: 1, cx: 1500, cy: 1500 }
    const p = { x: 600, y: 100 }
    const antes = puntoMundo(v, pantalla, p)
    const v2 = zoomEn(v, pantalla, p, 1.5, lim, MUNDO)
    expect(v2.zoom).toBe(1.5)
    const despues = puntoMundo(v2, pantalla, p)
    cerca(despues.x, antes.x)
    cerca(despues.y, antes.y)
  })

  it('limita el desplazamiento a los bordes del mundo', () => {
    const v = limitarVista({ zoom: 1, cx: -500, cy: 99999 }, pantalla, MUNDO)
    expect(v.cx).toBe(400)
    expect(v.cy).toBe(MUNDO - 300)
  })

  it('si el mundo cabe en un eje, lo centra en ese eje', () => {
    const v = limitarVista({ zoom: 0.1, cx: 10, cy: 20 }, pantalla, MUNDO)
    expect(v.cx).toBe(MUNDO / 2)
    expect(v.cy).toBe(MUNDO / 2)
    // Solo cabe en un eje: 0.25 * 3072 = 768 < 800 pero 600/0.25 = 2400 < 3072 → cabe en x, no en y.
    const w = limitarVista({ zoom: 0.25, cx: 0, cy: 0 }, pantalla, MUNDO)
    expect(w.cx).toBe(MUNDO / 2)
    expect(w.cy).toBe(1200)
  })

  it('arrastrar desplaza la vista en sentido contrario', () => {
    const v: Vista = { zoom: 2, cx: 1500, cy: 1500 }
    const v2 = transformar(v, pantalla, { x: 400, y: 300 }, { x: 500, y: 260 }, 1, lim, MUNDO)
    cerca(v2.cx, 1500 - 50)
    cerca(v2.cy, 1500 + 20)
  })

  it('el paso de pellizco escala con la distancia y sigue el punto medio', () => {
    const v: Vista = { zoom: 1, cx: 1500, cy: 1500 }
    const antes = medirDedos({ x: 300, y: 300 }, { x: 500, y: 300 })
    const ahora = medirDedos({ x: 200, y: 300 }, { x: 600, y: 300 })
    const v2 = pasoPellizco(v, pantalla, antes, ahora, lim, MUNDO)
    expect(v2.zoom).toBe(2)
    const w = puntoMundo(v, pantalla, antes.medio)
    const w2 = puntoMundo(v2, pantalla, ahora.medio)
    cerca(w2.x, w.x)
    cerca(w2.y, w.y)
  })

  it('con dedos juntos (distancia 0) no cambia el zoom', () => {
    const v: Vista = { zoom: 1, cx: 1500, cy: 1500 }
    const a = medirDedos({ x: 1, y: 1 }, { x: 1, y: 1 })
    expect(pasoPellizco(v, pantalla, a, a, lim, MUNDO).zoom).toBe(1)
  })

  it('propiedad: cualquier gesto deja zoom y vista dentro de los límites', () => {
    fc.assert(
      fc.property(
        vistaArb,
        puntoArb,
        puntoArb,
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        (v, a, b, f) => {
          const r = transformar(limitarVista(v, pantalla, MUNDO), pantalla, a, b, f, lim, MUNDO)
          expect(r.zoom).toBeGreaterThanOrEqual(lim.min)
          expect(r.zoom).toBeLessThanOrEqual(lim.max)
          const mitadX = pantalla.ancho / r.zoom / 2
          const mitadY = pantalla.alto / r.zoom / 2
          if (mitadX * 2 < MUNDO) {
            expect(r.cx - mitadX).toBeGreaterThanOrEqual(-1e-6)
            expect(r.cx + mitadX).toBeLessThanOrEqual(MUNDO + 1e-6)
          } else cerca(r.cx, MUNDO / 2)
          if (mitadY * 2 < MUNDO) {
            expect(r.cy - mitadY).toBeGreaterThanOrEqual(-1e-6)
            expect(r.cy + mitadY).toBeLessThanOrEqual(MUNDO + 1e-6)
          } else cerca(r.cy, MUNDO / 2)
        },
      ),
    )
  })

  it('propiedad: zoom en el centro de la vista sin tocar límites conserva el centro', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 2, noNaN: true }), (f) => {
        const v: Vista = { zoom: 1, cx: MUNDO / 2, cy: MUNDO / 2 }
        const r = zoomEn(v, pantalla, { x: 400, y: 300 }, f, lim, MUNDO)
        cerca(r.cx, MUNDO / 2)
        cerca(r.cy, MUNDO / 2)
      }),
    )
  })
})

describe('pantalla de 0 px', () => {
  it('con factor 0 y pantalla 0 la vista sigue finita', () => {
    const p = { ancho: 0, alto: 0 }
    const l = limitesZoom(p, MUNDO)
    expect(l.min).toBeGreaterThan(0)
    const v = transformar(
      { zoom: 1, cx: 100, cy: 100 },
      p,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      0,
      l,
      MUNDO,
    )
    for (const n of [v.zoom, v.cx, v.cy]) expect(Number.isFinite(n)).toBe(true)
    expect(v.zoom).toBeGreaterThan(0)
  })

  it('factorPellizco vale 1 con dedos superpuestos', () => {
    const a = { distancia: 0, medio: { x: 0, y: 0 } }
    const b = { distancia: 50, medio: { x: 0, y: 0 } }
    expect(factorPellizco(a, b)).toBe(1)
    expect(factorPellizco(b, a)).toBe(1)
    expect(factorPellizco(b, { ...b, distancia: 100 })).toBe(2)
  })
})

describe('configuración de la cámara', () => {
  it('el zoom mínimo encuadra el valle entero y el máximo es el configurado', () => {
    const l = limitesZoom({ ancho: 412, alto: 915 }, MUNDO)
    cerca(l.min, 412 / MUNDO)
    expect(l.max).toBe(CONFIG_CAMARA.zoomMax)
  })

  it('el zoom inicial es legible en móvil vertical y escritorio', () => {
    expect(zoomInicial({ ancho: 412, alto: 915 }, MUNDO)).toBeGreaterThanOrEqual(0.6)
    expect(zoomInicial({ ancho: 1280, alto: 720 }, MUNDO)).toBeGreaterThanOrEqual(0.6)
  })

  it('con una pantalla enorme el zoom inicial no baja del encuadre', () => {
    const p = { ancho: 8000, alto: 8000 }
    expect(zoomInicial(p, MUNDO)).toBeCloseTo(8000 / MUNDO, 6)
  })
})

describe('extensión de la vista (parcela de borde con panel abierto)', () => {
  const zoom = 1
  // Centro fuera del rango normal (el mínimo en x es 400): la extensión lo permite.
  const fuera: Vista = { zoom, cx: 100, cy: 1000 }
  const ext = { x: fuera.cx, y: fuera.cy }
  const c = { x: 400, y: 300 }

  it('con la extensión encogida al centro, 1 px de gesto mueve la vista como mucho 1 px', () => {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const v = transformar(fuera, pantalla, c, { x: c.x + dx, y: c.y + dy }, 1, lim, MUNDO, ext)
      expect(Math.hypot(v.cx - fuera.cx, v.cy - fuera.cy)).toBeLessThanOrEqual(1 / zoom + 1e-9)
    }
  })

  it('sin extensión, el mismo gesto salta a los límites normales', () => {
    const v = transformar(fuera, pantalla, c, { x: c.x + 1, y: c.y }, 1, lim, MUNDO)
    expect(Math.abs(v.cx - fuera.cx)).toBeGreaterThan(100)
  })
})
