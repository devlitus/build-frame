/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices conocidos en tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { CONFIG_CAMARA, limitesZoom, zoomInicial } from '../../src/game/camara/config'
import { ControlCamara } from '../../src/game/camara/controlCamara'
import { factorResolucion, mundoDePantalla, pantallaLogica } from '../../src/game/resolucion'
import { fakeCameraScene, fakePointer } from '../unit/fixtures/fake-scene'
import {
  limitarVista,
  medirDedos,
  pasoPellizco,
  transformar,
  type Vista,
} from '../../src/game/camara/matematica'

vi.mock('phaser', () => ({ default: {} }))

const MUNDO = 3072
const pantallaArb = fc.record({
  ancho: fc.integer({ min: 1, max: 4000 }),
  alto: fc.integer({ min: 1, max: 4000 }),
})
const puntoArb = fc.record({
  x: fc.double({ min: -5000, max: 9000, noNaN: true }),
  y: fc.double({ min: -5000, max: 9000, noNaN: true }),
})
const factorArb = fc.oneof(
  fc.double({ min: 0, max: 50, noNaN: true }),
  fc.constantFrom(0, Infinity, 1e-300, 1e300),
)
const gestoArb = fc.record({ desde: puntoArb, hasta: puntoArb, factor: factorArb })

function validar(v: Vista, p: { ancho: number; alto: number }, lim: { min: number; max: number }) {
  for (const n of [v.zoom, v.cx, v.cy]) expect(Number.isFinite(n)).toBe(true)
  expect(v.zoom).toBeGreaterThanOrEqual(lim.min - 1e-12)
  expect(v.zoom).toBeLessThanOrEqual(lim.max + 1e-12)
  for (const [c, pant] of [
    [v.cx, p.ancho],
    [v.cy, p.alto],
  ] as const) {
    const vis = pant / v.zoom
    if (vis >= MUNDO) expect(c).toBeCloseTo(MUNDO / 2, 6)
    else {
      expect(c - vis / 2).toBeGreaterThanOrEqual(-1e-6)
      expect(c + vis / 2).toBeLessThanOrEqual(MUNDO + 1e-6)
    }
  }
}

