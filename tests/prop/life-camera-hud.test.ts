/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conocidos en tests */
/**
 * E2E-16 · Rompedor. Life-mode camera with the HUD: the tool bar (bottom row or left column) and
 * the inventory panel widen only the covered edge of the camera range (`Margenes.soloExtremos`).
 * Replaces the logic of inventario-rompedor-r2.spec.ts «cámara de Vida con margen bajo la barra»
 * (4 corners × 3 views), «ninguna esquina deja al personaje bajo el HUD ni fuera de la pantalla»,
 * «al girar el móvil en el borde oeste…» and «inventario abierto en el borde oeste…».
 *
 * `margenesVida` is private in `EscenaValle` (src/game/scenes/EscenaValle.ts); its formula is
 * copied here as the model and kept next to the property so a change there shows up here.
 */
import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { CONFIG_PERSONAJE } from '../../src/core'
import { CONFIG_CAMARA, limitesZoom } from '../../src/game/camara/config'
import { limitarVista, type Margenes, type Pantalla } from '../../src/game/camara/matematica'
import type { CajaHud } from '../../src/game/areaHud'
import { ControlCamara } from '../../src/game/camara/controlCamara'
import { fakeCameraScene } from '../unit/fixtures/fake-scene'

vi.mock('phaser', () => ({ default: {} }))

const TAM = 32
const LADO = 96
const MUNDO = LADO * TAM
const H = CONFIG_CAMARA.holguraBordePx
const MEDIA_CAJA = CONFIG_PERSONAJE.tamanoCaja / 2

/** Copy of `EscenaValle.margenesVida` (src/game/scenes/EscenaValle.ts). */
function margenesVida(
  pantalla: Pantalla,
  barra: CajaHud,
  panel: CajaHud | undefined,
  zoom: number,
): Margenes {
  const columna = barra.right - barra.left < barra.bottom - barra.top
  let izq = 0
  let abajo = 0
  if (columna) izq = barra.right + H
  else abajo = Math.max(0, pantalla.alto - barra.top + H)
  if (panel && !columna) izq = Math.max(izq, panel.right + H)
  const arriba = Math.ceil((TAM / 2) * zoom)
  return { arriba, abajo, izq: Math.max(0, Math.ceil(izq)), der: 0, soloExtremos: true }
}

interface Caso {
  pantalla: Pantalla
  barra: CajaHud
  panel: CajaHud | undefined
  zoom: number
}

