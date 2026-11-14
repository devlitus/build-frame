/**
 * Minimal stand-ins for the Phaser scene pieces that `ControlCamara` reads (E2E-16). No Phaser:
 * an event emitter, pointers with `isDown`/`wasTouch`, the scale manager (`zoom = 1 / factor`) and
 * a main camera that records `setZoom`/`setScroll` like Phaser's (origin at the centre).
 */
import { factorResolucion, tamanoLienzo } from '../../../src/game/resolucion'

type Oyente = { f: (...a: unknown[]) => void; ctx: unknown; once?: boolean }

export class Emisor {
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

export interface FakePointer {
  id: number
  x: number
  y: number
  isDown: boolean
  wasTouch: boolean
  wasCanceled: boolean
  /** 0 left, 1 middle, 2 right. */
  button: number
  event?: unknown
  leftButtonDown(): boolean
}

export function fakePointer(id: number, x: number, y: number, touch = true, button = 0) {
  const p: FakePointer = {
    id,
    x,
    y,
    isDown: false,
    wasTouch: touch,
    wasCanceled: false,
    button,
    leftButtonDown() {
      return this.isDown && this.button === 0
    },
  }
  return p
}

/** Scene with a CSS screen of `width`×`height` and a device pixel ratio `dpr`. */
export function fakeCameraScene(width: number, height: number, dpr = 1) {
  const k = factorResolucion(dpr)
  const input = Object.assign(new Emisor(), { manager: { pointers: [] as FakePointer[] } })
  const scale = Object.assign(new Emisor(), {
    zoom: 1 / k,
    width: tamanoLienzo(width, k),
    height: tamanoLienzo(height, k),
  })
  const main = {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    get width() {
      return scale.width
    },
    get height() {
      return scale.height
    },
    setZoom(z: number) {
      main.zoom = z
      return main
    },
    setScroll(x: number, y: number) {
      main.scrollX = x
      main.scrollY = y
      return main
    },
    getWorldPoint(x: number, y: number) {
      return {
        x: (x - scale.width / 2) / main.zoom + main.scrollX + scale.width / 2,
        y: (y - scale.height / 2) / main.zoom + main.scrollY + scale.height / 2,
      }
    },
  }
  const game = { events: new Emisor() }
  const scene = { input, scale, cameras: { main }, events: new Emisor(), game }
  const pointers = input.manager.pointers
  const down = (p: FakePointer) => {
    if (!pointers.includes(p)) pointers.push(p)
    p.isDown = true
    input.emit('pointerdown', p)
  }
  const move = (p: FakePointer, x: number, y: number) => {
    p.x = x
    p.y = y
    input.emit('pointermove', p)
  }
  const up = (p: FakePointer, cancelled = false) => {
    p.isDown = false
    p.wasCanceled = cancelled
    input.emit('pointerup', p)
  }
  /** Changes the CSS size (and DPR) and fires Phaser's `resize`. */
  const resize = (w: number, h: number, newDpr = dpr) => {
    const f = factorResolucion(newDpr)
    scale.zoom = 1 / f
    scale.width = tamanoLienzo(w, f)
    scale.height = tamanoLienzo(h, f)
    scale.emit('resize')
  }
  /** CSS screen point of the centre of tile (tx, ty) for the current camera (as `puntoClicCasilla`). */
  const tileCentre = (tx: number, ty: number, tile = 32) => {
    const k = 1 / scale.zoom
    const zoom = main.zoom / k
    const cx = main.scrollX + scale.width / 2
    const cy = main.scrollY + scale.height / 2
    return {
      x: ((tx + 0.5) * tile - cx) * zoom + scale.width / k / 2,
      y: ((ty + 0.5) * tile - cy) * zoom + scale.height / k / 2,
    }
  }
  return { scene, input, scale, main, game, down, move, up, resize, tileCentre }
}
