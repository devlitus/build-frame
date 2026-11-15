import type { Page } from '@playwright/test'
import { poll } from './game.ts'

/**
 * Helpers for the Life-mode flows (smoke and `flows-life`): own every parcel, walk to a free tile,
 * click or tap a tile, read the clock and the inventory. They only use the debug hooks of
 * `window.__raices`, never fixed sleeps.
 */

/** Indices of every parcel of the valley (6 x 6), for `openValley({ owned: ALL_PARCELS })`. */
export const ALL_PARCELS: readonly number[] = Array.from({ length: 36 }, (_, i) => i)

export interface Tile {
  x: number
  y: number
}

export const character = (page: Page) => page.evaluate(() => window.__raices?.personaje())
export const clock = (page: Page) => page.evaluate(() => window.__raices?.reloj())
export const energy = (page: Page) => page.evaluate(() => window.__raices?.energia())
export const lastUse = (page: Page) => page.evaluate(() => window.__raices?.ultimoUso())

export const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

/** The character (throws if there is none). */
export async function requireCharacter(
  page: Page,
): Promise<{ x: number; y: number; orientacion: string }> {
  const p = await character(page)
  if (!p) throw new Error('no character')
  return p
}

/** Clicks (desktop) or taps (touch) the centre of tile (cx, cy) with the real pointer. */
export async function clickTile(page: Page, cx: number, cy: number): Promise<void> {
  await poll(() =>
    page.evaluate((c) => window.__raices?.puntoClicCasilla(c.cx, c.cy) !== undefined, { cx, cy }),
  ).toBe(true)
  const point = await page.evaluate((c) => window.__raices?.puntoClicCasilla(c.cx, c.cy), {
    cx,
    cy,
  })
  if (!point) throw new Error(`tile (${cx}, ${cy}) is not on screen`)
  const touch = await page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0)
  if (touch) await page.touchscreen.tap(point.x, point.y)
  else await page.mouse.click(point.x, point.y)
}

/**
 * Free tile at exactly `steps` tiles from the character along one axis, with every tile in between
 * free too (a short, straight route). Returns the target and the unit direction.
 */
export async function straightFreeTile(
  page: Page,
  steps: number,
): Promise<{ tile: Tile; dx: number; dy: number }> {
  const found = await page.evaluate((n) => {
    const r = window.__raices
    const p = r?.personaje()
    if (!r || !p) return undefined
    const cx = Math.floor(p.x)
    const cy = Math.floor(p.y)
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [-1, 0],
      [0, 1],
    ] as const) {
      let free = true
      for (let i = 1; i <= n && free; i++) free = !r.bloqueada(cx + dx * i, cy + dy * i)
      if (free) return { tile: { x: cx + dx * n, y: cy + dy * n }, dx, dy }
    }
    return undefined
  }, steps)
  if (!found) throw new Error(`no straight free route of ${steps} tiles`)
  return found
}

/**
 * Nearest free tile (within 4 tiles of the character) that also has its south neighbour free, so
 * the character can stand there facing south onto a free tile. Returns the standing tile.
 */
export async function standingTileFacingSouth(page: Page): Promise<Tile> {
  const tile = await page.evaluate(() => {
    const r = window.__raices
    const p = r?.personaje()
    if (!r || !p) return undefined
    const sx = Math.floor(p.x)
    const sy = Math.floor(p.y)
    const free = (x: number, y: number) => !r.bloqueada(x, y)
    for (let d = 0; d <= 4; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue
          const x = sx + dx
          const y = sy + dy
          let ok = free(x, y) && free(x, y + 1)
          // The axis-by-axis walk of `goTo` needs the L-shaped route to be free.
          for (let i = 0; i <= Math.abs(dx) && ok; i++) ok = free(sx + Math.sign(dx) * i, sy)
          for (let j = 0; j <= Math.abs(dy) && ok; j++) ok = free(x, sy + Math.sign(dy) * j)
          if (ok) return { x, y }
        }
      }
    }
    return undefined
  })
  if (!tile) throw new Error('no free standing tile near the character')
  return tile
}

/** Turns the character (in place, 1 ms) towards a unit direction. */
export function turn(page: Page, dx: number, dy: number): Promise<void> {
  return page.evaluate(
    (d) => window.__raices?.emitir({ tipo: 'MoverPersonaje', dx: d.dx, dy: d.dy, ms: 1 }),
    {
      dx,
      dy,
    },
  )
}

/** Quantity of an inventory object. */
export const quantityOf = (page: Page, object: string) =>
  page.evaluate(
    (o) => window.__raices?.inventario()?.ranuras.find((r) => r.objeto === o)?.cantidad ?? 0,
    object,
  )

/** Game minutes since the start of day 1 (day * 1200 + minute of the day). */
export async function totalMinutes(page: Page): Promise<number> {
  const r = await clock(page)
  if (!r) throw new Error('no clock')
  return (r.dia - 1) * 1200 + r.minutoDelDia
}
