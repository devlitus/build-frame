import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  areaLibre,
  centroParaVer,
  parcelaEnPunto,
  puntoDeToque,
  rectParcela,
} from '../../src/game/picking'

const g = { parcelasPorLado: 6, ladoParcelaPx: 640 }
const pantallaArb = fc.record({
  ancho: fc.integer({ min: 300, max: 2000 }),
  alto: fc.integer({ min: 300, max: 1200 }),
})
const zoomArb = fc.double({ min: 0.2, max: 4, noNaN: true })

describe('picking (rompedor M3-03)', () => {
  it('el punto de toque de una parcela cae en esa parcela, con cualquier zoom y desplazamiento', () => {
    fc.assert(
      fc.property(
        pantallaArb,
        zoomArb,
        fc.double({ min: 0, max: 3840, noNaN: true }),
        fc.double({ min: 0, max: 3840, noNaN: true }),
        fc.integer({ min: 0, max: 35 }),
        (pantalla, zoom, cx, cy, i) => {
          const vista = { zoom, cx, cy }
          const libre = areaLibre(pantalla, undefined)
          const p = puntoDeToque(vista, pantalla, libre, rectParcela(g, i))
          if (!p) return true
          const mx = (p.x - pantalla.ancho / 2) / zoom + cx
          const my = (p.y - pantalla.alto / 2) / zoom + cy
          return parcelaEnPunto(g, mx, my) === i
        },
      ),
      { numRuns: 2000 },
    )
  })

  it('tras centroParaVer la parcela cabe entera en la zona libre (si cabe)', () => {
    fc.assert(
      fc.property(
        pantallaArb,
        zoomArb,
        fc.double({ min: 0, max: 3840, noNaN: true }),
        fc.double({ min: 0, max: 3840, noNaN: true }),
        fc.integer({ min: 0, max: 35 }),
        (pantalla, zoom, cx, cy, i) => {
          const libre = areaLibre(pantalla, undefined)
          const r = rectParcela(g, i)
          if (r.ancho * zoom > libre.ancho || r.alto * zoom > libre.alto) return true
          const c = centroParaVer({ zoom, cx, cy }, pantalla, libre, r)
          if (!c) return true
          const nueva = { zoom, cx: c.x, cy: c.y }
          const p = puntoDeToque(nueva, pantalla, libre, r)
          return p !== undefined
        },
      ),
      { numRuns: 2000 },
    )
  })

  it('bordes: el borde compartido es de la siguiente y el final del valle queda fuera', () => {
    expect(parcelaEnPunto(g, 640, 0)).toBe(1)
    expect(parcelaEnPunto(g, 639.9999999999999, 0)).toBe(0)
    expect(parcelaEnPunto(g, 3840, 0)).toBeUndefined()
    expect(parcelaEnPunto(g, -1e-12, 0)).toBeUndefined()
  })
})