describe('cámara: propiedades', () => {
  it('secuencias aleatorias de gestos: finito, en límites, zoom en [min,max]', () => {
    fc.assert(
      fc.property(pantallaArb, fc.array(gestoArb, { maxLength: 40 }), (p, gestos) => {
        const lim = limitesZoom(p, MUNDO)
        let v: Vista = { zoom: zoomInicial(p, MUNDO), cx: MUNDO / 2, cy: MUNDO / 2 }
        for (const g of gestos) {
          v = transformar(v, p, g.desde, g.hasta, g.factor, lim, MUNDO)
          validar(v, p, lim)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('pellizco con dedos superpuestos (distancia 0) no cambia el zoom a mínimo', () => {
    fc.assert(
      fc.property(pantallaArb, puntoArb, (p, a) => {
        const lim = limitesZoom(p, MUNDO)
        const v: Vista = { zoom: lim.max, cx: MUNDO / 2, cy: MUNDO / 2 }
        const r = pasoPellizco(
          v,
          p,
          medirDedos(a, { x: a.x + 80, y: a.y }),
          medirDedos(a, a),
          lim,
          MUNDO,
        )
        validar(r, p, lim)
        expect(r.zoom).toBe(v.zoom)
      }),
    )
  })

  it('zoom inicial >= 0.6 siempre que el mínimo lo permita', () => {
    fc.assert(
      fc.property(pantallaArb, (p) => {
        const lim = limitesZoom(p, MUNDO)
        expect(zoomInicial(p, MUNDO)).toBeGreaterThanOrEqual(Math.min(0.6, lim.max))
      }),
    )
  })

  it('pantalla de tamaño 0 no produce NaN', () => {
    const p = { ancho: 0, alto: 0 }
    const lim = limitesZoom(p, MUNDO)
    const v = transformar(
      { zoom: 0.6, cx: 100, cy: 100 },
      p,
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      1,
      lim,
      MUNDO,
    )
    expect(Number.isFinite(v.cx) && Number.isFinite(v.cy) && v.zoom > 0).toBe(true)
  })

  it('limitarVista es idempotente', () => {
    fc.assert(
      fc.property(
        pantallaArb,
        puntoArb,
        fc.double({ min: 0.01, max: 2.5, noNaN: true }),
        (p, c, zoom) => {
          const a = limitarVista({ zoom, cx: c.x, cy: c.y }, p, MUNDO)
          const b = limitarVista(a, p, MUNDO)
          expect(b.cx).toBeCloseTo(a.cx, 9)
          expect(b.cy).toBeCloseTo(a.cy, 9)
        },
      ),
    )
  })
})

// ---------------------------------------------------------------------------------------------
// E2E-16 · Rompedor: `ControlCamara` (src/game/camara/controlCamara.ts) driven by fake pointers.
// Replaces the camera logic of camara.spec, camara-rompedor.spec, modos(-rompedor).spec (keyboard
// pan/zoom in Plano, drag ignored in Life) and m5-00-rompedor «pellizco: acerca y mantiene el punto
// bajo los dedos» at every DPR. What stays in e2e: T4 (real pinch), T8 (real mouse), B4 (resize).
// ---------------------------------------------------------------------------------------------

class RuedaFalsa {
  constructor(readonly deltaMode: number) {}
}

function controlPlano(ancho = 1280, alto = 720, dpr = 1) {
  const f = fakeCameraScene(ancho, alto, dpr)
  const control = new ControlCamara(f.scene as never, MUNDO)
  const rueda = (x: number, y: number, dy: number, modo = 0) => {
    const p = fakePointer(0, x, y, false)
    p.event = new RuedaFalsa(modo)
    f.input.emit('wheel', p, [], 0, dy, 0)
  }
  /** World point under a CSS screen point, read back from the fake Phaser camera. */
  const bajo = (x: number, y: number) => mundoDePantalla(f.scene as never, x, y)
  const pantalla = () => pantallaLogica(f.scene as never)
  return { ...f, control, rueda, bajo, pantalla }
}

function validarControl(c: ReturnType<typeof controlPlano>) {
  const v = c.control.vista
  const p = c.pantalla()
  validar(v, p, limitesZoom(p, MUNDO))
}

describe('ControlCamara with fake pointers', () => {
  beforeEach(() => {
    vi.stubGlobal('WheelEvent', RuedaFalsa)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('dragging with the mouse moves the view the opposite way, exactly the dragged distance', () => {
    // Original e2e: camara.spec.ts «arrastrar desplaza la cámara en sentido contrario».
    const c = controlPlano()
    c.control.zoomCentro(2) // leave room to move on both axes
    const antes = c.control.vista
    const p = fakePointer(0, 600, 400, false)
    c.down(p)
    c.move(p, 500, 350)
    c.up(p)
    const v = c.control.vista
    expect(v.cx - antes.cx).toBeCloseTo(100 / v.zoom, 9)
    expect(v.cy - antes.cy).toBeCloseTo(50 / v.zoom, 9)
  })

  it('right or middle button dragging does not move the camera', () => {
    // Original e2e: camara-rompedor.spec.ts «clic derecho o central arrastrando no debería desplazar la cámara».
    const c = controlPlano()
    c.control.zoomCentro(2)
    const antes = c.control.vista
    for (const boton of [1, 2]) {
      const p = fakePointer(0, 600, 400, false, boton)
      c.down(p)
      c.move(p, 300, 100)
      c.up(p)
    }
    expect(c.control.vista).toEqual(antes)
  })

  it('the wheel zooms keeping the world point under the cursor (Plano), within min and max', () => {
    // Original e2e: camara.spec.ts «la rueda acerca y aleja manteniendo el punto bajo el cursor» and
    // «el zoom tiene mínimo y máximo».
    const c = controlPlano()
    const antes = c.bajo(900, 300)
    c.rueda(900, 300, -100)
    const d = c.bajo(900, 300)
    expect(d.x).toBeCloseTo(antes.x, 6)
    expect(d.y).toBeCloseTo(antes.y, 6)
    for (let i = 0; i < 50; i++) c.rueda(640, 360, -500)
    expect(c.control.vista.zoom).toBe(CONFIG_CAMARA.zoomMax)
    for (let i = 0; i < 50; i++) c.rueda(640, 360, 500)
    expect(c.control.vista.zoom).toBe(limitesZoom(c.pantalla(), MUNDO).min)
  })

  it('wheel in lines (Firefox deltaMode 1): one notch changes the zoom by more than 5 %', () => {
    // Original e2e: camara-rompedor.spec.ts «rueda con deltaMode de líneas (Firefox): una muesca debe notarse (>5 %)».
    const c = controlPlano()
    const z0 = c.control.vista.zoom
    c.rueda(640, 360, -3, 1)
    expect(c.control.vista.zoom / z0).toBeGreaterThan(1.05)
    const z1 = c.control.vista.zoom
    c.rueda(640, 360, -1, 2) // one page
    expect(c.control.vista.zoom).toBeGreaterThan(z1)
  })

  it('property: any wheel delta (huge, 0, negative, NaN-free) leaves the camera finite and in range', () => {
    // Original e2e: camara-rompedor.spec.ts «rueda con deltaY enorme, 0 y negativo deja la cámara finita y en rango».
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dy: fc.oneof(
              fc.double({ min: -1e6, max: 1e6, noNaN: true }),
              fc.constantFrom(0, -0, 1e300, -1e300),
            ),
            modo: fc.constantFrom(0, 1, 2),
            x: fc.integer({ min: 0, max: 1280 }),
            y: fc.integer({ min: 0, max: 720 }),
          }),
          { maxLength: 30 },
        ),
        (ruedas) => {
          const c = controlPlano()
          for (const r of ruedas) {
            c.rueda(r.x, r.y, r.dy, r.modo)
            validarControl(c)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('dragging a lot never takes the centre out of the valley', () => {
    // Original e2e: camara.spec.ts «arrastrar mucho no saca el centro de la cámara del valle».
    const c = controlPlano()
    c.control.zoomCentro(2)
    for (const [dx, dy] of [
      [5000, 5000],
      [-9000, 0],
      [0, -9000],
      [9000, 9000],
    ] as const) {
      const p = fakePointer(0, 640, 360, false)
      c.down(p)
      c.move(p, 640 + dx, 360 + dy)
      c.up(p)
      validarControl(c)
    }
  })

  it('pinch (touch) zooms around the midpoint of the fingers, at every DPR', () => {
    // Original e2e: camara.spec.ts «pellizcar acerca y mantiene el punto medio de los dedos»;
    // m5-00-rompedor.spec.ts «gestos con DPR n · pellizco: acerca y mantiene el punto bajo los dedos».
    for (const dpr of [1, 1.25, 2, 2.625, 3]) {
      const c = controlPlano(412, 915, dpr)
      const medio = { x: 206, y: 450 }
      const antes = c.bajo(medio.x, medio.y)
      const a = fakePointer(1, 156, 450)
      const b = fakePointer(2, 256, 450)
      c.down(a)
      c.down(b)
      c.move(a, 106, 450)
      c.move(b, 306, 450)
      const despues = c.bajo(medio.x, medio.y)
      expect(c.control.vista.zoom, `DPR ${dpr}`).toBeGreaterThan(zoomInicial(c.pantalla(), MUNDO))
      expect(despues.x, `DPR ${dpr}`).toBeCloseTo(antes.x, 6)
      expect(despues.y, `DPR ${dpr}`).toBeCloseTo(antes.y, 6)
      // The Phaser camera works in device pixels: logical zoom × min(DPR, 2).
      expect(c.main.zoom).toBeCloseTo(c.control.vista.zoom * factorResolucion(dpr), 9)
    }
  })

  it('pinching in never goes below the minimum zoom', () => {
    // Original e2e: camara.spec.ts «juntar los dedos aleja y el zoom no baja del mínimo».
    const c = controlPlano(412, 915)
    for (let i = 0; i < 20; i++) {
      const a = fakePointer(1, 100, 450)
      const b = fakePointer(2, 300, 450)
      c.down(a)
      c.down(b)
      c.move(a, 199, 450)
      c.move(b, 201, 450)
      c.up(a)
      c.up(b)
    }
    expect(c.control.vista.zoom).toBe(limitesZoom(c.pantalla(), MUNDO).min)
  })

  it('going from one to two fingers (and back) does not jump', () => {
    // Original e2e: camara.spec.ts «pasar de uno a dos dedos no da saltos»; camara-rompedor.spec.ts
    // «levantar un dedo a mitad del pellizco y seguir arrastrando no salta».
    const c = controlPlano(412, 915)
    c.control.zoomCentro(2)
    const a = fakePointer(1, 200, 500)
    c.down(a)
    c.move(a, 200, 490)
    const tras1 = c.control.vista
    const b = fakePointer(2, 300, 300)
    c.down(b) // second finger lands far away: no jump
    expect(c.control.vista).toEqual(tras1)
    c.move(a, 200, 490) // same place: no change
    expect(c.control.vista).toEqual(tras1)
    c.up(b) // lift the second one mid-pinch
    expect(c.control.vista).toEqual(tras1)
    c.move(a, 195, 490)
    expect(Math.abs(c.control.vista.cx - tras1.cx)).toBeLessThan(5 / tras1.zoom + 1e-9)
    expect(c.control.vista.zoom).toBe(tras1.zoom)
  })

  it('overlapping fingers (distance 0) do not sink the zoom to the minimum', () => {
    // Original e2e: camara-rompedor.spec.ts «dedos superpuestos (distancia 0) no hunden el zoom al mínimo».
    const c = controlPlano(412, 915)
    c.control.zoomCentro(2)
    const z = c.control.vista.zoom
    const a = fakePointer(1, 200, 450)
    const b = fakePointer(2, 280, 450)
    c.down(a)
    c.down(b)
    c.move(b, 200, 450)
    c.move(a, 200, 450)
    expect(c.control.vista.zoom).toBeGreaterThan(z * 0.5)
    validarControl(c)
  })

  it('three fingers: finite, in range, and the zoom does not jump (only the first two count)', () => {
    // Original e2e: camara-rompedor.spec.ts «tres dedos no producen NaN ni saltos de zoom».
    const c = controlPlano(412, 915)
    c.control.zoomCentro(2)
    const z = c.control.vista.zoom
    const dedos = [fakePointer(1, 100, 400), fakePointer(2, 200, 400), fakePointer(3, 300, 400)]
    for (const d of dedos) c.down(d)
    c.move(dedos[2]!, 400, 800) // the third finger moves a lot: ignored
    expect(Math.abs(c.control.vista.zoom - z)).toBeLessThan(z * 0.2)
    for (const d of dedos) c.move(d, d.x + 3, d.y + 3)
    validarControl(c)
  })

  it('resize with the maximum zoom and moved away keeps the limits and the centre', () => {
    // Original e2e: camara-rompedor.spec.ts «redimensionar con zoom máximo y desplazado mantiene
    // límites y el centro»; «girar el móvil con zoom máximo y desplazado queda dentro de límites».
    const c = controlPlano()
    for (let i = 0; i < 30; i++) c.rueda(640, 360, -500)
    const p = fakePointer(0, 640, 360, false)
    c.down(p)
    c.move(p, 300, 200)
    c.up(p)
    const antes = c.control.vista
    c.resize(900, 500)
    expect(Math.abs(c.control.vista.cx - antes.cx)).toBeLessThan(2)
    expect(Math.abs(c.control.vista.cy - antes.cy)).toBeLessThan(2)
    validarControl(c)
    c.resize(412, 915, 2.625)
    validarControl(c)
    c.resize(915, 412, 2.625)
    validarControl(c)
  })

  it('a tiny window (smaller than a tile, even 0×0) never produces NaN', () => {
    // Original e2e: camara-rompedor.spec.ts «ventana diminuta (menor que una casilla) no produce NaN».
    const c = controlPlano()
    for (const [w, h] of [
      [10, 10],
      [1, 1],
      [0, 0],
      [3000, 5],
    ] as const) {
      c.resize(w, h)
      c.rueda(0, 0, -300)
      c.rueda(0, 0, 300)
      const v = c.control.vista
      expect([v.zoom, v.cx, v.cy].every(Number.isFinite), `${w}×${h}`).toBe(true)
      expect(v.zoom).toBeGreaterThan(0)
    }
    c.resize(1280, 720)
    validarControl(c)
  })

  it('Life (no drag): a drag does not move the camera; the wheel zooms around the screen centre', () => {
    // Original e2e: modos.spec.ts «en Vida el arrastre no mueve la cámara; la rueda hace zoom»;
    // tactil-rompedor.spec.ts «arrastrar con el ratón en Vida no mueve la cámara ni al personaje».
    const c = controlPlano()
    c.control.arrastreActivo = false
    c.control.seguirActivo = true
    const antes = c.control.vista
    const p = fakePointer(0, 600, 400, false)
    c.down(p)
    c.move(p, 300, 100)
    c.up(p)
    expect(c.control.vista).toEqual(antes)
    const centro = c.bajo(640, 360)
    c.rueda(100, 100, -200)
    expect(c.control.vista.zoom).toBeGreaterThan(antes.zoom)
    const ahora = c.bajo(640, 360)
    expect(ahora.x).toBeCloseTo(centro.x, 6)
    expect(ahora.y).toBeCloseTo(centro.y, 6)
  })

  it('Plano keyboard: held WASD and +/- for seconds stay within the valley and the zoom limits', () => {
    // Original e2e: modos-rompedor.spec.ts «zoom del teclado en Plano no sale de los límites…» and
    // «desplazar con el teclado en Plano con zoom alto: la cámara no sale del valle»; modos.spec.ts
    // «en Plano WASD desplazan la cámara y +/- hacen zoom».
    const c = controlPlano()
    const antes = c.control.vista
    c.control.desplazar(CONFIG_CAMARA.velocidadTecladoPx * 0.016, 0)
    expect(c.control.vista.cx).toBeGreaterThan(antes.cx)
    const z0 = c.control.vista.zoom
    c.control.zoomCentro(Math.pow(CONFIG_CAMARA.zoomTeclaPorSegundo, 0.016))
    expect(c.control.vista.zoom).toBeGreaterThan(z0)
    for (let i = 0; i < 600; i++) {
      c.control.zoomCentro(Math.pow(CONFIG_CAMARA.zoomTeclaPorSegundo, 0.05))
      c.control.desplazar(30, -30)
      validarControl(c)
    }
    expect(c.control.vista.zoom).toBe(CONFIG_CAMARA.zoomMax)
    for (let i = 0; i < 600; i++) {
      c.control.zoomCentro(Math.pow(CONFIG_CAMARA.zoomTeclaPorSegundo, -0.05))
      c.control.desplazar(-30, 30)
      validarControl(c)
    }
    expect(c.control.vista.zoom).toBe(limitesZoom(c.pantalla(), MUNDO).min)
  })

  it('following (Life) reaches the target and then stops chasing, so a manual move is kept', () => {
    // Original e2e: modos-rompedor.spec.ts «en Plano la cámara no se mueve sola tras soltar las
    // teclas»; personaje-render-rompedor «la cámara se mantiene dentro del valle caminando mucho».
    const c = controlPlano()
    c.control.zoomCentro(2)
    c.control.seguirActivo = true
    const objetivo = { x: 1500, y: 1500 }
    for (let i = 0; i < 300; i++) c.control.seguir(objetivo, 16)
    expect(c.control.vista.cx).toBeCloseTo(1500, 0)
    c.control.desplazar(100, 0)
    const movida = c.control.vista
    for (let i = 0; i < 50; i++) c.control.seguir(objetivo, 16) // same target, character still
    expect(c.control.vista).toEqual(movida)
    for (let x = 0; x <= MUNDO; x += 64) {
      c.control.seguir({ x, y: MUNDO - x }, 16)
      validarControl(c)
    }
  })
})

describe('ControlCamara: reaching the edges and coming back from the Plano', () => {
  beforeEach(() => {
    vi.stubGlobal('WheelEvent', RuedaFalsa)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [1280, 720],
    [412, 915],
  ])(
    '%i×%i, min and max zoom: dragging reaches the four edges and never shows more than half a screen past them',
    (w, h) => {
      // Original e2e: m1-global-rompedor.spec.ts «<caso>, zoom <extremo>: se alcanzan las cuatro
      // esquinas y los cuatro bordes».
      for (const extremo of ['max', 'min'] as const) {
        const c = controlPlano(w, h)
        for (let i = 0; i < 40; i++) c.rueda(w / 2, h / 2, extremo === 'max' ? -500 : 500)
        const lim = limitesZoom(c.pantalla(), MUNDO)
        expect(c.control.vista.zoom).toBe(extremo === 'max' ? lim.max : lim.min)
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
        ] as const) {
          c.control.centrarEn({ x: MUNDO / 2, y: MUNDO / 2 })
          for (let k = 0; k < 20; k++) {
            const p = fakePointer(0, w / 2, h / 2, false)
            c.down(p)
            c.move(p, w / 2 + dx * 400, h / 2 + dy * 400)
            c.up(p)
          }
          const v = c.control.vista
          const x0 = v.cx - w / 2 / v.zoom
          const x1 = v.cx + w / 2 / v.zoom
          const y0 = v.cy - h / 2 / v.zoom
          const y1 = v.cy + h / 2 / v.zoom
          const msg = `${extremo} ${dx},${dy}`
          if (dx > 0) expect(x0, msg).toBeLessThanOrEqual(0.5)
          if (dx < 0) expect(x1, msg).toBeGreaterThanOrEqual(MUNDO - 0.5)
          if (dy > 0) expect(y0, msg).toBeLessThanOrEqual(0.5)
          if (dy < 0) expect(y1, msg).toBeGreaterThanOrEqual(MUNDO - 0.5)
          validarControl(c)
        }
      }
    },
  )

  it('Life after the Plano: with a corner parcel guided past the edge, the view goes back inside the valley', () => {
    // Original e2e: m1-global-rompedor.spec.ts «Vida tras el Plano: la vista vuelve a quedar dentro
    // del valle · con un panel abierto en una esquina del Plano» and «· con los márgenes que dejó el
    // Plano (sin panel)».
    for (const esquina of [
      { x: 16, y: 16 },
      { x: 16, y: MUNDO - 16 },
    ]) {
      const c = controlPlano(412, 915)
      c.control.zoomCentro(2)
      c.control.fijarMargenes({ arriba: 120, abajo: 400, izq: 24, der: 24 })
      c.control.guiarA(esquina)
      for (let i = 0; i < 500 && c.control.guiando; i++) c.control.avanzarGuia(16)
      // To Life, in the order of `EscenaValle.aplicarModo`: no drag, follow on (drops the
      // extension), then the Life margins (none here: no tool bar) with a jump.
      c.control.arrastreActivo = false
      c.control.seguirActivo = true
      c.control.fijarMargenes(undefined, true)
      validarControl(c)
    }
  })
})

describe('ControlCamara: scene shutdown', () => {
  it('removes every listener, so restarting the valley does not double the wheel zoom or the drag', () => {
    // Original e2e: personaje-render-rompedor.spec.ts «reiniciar la escena varias veces no duplica
    // el zoom de la rueda ni los objetos»; m1-global «reiniciarValle: … los gestos no se duplican».
    const f = fakeCameraScene(1280, 720)
    new ControlCamara(f.scene as never, MUNDO)
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside', 'wheel'])
      expect(f.input.cuenta(ev), ev).toBe(1)
    f.scene.events.emit('shutdown')
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside', 'wheel'])
      expect(f.input.cuenta(ev), ev).toBe(0)
    expect(f.scale.cuenta('resize')).toBe(0)
  })
})
