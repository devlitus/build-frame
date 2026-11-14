/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conocidos en tests */
/**
 * E2E-16 · Rompedor. Life-mode camera with the HUD: the tool bar (bottom row or left column) and
 * the inventory panel widen only the covered edge of the camera range (`Margenes.soloExtremos`).
 * Replaces the logic of inventario-rompedor-r2.spec.ts «cámara de Vida con margen bajo la barra»
 * (4 corners × 3 views), «ninguna esquina deja al personaje bajo el HUD ni fuera de la pantalla»,
 * «al girar el móvil en el borde oeste…» and «inventario abierto en el borde oeste…».
 *
 * `margenesVida` is the pure function of `src/game/areaHud.ts` that `EscenaValle` uses (HUD-01):
 * the tests import the real formula, no copy.
 */
import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { CONFIG_PERSONAJE } from '../../src/core'
import { CONFIG_CAMARA, limitesZoom } from '../../src/game/camara/config'
import { limitarVista, type Margenes, type Pantalla } from '../../src/game/camara/matematica'
import { margenesVida as margenesVidaReal, type CajaHud } from '../../src/game/areaHud'
import { ControlCamara } from '../../src/game/camara/controlCamara'
import { fakeCameraScene } from '../unit/fixtures/fake-scene'

vi.mock('phaser', () => ({ default: {} }))

const TAM = 32
const LADO = 96
const MUNDO = LADO * TAM
const H = CONFIG_CAMARA.holguraBordePx
const MEDIA_CAJA = CONFIG_PERSONAJE.tamanoCaja / 2

/** Bottom edge of the top HUD plus its gap (`ReservasHud.arriba` of a one-row HUD). */
const RESERVA_ARRIBA = 72
const RADIO = CONFIG_CAMARA.radioLibreCasillas

function margenesVida(
  pantalla: Pantalla,
  barra: CajaHud,
  panel: CajaHud | undefined,
  zoom: number,
  reservaArriba = RESERVA_ARRIBA,
): Margenes {
  return margenesVidaReal({ pantalla, barra, panel, reservaArriba, zoom })
}

interface Caso {
  pantalla: Pantalla
  barra: CajaHud
  panel: CajaHud | undefined
  zoom: number
  /** Bottom edge of the top HUD plus its gap (one row, or two with a notice or stacked on a phone). */
  reservaArriba: number
}

