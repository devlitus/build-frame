/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, buscarCamino, crearEstadoInicial, type EstadoJuego } from '../../src/core'
import { SeguidorCamino } from '../../src/game/seguirCamino'
import { CONFIG_TACTIL } from '../../src/game/joystick'
import {
  factorResolucion,
  mundoDePantalla,
  pantallaLogica,
  tamanoLienzo,
} from '../../src/game/resolucion'
import { ControlTactil } from '../../src/game/tactil'

vi.mock('phaser', () => ({
  default: { Core: { Events: { BLUR: 'blur', HIDDEN: 'hidden' } } },
}))

/** M2-04 rompedor: el seguimiento simulado con la colisión real del núcleo. */

const semilla = fc.integer({ min: 0, max: 2 ** 32 - 1 })

function simular(
  estado0: EstadoJuego,
  hasta: { x: number; y: number },
  delta: number,
): EstadoJuego {
  let estado = estado0
  const s = new SeguidorCamino()
  s.fijar(estado, estado.personaje, hasta)
  let n = 0
  while (s.destino && n < 20_000) {
    n++
    const c = s.siguiente(estado.personaje, delta)
    if (c) estado = aplicarComando(estado, c).estado
  }
  return estado
}

describe('seguimiento de la ruta con colisiones reales (propiedades)', () => {
  it('llega al centro de la casilla destino desde la aparición, con delta de 8 a 100 ms', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.integer({ min: 0, max: 95 }),
        fc.integer({ min: 0, max: 95 }),
        fc.constantFrom(8, 16, 33, 100),
        (s, cx, cy, delta) => {
          const e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          const ruta = buscarCamino(e, e.personaje, { x: cx + 0.5, y: cy + 0.5 })
          if (ruta.length === 0) return
          const fin = ruta[ruta.length - 1]!
          const p = simular(e, { x: cx + 0.5, y: cy + 0.5 }, delta).personaje
          expect(Math.hypot(p.x - fin.x, p.y - fin.y)).toBeLessThan(0.05)
        },
      ),
      { numRuns: 60 },
    )
  })

  it('desde posiciones no centradas dentro de la casilla también llega', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 95 }),
        fc.integer({ min: 0, max: 95 }),
        (s, fx, fy, cx, cy) => {
          const e0 = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          const cx0 = Math.floor(e0.personaje.x)
          const cy0 = Math.floor(e0.personaje.y)
          const e = {
            ...e0,
            personaje: { ...e0.personaje, x: cx0 + 0.3 + fx * 0.4, y: cy0 + 0.3 + fy * 0.4 },
          }
          const ruta = buscarCamino(e, e.personaje, { x: cx + 0.5, y: cy + 0.5 })
          if (ruta.length === 0) return
          const p = simular(e, { x: cx + 0.5, y: cy + 0.5 }, 16).personaje
          const fin = ruta[ruta.length - 1]!
          expect(Math.hypot(p.x - fin.x, p.y - fin.y)).toBeLessThan(0.05)
        },
      ),
      { numRuns: 60 },
    )
  })
})

// ---------------------------------------------------------------------------------------------
// E2E-16 · Rompedor: the Vida gestures of `ControlTactil` (src/game/tactil.ts) with a fake scene.
// Replaces the logic of tactil.spec / tactil-rompedor.spec (thresholds, right click, long click,
// second and third finger, touchcancel, hidden tab, rotate, joystick base and knob) and of
// m5-00-rompedor «joystick: 10 px es toque y 11 px es joystick» at every DPR.
// ---------------------------------------------------------------------------------------------

