import type { Page } from '@playwright/test'

/**
 * Measurable "the interface does not cover the game" rule (E2E-14). One `evaluate` computes:
 * - canvas L = canvas rect ∩ viewport;
 * - the opaque boxes of everything visible under `.hud` (see `measureInterface`), clipped to L;
 * - coverage = exact area of their union (coordinate compression) / area of L;
 * - focus areas that must stay visible (Vida: 7×7 tiles around the character; Plano: silhouette,
 *   chosen building, chosen parcel, brush cursor);
 * - reachable controls (size, inside viewport, no overlaps, no clipped text).
 * Thresholds live in the spec, not here.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface FocusCheck {
  name: string
  /** Fraction of the area (inside the canvas) that is not covered, 0..1. */
  visible: number
  /** Fraction of the area that is inside the canvas, 0..1. */
  inside: number
  /** Covered area in px². */
  covered: number
  ok: boolean
  /** The measured area in viewport CSS px (for overlays); absent if it could not be computed. */
  area?: Rect
  /** Why it failed, if it did. */
  detail: string
}

export interface InterfaceReport {
  viewport: { w: number; h: number }
  /** Canvas ∩ viewport; undefined if there is no canvas. */
  canvas: Rect | undefined
  /** Union area of the opaque boxes / canvas area, 0..1. */
  coverage: number
  /** Number of opaque boxes counted. */
  boxes: number
  /** Opaque boxes (already clipped to the canvas), for debugging and screenshots. */
  rects: Rect[]
  mode: 'vida' | 'plano' | undefined
  focus: FocusCheck[]
  /** Control problems, one text each; empty if all controls are reachable. */
  controls: string[]
}

export interface MeasureOptions {
  /** Radius (Chebyshev, in tiles) of the square that must stay free around the character in Vida. */
  radius?: number
  /** Minimum visible fraction of the chosen parcel in Plano. */
  parcelMin?: number
  /** Tiles per parcel side (needed for the chosen parcel). */
  parcelTiles?: number
  /** Minimum size of a control, in CSS px. */
  minControl?: number
}

/**
 * Measures the interface over the current page. Opaque = visible (`checkVisibility` with opacity
 * and visibility, effective opacity >= 0.2, not `.solo-lector`, not the joystick) and one of:
 * background alpha >= 0.2, background image, visible border, BUTTON/IMG/SVG/INPUT, or own text
 * (counted by its line boxes). `pointer-events` does not matter: it is about what is drawn.
 */