/** Bottom row bar (the single bottom bar of HUD-01); a side card or a bottom sheet for the panel. */
const casoArb: fc.Arbitrary<Caso> = fc
  .record({
    ancho: fc.integer({ min: 320, max: 1920 }),
    alto: fc.integer({ min: 320, max: 1080 }),
    hoja: fc.boolean(),
    topHoja: fc.double({ min: 0.55, max: 0.8, noNaN: true }),
    reservaArriba: fc.integer({ min: RESERVA_ARRIBA, max: 140 }),
    anchoHoja: fc.double({ min: 0.65, max: 1, noNaN: true }),
    largo: fc.double({ min: 0.3, max: 0.9, noNaN: true }),
    grueso: fc.integer({ min: 48, max: 96 }),
    conPanel: fc.boolean(),
    anchoPanel: fc.double({ min: 0.15, max: 0.45, noNaN: true }),
    fz: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map((r) => {
    const pantalla = { ancho: r.ancho, alto: r.alto }
    const barra: CajaHud = {
      left: 8,
      right: 8 + Math.max(r.grueso + 1, r.largo * (r.ancho - 16)),
      top: r.alto - 12 - r.grueso,
      bottom: r.alto - 12,
    }
    const panel: CajaHud | undefined = !r.conPanel
      ? undefined
      : r.hoja
        ? // Bottom sheet over the bar: wider than 60 % of the screen.
          {
            left: 8,
            right: 8 + r.anchoHoja * r.ancho,
            top: r.alto * r.topHoja,
            bottom: barra.top - 8,
          }
        : { left: 8, right: 8 + r.anchoPanel * r.ancho, top: 80, bottom: barra.top - 8 }
    // Zooms where the valley does not fit on either axis (the margins only apply there; with the
    // whole valley on screen it is simply centred).
    const lim = limitesZoom(pantalla, MUNDO)
    const min = Math.max(lim.min, (1.01 * Math.max(r.ancho, r.alto)) / MUNDO)
    return {
      pantalla,
      barra,
      panel,
      zoom: min + r.fz * (lim.max - min),
      reservaArriba: r.reservaArriba,
    }
  })

/** Where the camera rests in Life when following the character (feet at px, py). */
function reposo(c: Caso, px: number, py: number) {
  const margenes = margenesVida(c.pantalla, c.barra, c.panel, c.zoom, c.reservaArriba)
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
        const radio = RADIO * TAM * c.zoom
        const hoja = c.panel !== undefined && c.panel.right - c.panel.left > c.pantalla.ancho * 0.6
        for (const [qx, qy] of ESQUINAS) {
          const f = franjas(c, reposo(c, qx * TAM, qy * TAM))
          // What the HUD covers, plus the gap and the free radius around the character (HUD-01).
          const max = {
            izq: c.panel && !hoja ? c.panel.right + H + radio : 0,
            arriba: Math.max(Math.ceil((TAM / 2) * c.zoom), c.reservaArriba + radio),
            der: 0,
            abajo: Math.max(
              c.pantalla.alto - c.barra.top + H + radio,
              hoja && c.panel ? c.pantalla.alto - c.panel.top + H + radio : 0,
            ),
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

  // Pushing against the north edge with the keyboard leaves the feet at y = tamanoCaja / 2
  // (0.3 tiles), not at the tile centre. It was an [S3] (the top margin only allowed half a tile of
  // sprite); with the HUD-01 top margin (top HUD + free radius) the head stays on screen.
  it('[S3] pressed against the north edge (feet at y = 0.3) the head stays on screen', () => {
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

  it('the 7x7 around the character is not under the bar, the panel or the top HUD in the 4 corners', () => {
    // HUD-01: the free radius (3 tiles) holds at the valley corners (R1..R4 «foco en Vida»).
    fc.assert(
      fc.property(casoArb, (c) => {
        for (const [qx, qy] of [
          [0.5, 0.5],
          [95.5, 0.5],
          [0.5, 95.5],
          [95.5, 95.5],
        ] as const) {
          const v = reposo(c, qx * TAM, qy * TAM)
          const px = (tx: number) => (tx * TAM - v.cx) * v.zoom + c.pantalla.ancho / 2
          const py = (ty: number) => (ty * TAM - v.cy) * v.zoom + c.pantalla.alto / 2
          const cuadro: CajaHud = {
            left: px(Math.floor(qx) - RADIO),
            right: px(Math.floor(qx) + RADIO + 1),
            top: py(Math.floor(qy) - RADIO),
            bottom: py(Math.floor(qy) + RADIO + 1),
          }
          const cruza = (b: CajaHud | undefined) =>
            b !== undefined &&
            Math.min(cuadro.right, b.right) - Math.max(cuadro.left, b.left) > 1e-3 &&
            Math.min(cuadro.bottom, b.bottom) - Math.max(cuadro.top, b.top) > 1e-3
          const msg = `(${qx}, ${qy}) zoom ${c.zoom.toFixed(2)}`
          // Away from the edges the camera centres the character, so the margins cannot help if
          // the screen is so small that the centred 7x7 already reaches a cover (that is the
          // CSS's job): each cover is judged only when the centred 7x7 leaves it free.
          const medio = (RADIO + 1) * TAM * c.zoom
          const centroX = c.pantalla.ancho / 2
          const centroY = c.pantalla.alto / 2
          const hoja = c.panel && c.panel.right - c.panel.left > c.pantalla.ancho * 0.6
          if (centroY + medio <= c.barra.top)
            expect(cruza(c.barra), `7x7 under the bar at ${msg}`).toBe(false)
          if (c.panel && (hoja ? c.panel.top >= centroY + medio : c.panel.right <= centroX - medio))
            expect(cruza(c.panel), `7x7 under the panel at ${msg}`).toBe(false)
          if (centroY - medio >= c.reservaArriba)
            expect(
              cruza({ left: -1e6, right: 1e6, top: -1e6, bottom: c.reservaArriba }),
              `7x7 under the top HUD at ${msg}`,
            ).toBe(false)
        }
      }),
      { numRuns: 400 },
    )
  })

  it('a panel wider than 60 % of the screen (bottom sheet) moves the margin to `abajo`, not to `izq`', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 1920 }),
        fc.integer({ min: 320, max: 1080 }),
        fc.double({ min: 0.61, max: 1, noNaN: true }),
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        (ancho, alto, frac, zoom) => {
          const pantalla = { ancho, alto }
          const barra: CajaHud = { left: 8, right: ancho - 8, top: alto - 60, bottom: alto - 8 }
          const hoja: CajaHud = {
            left: 8,
            right: 8 + frac * ancho,
            top: alto * 0.5,
            bottom: barra.top - 8,
          }
          const sin = margenesVida(pantalla, barra, undefined, zoom)
          const con = margenesVida(pantalla, barra, hoja, zoom)
          expect(con.izq).toBe(sin.izq)
          expect(con.abajo).toBeGreaterThanOrEqual(sin.abajo)
          expect(con.abajo).toBeGreaterThanOrEqual(alto - hoja.top + H)
          // A side card (narrower than 60 %) does the opposite: `izq` grows, `abajo` does not.
          const tarjeta: CajaHud = { ...hoja, right: 8 + 0.5 * ancho }
          const lado = margenesVida(pantalla, barra, tarjeta, zoom)
          expect(lado.abajo).toBe(sin.abajo)
          expect(lado.izq).toBeGreaterThan(sin.izq)
        },
      ),
      { numRuns: 200 },
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
      // The single bottom bar, in a row in both orientations.
      const barra: CajaHud = { left: 8, right: w - 8, top: h - 12 - 64, bottom: h - 12 }
      const caso: Caso = {
        pantalla: { ancho: w, alto: h },
        barra,
        panel: undefined,
        zoom: control.vista.zoom,
        reservaArriba: RESERVA_ARRIBA,
      }
      control.fijarMargenes(margenesVida(caso.pantalla, barra, undefined, control.vista.zoom), true)
      for (let i = 0; i < 400; i++) control.seguir({ x: qx * TAM, y: qy * TAM }, 16)
      const esperado = reposo(caso, qx * TAM, qy * TAM)
      expect(control.vista.cx, `${w}×${h}`).toBeCloseTo(esperado.cx, 0)
      expect(control.vista.cy, `${w}×${h}`).toBeCloseTo(esperado.cy, 0)
      const fr = franjas(caso, control.vista)
      expect(fr.izq, `${w}×${h}: west strip`).toBeLessThanOrEqual(2)
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
      reservaArriba: RESERVA_ARRIBA,
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