type Oyente = { f: (...a: unknown[]) => void; ctx: unknown; once?: boolean }
class Emisor {
  private readonly l = new Map<string, Oyente[]>()
  on(ev: string, f: (...a: unknown[]) => void, ctx?: unknown): this {
    this.l.set(ev, [...(this.l.get(ev) ?? []), { f, ctx }])
    return this
  }
  once(ev: string, f: (...a: unknown[]) => void, ctx?: unknown): this {
    this.l.set(ev, [...(this.l.get(ev) ?? []), { f, ctx, once: true }])
    return this
  }
  off(ev: string, f: (...a: unknown[]) => void, ctx?: unknown): this {
    this.l.set(
      ev,
      (this.l.get(ev) ?? []).filter((o) => o.f !== f || o.ctx !== ctx),
    )
    return this
  }
  emit(ev: string, ...a: unknown[]): void {
    const l = this.l.get(ev) ?? []
    this.l.set(
      ev,
      l.filter((o) => !o.once),
    )
    for (const o of l) o.f.apply(o.ctx, a)
  }
  cuenta(ev: string): number {
    return (this.l.get(ev) ?? []).length
  }
}

class ElementoFalso {
  hidden = false
  className = ''
  readonly style: Record<string, string> = {}
  readonly hijos: ElementoFalso[] = []
  quitado = false
  appendChild(h: ElementoFalso): void {
    this.hijos.push(h)
  }
  setAttribute(): void {}
  remove(): void {
    this.quitado = true
  }
}

interface PunteroFalso {
  id: number
  x: number
  y: number
  isDown: boolean
  wasTouch: boolean
  wasCanceled: boolean
  boton: number
  leftButtonDown(): boolean
}

const puntero = (id: number, x: number, y: number, tactil = true, boton = 0): PunteroFalso => ({
  id,
  x,
  y,
  isDown: false,
  wasTouch: tactil,
  wasCanceled: false,
  boton,
  leftButtonDown() {
    return this.isDown && this.boton === 0
  },
})

/** Fake scene: CSS screen `ancho`×`alto`, factor min(DPR, 2), a camera with zoom and scroll. */
function escenaTactil(ancho = 412, alto = 915, dpr = 1) {
  const k = factorResolucion(dpr)
  const padre = new ElementoFalso()
  const input = Object.assign(new Emisor(), {
    manager: { pointers: [] as PunteroFalso[] },
    mouse: { disableContextMenu: () => undefined },
  })
  const scale = Object.assign(new Emisor(), {
    zoom: 1 / k,
    width: tamanoLienzo(ancho, k),
    height: tamanoLienzo(alto, k),
  })
  const camara = { zoom: 0.8 * k, scrollX: 100, scrollY: 200 }
  const escena = {
    input,
    scale,
    game: { canvas: { parentElement: padre }, events: new Emisor() },
    events: new Emisor(),
    cameras: {
      main: {
        get zoom() {
          return camara.zoom
        },
        // Phaser without rotation, origin at the centre (see BaseCamera.getWorldPoint).
        getWorldPoint: (x: number, y: number) => ({
          x: (x - scale.width / 2) / camara.zoom + camara.scrollX + scale.width / 2,
          y: (y - scale.height / 2) / camara.zoom + camara.scrollY + scale.height / 2,
        }),
      },
    },
  }
  let reloj = 0
  vi.spyOn(performance, 'now').mockImplementation(() => reloj)
  const control = new ControlTactil(escena as never)
  const base = padre.hijos[0]!
  const mando = base.hijos[0]!
  const punteros = input.manager.pointers
  const bajar = (p: PunteroFalso) => {
    if (!punteros.includes(p)) punteros.push(p)
    p.isDown = true
    input.emit('pointerdown', p)
  }
  const mover = (p: PunteroFalso, x: number, y: number) => {
    p.x = x
    p.y = y
    input.emit('pointermove', p)
  }
  const soltar = (p: PunteroFalso, cancelado = false) => {
    p.isDown = false
    p.wasCanceled = cancelado
    input.emit('pointerup', p)
  }
  const esperar = (ms: number) => {
    reloj += ms
  }
  /** One short tap at (x, y): returns the destination it leaves (world px) or undefined. */
  const tocar = (x: number, y: number, id = 1) => {
    const p = puntero(id, x, y)
    bajar(p)
    esperar(50)
    soltar(p)
    return control.tomarDestino()
  }
  return { control, escena, base, mando, bajar, mover, soltar, esperar, tocar, scale, input }
}

