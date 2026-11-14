import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectorParcela } from '../../src/game/selectorParcela'
import { mundoDePantalla } from '../../src/game/resolucion'
import { fakeCameraScene, fakePointer } from './fixtures/fake-scene'

vi.mock('phaser', () => ({
  default: { Core: { Events: { BLUR: 'blur', HIDDEN: 'hidden' } } },
}))
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

// E2E-16 · Rompedor: the parcel picker gestures (`SelectorParcela`, src/game/selectorParcela.ts)
// with a fake scene. Replaces the logic of seleccion-parcela.spec «un arrastre de cámara no
// selecciona», «en Vida no se selecciona nada…», seleccion-rompedor.spec «un toque largo (500 ms)
// quieto no selecciona», «un pellizco que termina levantando un dedo y luego el otro no
// selecciona», «tras un pellizco el siguiente toque corto sí selecciona» and m5-00-rompedor «DPR n ·
// Plano: el toque elige la parcela que está bajo el dedo».
describe('SelectorParcela gestures (fake scene)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function montar(dpr = 1) {
    const f = fakeCameraScene(412, 915, dpr)
    const k = 1 / f.scale.zoom
    f.main.setZoom(0.6 * k)
    f.main.setScroll(1536 - f.scale.width / 2, 1536 - f.scale.height / 2)
    let reloj = 0
    vi.spyOn(performance, 'now').mockImplementation(() => reloj)
    const tocados: { x: number; y: number }[] = []
    const selector = new SelectorParcela(f.scene as never, (m) => tocados.push(m))
    const esperar = (ms: number) => {
      reloj += ms
    }
    return { f, selector, tocados, esperar }
  }

  it.each([1, 1.25, 2, 2.625, 3])(
    'DPR %f: a short tap gives the world point under the finger',
    (dpr) => {
      const { f, tocados, esperar } = montar(dpr)
      const p = fakePointer(1, 150, 400, true)
      f.down(p)
      esperar(80)
      f.up(p)
      expect(tocados).toEqual([mundoDePantalla(f.scene as never, 150, 400)])
    },
  )

  it('a camera drag does not select, even if it comes back to where it started', () => {
    const { f, tocados } = montar()
    const p = fakePointer(1, 150, 400, true)
    f.down(p)
    f.move(p, 200, 400)
    f.move(p, 150, 400)
    f.up(p)
    expect(tocados).toEqual([])
  })

  it('a still touch of 500 ms does not select; a mouse click held as long does', () => {
    const { f, tocados, esperar } = montar()
    const t = fakePointer(1, 150, 400, true)
    f.down(t)
    esperar(500)
    f.up(t)
    expect(tocados).toEqual([])
    const r = fakePointer(0, 150, 400, false)
    f.down(r)
    esperar(500)
    f.up(r)
    expect(tocados).toHaveLength(1)
  })

  it('a pinch ending one finger and then the other does not select; the next short tap does', () => {
    const { f, tocados, esperar } = montar()
    const a = fakePointer(1, 150, 400, true)
    const b = fakePointer(2, 250, 400, true)
    f.down(a)
    f.down(b)
    f.move(a, 140, 400)
    f.move(b, 260, 400)
    f.up(a)
    esperar(50)
    f.up(b)
    expect(tocados).toEqual([])
    const c = fakePointer(3, 150, 400, true)
    f.down(c)
    esperar(80)
    f.up(c)
    expect(tocados).toHaveLength(1)
  })

  it('right click, a cancelled touch, Life (inactive) and a focus loss mid-gesture do not select', () => {
    const { f, selector, tocados } = montar()
    const der = fakePointer(0, 150, 400, false, 2)
    f.down(der)
    f.up(der)
    const can = fakePointer(1, 150, 400, true)
    f.down(can)
    f.up(can, true)
    const blur = fakePointer(1, 150, 400, true)
    f.down(blur)
    f.game.events.emit('blur')
    f.up(blur)
    selector.activo = false
    const vida = fakePointer(1, 150, 400, true)
    f.down(vida)
    f.up(vida)
    expect(tocados).toEqual([])
  })
})

describe('SelectorParcela: scene shutdown', () => {
  it('removes its pointer, blur and hidden listeners (restarting the valley leaves no duplicate gesture)', () => {
    const f = fakeCameraScene(412, 915)
    new SelectorParcela(f.scene as never, () => undefined)
    f.scene.events.emit('shutdown')
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside'])
      expect(f.input.cuenta(ev), ev).toBe(0)
    expect(f.game.events.cuenta('blur')).toBe(0)
    expect(f.game.events.cuenta('hidden')).toBe(0)
  })
})