/** Bottom row (landscape-like) or left column (the bar stacks when the screen is low). */
const casoArb: fc.Arbitrary<Caso> = fc
  .record({
    ancho: fc.integer({ min: 320, max: 1920 }),
    alto: fc.integer({ min: 320, max: 1080 }),
    columna: fc.boolean(),
    largo: fc.double({ min: 0.3, max: 0.9, noNaN: true }),
    grueso: fc.integer({ min: 48, max: 96 }),
    conPanel: fc.boolean(),
    anchoPanel: fc.double({ min: 0.15, max: 0.45, noNaN: true }),
    fz: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map((r) => {
    const pantalla = { ancho: r.ancho, alto: r.alto }
    const barra: CajaHud = r.columna
      ? {
          left: 8,
          right: 8 + r.grueso,
          top: 72,
          bottom: 72 + Math.max(r.grueso + 1, r.largo * (r.alto - 84)),
        }
      : {
          left: 8,
          right: 8 + Math.max(r.grueso + 1, r.largo * (r.ancho - 16)),
          top: r.alto - 12 - r.grueso,
          bottom: r.alto - 12,
        }
    const panel: CajaHud | undefined =
      r.conPanel && !r.columna
        ? { left: 8, right: 8 + r.anchoPanel * r.ancho, top: 80, bottom: barra.top - 8 }
        : undefined
    // Zooms where the valley does not fit on either axis (the margins only apply there; with the
    // whole valley on screen it is simply centred).
    const lim = limitesZoom(pantalla, MUNDO)
    const min = Math.max(lim.min, (1.01 * Math.max(r.ancho, r.alto)) / MUNDO)
    return { pantalla, barra, panel, zoom: min + r.fz * (lim.max - min) }
  })

/** Where the camera rests in Life when following the character (feet at px, py). */
function reposo(c: Caso, px: number, py: number) {
  const margenes = margenesVida(c.pantalla, c.barra, c.panel, c.zoom)
  return limitarVista({ zoom: c.zoom, cx: px, cy: py }, c.pantalla, MUNDO, { margenes })
}

/** Screen px shown outside the valley on each side. */
function franjas(c: Caso, v: { zoom: number; cx: number; cy: number }) {
  const izq = v.cx - c.pantalla.ancho / 2 / v.zoom
  const arriba = v.cy - c.pantalla.alto / 2 / v.zoom
  return {
    izq: Math.max(0, -izq) * v.zoom,
    arriba: Math.max(0, -arriba) * v.zoom,
    der: Math.max(0, izq + c.pantalla.ancho / v.zoom - MUNDO) * v.zoom,
    abajo: Math.max(0, arriba + c.pantalla.alto / v.zoom - MUNDO) * v.zoom,
  }
}

/** Head, middle and feet of the character on screen (as the e2e measured them). */
function cuerpo(c: Caso, v: { zoom: number; cx: number; cy: number }, qx: number, qy: number) {
  const x = (qx * TAM - v.cx) * v.zoom + c.pantalla.ancho / 2
  const pies = (qy * TAM - v.cy) * v.zoom + c.pantalla.alto / 2
  const cabeza = pies - TAM * v.zoom
  return [
    [x, cabeza + 2],
    [x, (cabeza + pies) / 2],
    [x, pies - 2],
  ] as const
}

const dentro = (b: CajaHud | undefined, x: number, y: number) =>
  b !== undefined && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom

/** The four corners and edges the e2e walked to (tile centres), plus random tile centres. */
const ESQUINAS = [
  [0.5, 95.5],
  [95.5, 95.5],
  [0.5, 0.5],
  [95.5, 0.5],
  [0.5, 48.5],
] as const

describe('Life camera with the HUD margins', () => {
  it('in the 4 corners (and the west edge) it never shows more outside the valley than what the bar covers', () => {
    // Original e2e: inventario-rompedor-r2.spec.ts «<vista>, esquina <esquina>: la vista no enseña
    // más fuera del valle que lo que tapa la barra» (12 tests).
    fc.assert(
      fc.property(casoArb, (c) => {
        const columna = c.barra.right - c.barra.left < c.barra.bottom - c.barra.top
        for (const [qx, qy] of ESQUINAS) {
          const f = franjas(c, reposo(c, qx * TAM, qy * TAM))
          const max = {
            izq: columna ? c.barra.right + H : c.panel ? c.panel.right + H : 0,
            arriba: Math.ceil((TAM / 2) * c.zoom),
            der: 0,
            abajo: columna ? 0 : c.pantalla.alto - c.barra.top + H,
          }
          for (const lado of ['izq', 'arriba', 'der', 'abajo'] as const)
            expect(f[lado], `${lado} at (${qx}, ${qy})`).toBeLessThanOrEqual(
              Math.ceil(max[lado]) + 1e-6,
            )
        }
      }),
      { numRuns: 400 },
    )
  })

  it('wherever the character stands on a tile centre, it is on screen and not under the bar or the panel', () => {
    // Original e2e: inventario-rompedor-r2.spec.ts «ninguna esquina deja al personaje bajo el HUD ni
    // fuera de la pantalla (las tres vistas)» and «<vista>: con el personaje pegado al borde oeste,
    // el panel abierto no lo tapa». The top HUD row is not modelled here: it stays in the interface
    // rule (R1–R4, «foco en Vida»).
    fc.assert(
      fc.property(
        casoArb,
        fc.integer({ min: 0, max: LADO - 1 }),
        fc.integer({ min: 0, max: LADO - 1 }),
        (c, tx, ty) => {
          for (const [qx, qy] of [...ESQUINAS, [tx + 0.5, ty + 0.5] as const]) {
            const v = reposo(c, qx * TAM, qy * TAM)
            for (const [x, y] of cuerpo(c, v, qx, qy)) {
              const msg = `(${qx}, ${qy}) -> screen (${x.toFixed(1)}, ${y.toFixed(1)})`
              expect(
                x >= 0 && x <= c.pantalla.ancho && y >= 0 && y <= c.pantalla.alto,
                `off screen ${msg}`,
              ).toBe(true)
              expect(dentro(c.barra, x, y), `under the bar ${msg}`).toBe(false)
              expect(dentro(c.panel, x, y), `under the panel ${msg}`).toBe(false)
            }
          }
        },
      ),
      { numRuns: 400 },
    )
  })

  // [S3] Pushing against the north edge with the keyboard leaves the feet at y = tamanoCaja / 2
  // (0.3 tiles), not at the tile centre. The top margin only allows half a tile of sprite above
  // the valley (`ceil(16 × zoom)`), so 0.2 tiles × 32 × zoom of the head go above the screen.
  it.fails('[S3] pressed against the north edge (feet at y = 0.3) the head stays on screen', () => {
    fc.assert(
      fc.property(
        casoArb,
        fc.double({ min: MEDIA_CAJA, max: LADO - MEDIA_CAJA, noNaN: true }),
        (c, qx) => {
          const qy = MEDIA_CAJA
          const v = reposo(c, qx * TAM, qy * TAM)
          const [cabeza] = cuerpo(c, v, qx, qy)
          expect(cabeza[1], `zoom ${c.zoom.toFixed(2)}`).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('ControlCamara: following with the Life margins converges to that resting view; rotating re-fits the west strip', () => {
    // Original e2e: inventario-rompedor-r2.spec.ts «al girar el móvil en el borde oeste, la franja
    // fuera del valle se ajusta a la barra».
    const vistas: [number, number][] = [
      [412, 839],
      [839, 412],
      [412, 839],
    ]
    const qx = 0.5
    const qy = 48.5
    const f = fakeCameraScene(vistas[0]![0], vistas[0]![1], 2.625)
    const control = new ControlCamara(
      f.scene as never,
      MUNDO,
      { seguir: true, arrastre: false },
      { x: qx * TAM, y: qy * TAM },
      { x: qx * TAM, y: qy * TAM },
    )
    for (const [w, h] of vistas) {
      f.resize(w, h, 2.625)
      // Portrait: bar in a bottom row; landscape low: bar stacked in a left column.
      const barra: CajaHud =
        h > w
          ? { left: 8, right: w - 8, top: h - 12 - 64, bottom: h - 12 }
          : { left: 8, right: 8 + 64, top: 60, bottom: h - 12 }
      const caso: Caso = {
        pantalla: { ancho: w, alto: h },
        barra,
        panel: undefined,
        zoom: control.vista.zoom,
      }
      control.fijarMargenes(margenesVida(caso.pantalla, barra, undefined, control.vista.zoom), true)
      for (let i = 0; i < 400; i++) control.seguir({ x: qx * TAM, y: qy * TAM }, 16)
      const esperado = reposo(caso, qx * TAM, qy * TAM)
      expect(control.vista.cx, `${w}×${h}`).toBeCloseTo(esperado.cx, 0)
      expect(control.vista.cy, `${w}×${h}`).toBeCloseTo(esperado.cy, 0)
      const fr = franjas(caso, control.vista)
      const columna = barra.right - barra.left < barra.bottom - barra.top
      expect(fr.izq, `${w}×${h}: west strip`).toBeLessThanOrEqual(
        (columna ? barra.right + H : 0) + 2,
      )
      // The Phaser camera gets the logical zoom × resolution factor.
      expect(f.main.zoom).toBeCloseTo(control.vista.zoom * 2, 9)
    }
  })

  it('ControlCamara: when a Life margin grows (panel opens), the view jumps so the character is never covered', () => {
    const f = fakeCameraScene(915, 412)
    const qx = 0.5
    const qy = 40.5
    const control = new ControlCamara(
      f.scene as never,
      MUNDO,
      { seguir: true, arrastre: false },
      { x: qx * TAM, y: qy * TAM },
      { x: qx * TAM, y: qy * TAM },
    )
    const barra: CajaHud = { left: 8, right: 600, top: 412 - 76, bottom: 400 }
    const sinPanel: Caso = {
      pantalla: { ancho: 915, alto: 412 },
      barra,
      panel: undefined,
      zoom: control.vista.zoom,
    }
    control.fijarMargenes(
      margenesVida(sinPanel.pantalla, barra, undefined, control.vista.zoom),
      true,
    )
    for (let i = 0; i < 400; i++) control.seguir({ x: qx * TAM, y: qy * TAM }, 16)
    const panel: CajaHud = { left: 8, right: 330, top: 80, bottom: 320 }
    const conPanel: Caso = { ...sinPanel, panel }
    control.fijarMargenes(margenesVida(conPanel.pantalla, barra, panel, control.vista.zoom))
    // Immediately (no frame in between) the character is already clear of the panel.
    for (const [x, y] of cuerpo(conPanel, control.vista, qx, qy))
      expect(dentro(panel, x, y), `(${x.toFixed(0)}, ${y.toFixed(0)}) under the panel`).toBe(false)
  })
})
