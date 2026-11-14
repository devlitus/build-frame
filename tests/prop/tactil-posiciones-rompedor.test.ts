/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, buscarCamino, crearEstadoInicial } from '../../src/core'
import { SeguidorCamino } from '../../src/game/seguirCamino'
import { limitesZoom } from '../../src/game/camara/config'
import { ControlCamara } from '../../src/game/camara/controlCamara'
import { areaLibre, parcelaEnPunto, puntoDeToque, rectParcela } from '../../src/game/picking'
import { casillaEnPunto } from '../../src/game/pincel'
import { factorResolucion, mundoDePantalla, pantallaLogica } from '../../src/game/resolucion'
import { fakeCameraScene } from '../unit/fixtures/fake-scene'

vi.mock('phaser', () => ({ default: {} }))

/** M2-04 rompedor: tocar un destino tras andar con el joystick (posición arbitraria). */

const semilla = fc.integer({ min: 0, max: 2 ** 32 - 1 })

describe('tras andar con el joystick (posición arbitraria junto a obstáculos)', () => {
  it('desde donde acabe el personaje, la ruta A* llega sin darse por atascada', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.array(
          fc.record({
            dx: fc.double({ min: -1, max: 1, noNaN: true }),
            dy: fc.double({ min: -1, max: 1, noNaN: true }),
            ms: fc.integer({ min: 1, max: 600 }),
          }),
          { minLength: 5, maxLength: 60 },
        ),
        fc.integer({ min: 0, max: 95 }),
        fc.integer({ min: 0, max: 95 }),
        (s, pasos, cx, cy) => {
          let e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          for (const p of pasos) {
            e = aplicarComando(e, { tipo: 'MoverPersonaje', ...p }).estado
          }
          const meta = { x: cx + 0.5, y: cy + 0.5 }
          const ruta = buscarCamino(e, e.personaje, meta)
          if (ruta.length === 0) return
          const seg = new SeguidorCamino()
          seg.fijar(e, e.personaje, meta)
          let n = 0
          while (seg.destino && n < 20_000) {
            n++
            const c = seg.siguiente(e.personaje, 16)
            if (c) e = aplicarComando(e, c).estado
          }
          const fin = ruta[ruta.length - 1]!
          expect(Math.hypot(e.personaje.x - fin.x, e.personaje.y - fin.y)).toBeLessThan(0.05)
        },
      ),
      { numRuns: 150 },
    )
  })

  it('20 destinos seguidos (peor caso) se calculan en menos de 150 ms en total', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const s = new SeguidorCamino()
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) s.fijar(e, e.personaje, { x: 95.5 - i * 0.1, y: 95.5 })
    expect(performance.now() - t0).toBeLessThan(150)
  })
})

// ---------------------------------------------------------------------------------------------
// E2E-16 · Rompedor: a touch lands on the tile under the finger at any DPR (1, 1.25, 2, 2.625, 3).
// The chain is the game's: the hook's screen point (`puntoDeToque` over the logical screen, as
// `EscenaValle.puntoClicCasilla`/`puntoClic`) → pointer in CSS px → `mundoDePantalla` (× factor)
// → the Phaser camera set by `ControlCamara` (zoom × factor) → tile (`casillaEnPunto`) or parcel
// (`parcelaEnPunto`). Replaces the logic of m5-00-rompedor «DPR n · toque, clic de colocación y
// pincel caen en la casilla bajo el dedo», «DPR n · Plano: el toque elige la parcela que está bajo
// el dedo», «al girar el móvil el lienzo sigue a CSS×2 y el toque sigue cayendo en su casilla» and
// m5-00-final-rompedor «DPR 1→2→1→3→1,25→2 sin cambiar el tamaño CSS … toque coherentes».
// ---------------------------------------------------------------------------------------------

const DPRS = [1, 1.25, 2, 2.625, 3] as const
const TAM = 32
const LADO = 96
const MUNDO = LADO * TAM

function tileUnderTouch(
  f: ReturnType<typeof fakeCameraScene>,
  control: ControlCamara,
  cx: number,
  cy: number,
) {
  const pantalla = pantallaLogica(f.scene as never)
  const libre = areaLibre(pantalla, undefined)
  const pt = puntoDeToque(control.vista, pantalla, libre, {
    x: cx * TAM,
    y: cy * TAM,
    ancho: TAM,
    alto: TAM,
  })
  if (!pt) return { pt: undefined, casilla: undefined }
  const m = mundoDePantalla(f.scene as never, pt.x, pt.y)
  return { pt, m, casilla: casillaEnPunto(LADO, TAM, m.x, m.y) }
}