describe('ControlTactil: tap, joystick and multi-touch (fake scene)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => new ElementoFalso(),
      body: new ElementoFalso(),
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('distance threshold: 10 px is a tap (destination), 11 px is the joystick (no destination)', () => {
    // Original e2e: tactil-rompedor.spec.ts «umbral de distancia: 10 px es toque, 11 px es joystick».
    const t = escenaTactil()
    const a = puntero(1, 200, 500)
    t.bajar(a)
    t.mover(a, 210, 500)
    expect(t.control.joystickVisible).toBe(false)
    t.soltar(a)
    expect(t.control.tomarDestino()).toBeDefined()
    const b = puntero(2, 200, 500)
    t.bajar(b)
    t.mover(b, 211, 500)
    expect(t.control.joystickVisible).toBe(true)
    expect(t.base.hidden).toBe(false)
    t.soltar(b)
    expect(t.control.tomarDestino()).toBeUndefined()
    expect(t.base.hidden).toBe(true)
  })

  it('time threshold: still for 600 ms is not a tap; 150 ms is (touch only)', () => {
    // Original e2e: tactil-rompedor.spec.ts «umbral de tiempo: 600 ms quieto no es un toque; 150 ms sí».
    const t = escenaTactil()
    const a = puntero(1, 200, 500)
    t.bajar(a)
    t.esperar(600)
    t.soltar(a)
    expect(t.control.tomarDestino()).toBeUndefined()
    const b = puntero(1, 200, 500)
    t.bajar(b)
    t.esperar(150)
    t.soltar(b)
    expect(t.control.tomarDestino()).toBeDefined()
  })

  it('property: a touch is a tap if and only if it moved ≤ 10 px and lasted < 300 ms', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        (d, ang, ms) => {
          vi.restoreAllMocks()
          const t = escenaTactil()
          const p = puntero(1, 206, 500)
          t.bajar(p)
          t.mover(p, 206 + d * Math.cos(ang), 500 + d * Math.sin(ang))
          t.esperar(ms)
          const joystick = t.control.joystickVisible
          t.soltar(p)
          const dist = Math.hypot(p.x - 206, p.y - 500)
          const esToque = dist <= CONFIG_TACTIL.umbralToquePx && ms < CONFIG_TACTIL.umbralToqueMs
          expect(t.control.tomarDestino() !== undefined).toBe(esToque)
          expect(joystick).toBe(dist > CONFIG_TACTIL.umbralToquePx)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('mouse: right and middle click set no destination; a left click held > 300 ms does', () => {
    // Original e2e: tactil-rompedor.spec.ts «el clic derecho no fija destino», «el clic central no
    // fija destino», «un clic mantenido más de 300 ms sin mover también fija destino».
    const t = escenaTactil(1280, 720)
    for (const boton of [1, 2]) {
      const p = puntero(0, 600, 300, false, boton)
      t.bajar(p)
      t.soltar(p)
      expect(t.control.tomarDestino(), `button ${boton}`).toBeUndefined()
    }
    const p = puntero(0, 600, 300, false, 0)
    t.bajar(p)
    t.esperar(900)
    t.soltar(p)
    expect(t.control.tomarDestino()).toBeDefined()
  })

  it('mouse drag never shows the joystick and does not set a destination', () => {
    // Original e2e: tactil.spec.ts «arrastrar con el ratón no mueve al personaje (no hay joystick)».
    const t = escenaTactil(1280, 720)
    const p = puntero(0, 600, 300, false, 0)
    t.bajar(p)
    t.mover(p, 700, 400)
    expect(t.control.joystickVisible).toBe(false)
    expect(t.control.leer()).toEqual({ dx: 0, dy: 0 })
    t.soltar(p)
    expect(t.control.tomarDestino()).toBeUndefined()
  })

  it('a second finger cancels the joystick and sets no destination; lifting the first leaves no stuck gesture', () => {
    // Original e2e: tactil.spec.ts «dos dedos cancelan el joystick y no fijan destino»;
    // tactil-rompedor.spec.ts «levantar el primer dedo dejando el segundo no deja el gesto atascado».
    const t = escenaTactil()
    const a = puntero(1, 206, 500)
    const b = puntero(2, 300, 400)
    t.bajar(a)
    t.mover(a, 206, 540)
    expect(t.control.joystickVisible).toBe(true)
    t.bajar(b)
    expect(t.control.joystickVisible).toBe(false)
    expect(t.base.hidden).toBe(true)
    expect(t.control.leer()).toEqual({ dx: 0, dy: 0 })
    t.soltar(a)
    t.mover(b, 300, 460)
    t.mover(b, 300, 520)
    expect(t.control.joystickVisible, 'the remaining finger must not become a joystick').toBe(false)
    t.soltar(b)
    expect(t.control.tomarDestino()).toBeUndefined()
    expect(t.tocar(200, 500), 'a later tap works again').toBeDefined()
  })

  it('three fingers: no joystick and no destination; then a tap works again', () => {
    // Original e2e: tactil-rompedor.spec.ts «tres dedos: sin errores, sin joystick y sin destino».
    const t = escenaTactil()
    const dedos = [puntero(1, 100, 500), puntero(2, 200, 500), puntero(3, 300, 500)]
    for (const d of dedos) t.bajar(d)
    for (const d of dedos) t.mover(d, d.x, 560)
    expect(t.control.joystickVisible).toBe(false)
    for (const d of dedos) t.soltar(d)
    expect(t.control.tomarDestino()).toBeUndefined()
    expect(t.tocar(200, 500)).toBeDefined()
  })

  it('a touch cancelled by the system (pointercancel) sets no destination, even if short', () => {
    // Original e2e: tactil.spec.ts «un toque cancelado por el sistema no fija destino».
    const t = escenaTactil()
    const p = puntero(1, 200, 500)
    t.bajar(p)
    t.soltar(p, true)
    expect(t.control.tomarDestino()).toBeUndefined()
  })

  it('touchcancel with the joystick active removes it and the intention goes to zero; a tap works after', () => {
    // Original e2e: tactil-rompedor.spec.ts «touchcancel con el joystick activo lo quita y el
    // personaje se para».
    const t = escenaTactil()
    const p = puntero(1, 206, 500)
    t.bajar(p)
    t.mover(p, 206, 560)
    expect(t.control.leer().dy).toBeGreaterThan(0)
    t.soltar(p, true)
    expect(t.control.joystickVisible).toBe(false)
    expect(t.control.leer()).toEqual({ dx: 0, dy: 0 })
    expect(t.tocar(200, 500)).toBeDefined()
  })

  it.each(['blur', 'hidden'])(
    'window %s with the joystick active releases it (does not keep walking)',
    (ev) => {
      // Original e2e: tactil-rompedor.spec.ts «pestaña oculta con el joystick activo: se suelta y
      // no sigue andando».
      const t = escenaTactil()
      const p = puntero(1, 206, 500)
      t.bajar(p)
      t.mover(p, 206, 560)
      ;(t.escena.game.events as Emisor).emit(ev)
      expect(t.control.joystickVisible).toBe(false)
      expect(t.control.leer()).toEqual({ dx: 0, dy: 0 })
      expect(t.base.hidden).toBe(true)
    },
  )

  it('rotating (resize) with the joystick active releases it and drops a pending destination', () => {
    // Original e2e: tactil-rompedor.spec.ts «girar el móvil con el joystick activo: la base sigue
    // dentro de la pantalla o se suelta».
    const t = escenaTactil()
    const p = puntero(1, 206, 800)
    t.bajar(p)
    t.mover(p, 206, 860)
    t.scale.emit('resize')
    expect(t.control.joystickVisible).toBe(false)
    expect(t.base.hidden).toBe(true)
    t.soltar(p)
    expect(t.control.tomarDestino()).toBeUndefined()
  })

  it('the joystick base is centred where the finger landed and the knob never passes the radius', () => {
    // Original e2e: tactil-rompedor.spec.ts «la base del joystick se centra donde se apoyó el dedo
    // y el mando no pasa del radio».
    const t = escenaTactil()
    const p = puntero(1, 200, 500)
    t.bajar(p)
    t.mover(p, 215, 500)
    t.mover(p, 380, 640)
    expect(t.base.style.left).toBe('200px')
    expect(t.base.style.top).toBe('500px')
    const m = /calc\(-50% \+ (-?[\d.e-]+)px\), calc\(-50% \+ (-?[\d.e-]+)px\)/.exec(
      t.mando.style.transform ?? '',
    )
    expect(m).not.toBeNull()
    const d = Math.hypot(Number(m?.[1]), Number(m?.[2]))
    expect(d).toBeLessThanOrEqual(CONFIG_TACTIL.radioJoystickPx + 1e-9)
    const i = t.control.leer()
    expect(Math.hypot(i.dx, i.dy)).toBeLessThanOrEqual(1 + 1e-12)
  })

  it('property: the joystick base never leaves the screen, wherever the finger lands (any DPR)', () => {
    // Original e2e: tactil-rompedor.spec.ts «el joystick cerca del borde de la pantalla no sale de
    // ella»; m5-00-rompedor «el joystick queda dentro de la pantalla» (DPR).
    fc.assert(
      fc.property(
        fc.integer({ min: 120, max: 2000 }),
        fc.integer({ min: 120, max: 2000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(1, 1.25, 2, 2.625, 3),
        (ancho, alto, fx, fy, dpr) => {
          vi.restoreAllMocks()
          const t = escenaTactil(ancho, alto, dpr)
          const x = fx * ancho
          const y = fy * alto
          const p = puntero(1, x, y)
          t.bajar(p)
          t.mover(p, x + 12, y)
          expect(t.control.joystickVisible).toBe(true)
          const cx = parseFloat(t.base.style.left ?? '')
          const cy = parseFloat(t.base.style.top ?? '')
          const r = CONFIG_TACTIL.baseJoystickPx / 2
          const pantalla = pantallaLogica(t.escena)
          expect(cx - r).toBeGreaterThanOrEqual(-1e-9)
          expect(cy - r).toBeGreaterThanOrEqual(-1e-9)
          expect(cx + r).toBeLessThanOrEqual(pantalla.ancho + 1e-9)
          expect(cy + r).toBeLessThanOrEqual(pantalla.alto + 1e-9)
        },
      ),
      { numRuns: 200 },
    )
  })

  it.each([1, 1.25, 2, 2.625, 3])(
    'DPR %f: the 10/11 px thresholds are CSS pixels and the tap lands on the world point under the finger',
    (dpr) => {
      // Original e2e: m5-00-rompedor.spec.ts «gestos con DPR n · joystick: 10 px es toque y 11 px
      // es joystick»; m5-00-final-rompedor «DPR 1→2→1→3→1,25→2 … toque coherentes».
      const t = escenaTactil(412, 915, dpr)
      const a = puntero(1, 150, 420)
      t.bajar(a)
      t.mover(a, 160, 420)
      expect(t.control.joystickVisible).toBe(false)
      t.soltar(a)
      // World point under the CSS pixel (160, 420): the camera works in device pixels (× k).
      expect(t.control.tomarDestino()).toEqual(mundoDePantalla(t.escena, 160, 420))
      const b = puntero(1, 150, 420)
      t.bajar(b)
      t.mover(b, 161, 420)
      expect(t.control.joystickVisible).toBe(true)
      t.soltar(b)
    },
  )

  it('inactive (Plano): taps and drags are ignored', () => {
    // Original e2e: tactil.spec.ts «en el Modo Plano el toque no mueve al personaje ni fija destino».
    const t = escenaTactil()
    t.control.activo = false
    expect(t.tocar(200, 500)).toBeUndefined()
    const p = puntero(1, 206, 500)
    t.bajar(p)
    t.mover(p, 206, 600)
    expect(t.control.joystickVisible).toBe(false)
    expect(t.control.leer()).toEqual({ dx: 0, dy: 0 })
  })

  it('scene shutdown removes its listeners and the joystick element', () => {
    const t = escenaTactil()
    expect(t.input.cuenta('pointerdown')).toBe(1)
    ;(t.escena.events as Emisor).emit('shutdown')
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside'])
      expect(t.input.cuenta(ev), ev).toBe(0)
    expect(t.scale.cuenta('resize')).toBe(0)
    expect(t.base.quitado).toBe(true)
  })
})