export async function measureInterface(
  page: Page,
  options: MeasureOptions = {},
): Promise<InterfaceReport> {
  const opts = {
    radius: options.radius ?? 3,
    parcelMin: options.parcelMin ?? 0.5,
    parcelTiles: options.parcelTiles ?? 16,
    minControl: options.minControl ?? 44,
  }
  return page.evaluate((o) => {
    type R = { x: number; y: number; w: number; h: number }
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight

    const inter = (a: R, b: R): R | undefined => {
      const x0 = Math.max(a.x, b.x)
      const y0 = Math.max(a.y, b.y)
      const x1 = Math.min(a.x + a.w, b.x + b.w)
      const y1 = Math.min(a.y + a.h, b.y + b.h)
      return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : undefined
    }
    /** Exact union area by coordinate compression. */
    const unionArea = (rects: R[]): number => {
      if (rects.length === 0) return 0
      const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b)
      const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b)
      const xi = new Map(xs.map((v, i) => [v, i]))
      const yi = new Map(ys.map((v, i) => [v, i]))
      const nx = xs.length - 1
      const grid = new Uint8Array(nx * (ys.length - 1))
      for (const r of rects) {
        const x0 = xi.get(r.x) as number
        const x1 = xi.get(r.x + r.w) as number
        const y0 = yi.get(r.y) as number
        const y1 = yi.get(r.y + r.h) as number
        for (let j = y0; j < y1; j++) grid.fill(1, j * nx + x0, j * nx + x1)
      }
      let area = 0
      for (let j = 0; j < ys.length - 1; j++)
        for (let i = 0; i < nx; i++)
          if (grid[j * nx + i])
            area +=
              ((xs[i + 1] as number) - (xs[i] as number)) *
              ((ys[j + 1] as number) - (ys[j] as number))
      return area
    }

    // ---- Canvas ∩ viewport
    const canvasEl = document.querySelector('canvas')
    let canvas: R | undefined
    if (canvasEl) {
      const b = canvasEl.getBoundingClientRect()
      canvas = inter({ x: b.left, y: b.top, w: b.width, h: b.height }, { x: 0, y: 0, w: vw, h: vh })
    }

    // ---- Opaque boxes under .hud
    const alphaOf = (color: string): number => {
      if (color === 'transparent') return 0
      const m = /^(?:rgba?|color)\((.*)\)$/.exec(color.trim())
      if (!m) return 1
      const body = (m[1] as string).replace(/^srgb\s*/, '')
      const slash = body.split('/')
      if (slash.length === 2) return Number.parseFloat(slash[1] as string)
      const parts = body.split(/[\s,]+/).filter(Boolean)
      return parts.length === 4 ? Number.parseFloat(parts[3] as string) : 1
    }
    const hudRoots = [...document.querySelectorAll('.hud')]
    const opaque: R[] = []
    const controlEls: HTMLElement[] = []
    const overflowing: string[] = []
    const label = (el: Element): string => {
      const aria = el.getAttribute('aria-label')
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)
      const cls =
        typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''
      return `${el.tagName.toLowerCase()}${cls}[${aria ?? text}]`
    }
    for (const root of hudRoots) {
      for (const el of root.querySelectorAll('*')) {
        if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue
        if (el.closest('.solo-lector, .joystick-base')) continue
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const cs = getComputedStyle(el)
        // Effective opacity (product over ancestors up to the root) and clipping ancestors.
        let opacity = 1
        let clip: R | undefined
        let clippedAway = false
        for (let a: Element | null = el; a && a !== root.parentElement; a = a.parentElement) {
          const acs = getComputedStyle(a)
          opacity *= Number.parseFloat(acs.opacity)
          if (acs.overflowX !== 'visible' || acs.overflowY !== 'visible') {
            const b = a.getBoundingClientRect()
            const r = { x: b.left, y: b.top, w: b.width, h: b.height }
            const c = clip ? inter(clip, r) : r
            if (c) clip = c
            else clippedAway = true
          }
        }
        // Visually hidden (1 px box with overflow hidden / clip-path) counts as invisible.
        if (clippedAway || opacity < 0.2 || (clip && clip.w <= 1 && clip.h <= 1)) continue
        const push = (r: R): void => {
          const c = clip ? inter(r, clip) : r
          const l = c && canvas ? inter(c, canvas) : undefined
          if (l) opaque.push(l)
        }
        const b = el.getBoundingClientRect()
        const box = { x: b.left, y: b.top, w: b.width, h: b.height }
        if (box.w <= 0 || box.h <= 0) continue
        const tag = el.tagName.toUpperCase()
        const bg = alphaOf(cs.backgroundColor) * opacity >= 0.2
        const image = cs.backgroundImage !== 'none'
        const border = ['top', 'right', 'bottom', 'left'].some((s) => {
          const st = cs.getPropertyValue(`border-${s}-style`)
          const wd = Number.parseFloat(cs.getPropertyValue(`border-${s}-width`))
          return (
            st !== 'none' &&
            st !== 'hidden' &&
            wd > 0 &&
            alphaOf(cs.getPropertyValue(`border-${s}-color`)) > 0
          )
        })
        const widget = ['BUTTON', 'IMG', 'SVG', 'INPUT'].includes(tag)
        if (bg || image || border || widget) push(box)
        else {
          // Own text: its line boxes (a transparent container with text covers only the text).
          for (const n of el.childNodes) {
            if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? '').trim()) continue
            const range = document.createRange()
            range.selectNodeContents(n)
            for (const t of range.getClientRects())
              if (t.width > 0 && t.height > 0)
                push({ x: t.left, y: t.top, w: t.width, h: t.height })
          }
        }
        // Controls and clipped text.
        const role = el.getAttribute('role')
        if (
          el instanceof HTMLElement &&
          (tag === 'BUTTON' || role === 'button' || tag === 'INPUT' || tag === 'A')
        )
          controlEls.push(el)
        if (el instanceof HTMLElement) {
          const scrolls = ['auto', 'scroll'].includes(cs.overflowX)
          if (el.clientWidth > 1 && !scrolls && el.scrollWidth > el.clientWidth + 1)
            overflowing.push(`${label(el)} text overflows (${el.scrollWidth} > ${el.clientWidth})`)
          if (tag === 'BUTTON' && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1)
            overflowing.push(
              `${label(el)} text overflows vertically (${el.scrollHeight} > ${el.clientHeight})`,
            )
        }
      }
    }
    const canvasArea = canvas ? canvas.w * canvas.h : 0
    const coverage = canvasArea > 0 ? unionArea(opaque) / canvasArea : 0

    // ---- Controls
    const controls: string[] = [...overflowing]
    const placed = controlEls
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter((c) => c.b.width > 0 && c.b.height > 0)
    for (const { el, b } of placed) {
      if (b.width < o.minControl - 0.01 || b.height < o.minControl - 0.01)
        controls.push(`${label(el)} too small (${b.width.toFixed(1)}×${b.height.toFixed(1)})`)
      if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1)
        controls.push(`${label(el)} outside the viewport`)
    }
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i] as (typeof placed)[number]
        const c = placed[j] as (typeof placed)[number]
        if (a.el.contains(c.el) || c.el.contains(a.el)) continue
        const ox = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left)
        const oy = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top)
        if (ox > 1 && oy > 1)
          controls.push(
            `${label(a.el)} overlaps ${label(c.el)} (${ox.toFixed(1)}×${oy.toFixed(1)})`,
          )
      }

    // ---- Focus
    const raices = window.__raices
    const focus: FocusCheck[] = []
    const tiles = (x0: number, y0: number, x1: number, y1: number): R | undefined => {
      const a = raices?.rectCasilla(x0, y0)
      const b = raices?.rectCasilla(x1, y1)
      if (!a || !b) return undefined
      return { x: a.x, y: a.y, w: b.x + b.ancho - a.x, h: b.y + b.alto - a.y }
    }
    const check = (
      name: string,
      area: R | undefined,
      minVisible: number,
      mustBeInside: boolean,
    ): void => {
      if (!area || !canvas) {
        focus.push({
          name,
          visible: 0,
          inside: 0,
          covered: 0,
          ok: false,
          detail: 'no area (hook or canvas missing)',
        })
        return
      }
      const total = area.w * area.h
      const inCanvas = inter(area, canvas)
      const insideArea = inCanvas ? inCanvas.w * inCanvas.h : 0
      const hits = opaque.map((r) => inter(r, area)).filter((r): r is R => !!r)
      const covered = unionArea(hits)
      const visible = (insideArea - covered) / total
      const inside = insideArea / total
      const reasons: string[] = []
      if (mustBeInside && inside < 1 - 1e-6)
        reasons.push(`only ${(inside * 100).toFixed(0)} % inside the canvas`)
      if (minVisible >= 1 && covered > 0.5) reasons.push(`${covered.toFixed(0)} px² covered`)
      if (minVisible < 1 && visible < minVisible)
        reasons.push(`${(visible * 100).toFixed(0)} % visible < ${minVisible * 100} %`)
      focus.push({
        name,
        visible,
        inside,
        covered,
        ok: reasons.length === 0,
        area,
        detail: reasons.join('; '),
      })
    }
    const mode = raices?.modo()
    if (raices && mode === 'vida') {
      const p = raices.personaje()
      if (p) {
        const cx = Math.floor(p.x)
        const cy = Math.floor(p.y)
        check('character tile', tiles(cx, cy, cx, cy), 1, true)
        // The square is judged inside the canvas only: beyond the valley edge there is nothing to see.
        check(
          `${2 * o.radius + 1}x${2 * o.radius + 1} around character`,
          tiles(cx - o.radius, cy - o.radius, cx + o.radius, cy + o.radius),
          1,
          false,
        )
      }
    } else if (raices && mode === 'plano') {
      const s = raices.construccion()?.silueta
      if (s) check('silhouette', tiles(s.x, s.y, s.x + s.ancho - 1, s.y + s.alto - 1), 1, true)
      const id = raices.edificioSeleccionado()?.id
      const e = id === undefined ? undefined : raices.edificios().find((b) => b.id === id)
      if (e) check('chosen building', tiles(e.x, e.y, e.x + e.ancho - 1, e.y + e.alto - 1), 1, true)
      const sel = raices.seleccionada()
      const info = sel === undefined ? undefined : raices.parcelaInfo(sel)
      if (info) {
        const n = o.parcelTiles
        check(
          'chosen parcel',
          tiles(info.columna * n, info.fila * n, info.columna * n + n - 1, info.fila * n + n - 1),
          o.parcelMin,
          false,
        )
      }
      const pin = raices.pincel()
      if (pin?.cursor)
        check(
          'brush cursor',
          tiles(pin.cursor.x, pin.cursor.y, pin.cursor.x, pin.cursor.y),
          1,
          true,
        )
    }

    return {
      viewport: { w: vw, h: vh },
      canvas,
      coverage,
      boxes: opaque.length,
      rects: opaque,
      mode,
      focus,
      controls,
    }
  }, opts)
}