describe('a touch lands on the tile under the finger at any DPR', () => {
  it('property: any view, any CSS size, any DPR: the hook point of a visible tile maps back to it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DPRS),
        fc.integer({ min: 240, max: 1920 }),
        fc.integer({ min: 240, max: 1080 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: LADO - 1 }),
        fc.integer({ min: 0, max: LADO - 1 }),
        (dpr, w, h, fz, fx, fy, tx, ty) => {
          const f = fakeCameraScene(w, h, dpr)
          const control = new ControlCamara(f.scene as never, MUNDO)
          const lim = limitesZoom(pantallaLogica(f.scene as never), MUNDO)
          control.zoomCentro((lim.min + fz * (lim.max - lim.min)) / control.vista.zoom)
          control.centrarEn({ x: fx * MUNDO, y: fy * MUNDO })
          expect(f.main.zoom).toBeCloseTo(control.vista.zoom * factorResolucion(dpr), 9)
          const { pt, casilla } = tileUnderTouch(f, control, tx, ty)
          if (!pt) return // not visible in the free area
          expect(casilla, `DPR ${dpr} ${w}×${h} tile (${tx}, ${ty})`).toEqual({ x: tx, y: ty })
        },
      ),
      { numRuns: 500 },
    )
  })

  it.each(DPRS)('DPR %f, Plano: the touch picks the parcel under the finger (all 36)', (dpr) => {
    const f = fakeCameraScene(412, 915, dpr)
    const control = new ControlCamara(f.scene as never, MUNDO)
    const g = { parcelasPorLado: 6, ladoParcelaPx: 16 * TAM }
    for (let i = 0; i < 36; i++) {
      control.centrarEn({ x: (i % 6) * 512 + 256, y: Math.floor(i / 6) * 512 + 256 })
      const pantalla = pantallaLogica(f.scene as never)
      const pt = puntoDeToque(
        control.vista,
        pantalla,
        areaLibre(pantalla, undefined),
        rectParcela(g, i),
      )
      expect(pt, `parcel ${i}`).toBeDefined()
      const m = mundoDePantalla(f.scene as never, pt!.x, pt!.y)
      expect(parcelaEnPunto(g, m.x, m.y), `DPR ${dpr} parcel ${i}`).toBe(i)
    }
  })

  it('DPR changes on the fly (1→2→1→3→1.25→2) and rotations keep the touch on its tile', () => {
    const f = fakeCameraScene(412, 915, 1)
    const control = new ControlCamara(f.scene as never, MUNDO)
    control.centrarEn({ x: 47.5 * TAM, y: 90.5 * TAM })
    const pasos: [number, number, number][] = [
      [412, 915, 2],
      [412, 915, 1],
      [412, 915, 3],
      [412, 915, 1.25],
      [412, 915, 2],
      [915, 412, 2],
      [412, 915, 2],
      [1280, 720, 1],
    ]
    for (const [w, h, dpr] of pasos) {
      f.resize(w, h, dpr)
      // Logical (CSS) screen is the same whatever the DPR; the canvas is CSS × min(DPR, 2).
      const pantalla = pantallaLogica(f.scene as never)
      expect(pantalla.ancho).toBeCloseTo(w, 0)
      expect(pantalla.alto).toBeCloseTo(h, 0)
      expect(f.scale.width).toBe(Math.round(w * factorResolucion(dpr)))
      expect(f.main.zoom).toBeCloseTo(control.vista.zoom * factorResolucion(dpr), 9)
      const v = control.vista
      const cx = Math.floor(v.cx / TAM) + 2
      const cy = Math.floor(v.cy / TAM) - 1
      expect(tileUnderTouch(f, control, cx, cy).casilla, `${w}×${h} DPR ${dpr}`).toEqual({
        x: cx,
        y: cy,
      })
    }
  })

  it('[mutant check] forgetting the resolution factor in the conversion would miss the tile at DPR 2', () => {
    const f = fakeCameraScene(412, 915, 2)
    const control = new ControlCamara(f.scene as never, MUNDO)
    control.centrarEn({ x: 40 * TAM, y: 40 * TAM })
    const { pt } = tileUnderTouch(f, control, 43, 38)
    // Without × factor (pointer.worldX style) the point lands somewhere else.
    const mal = f.main.getWorldPoint(pt!.x, pt!.y)
    expect(casillaEnPunto(LADO, TAM, mal.x, mal.y)).not.toEqual({ x: 43, y: 38 })
  })
})
