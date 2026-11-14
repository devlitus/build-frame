import { expect, test as base, type Page } from '@playwright/test'

/**
 * Shared e2e support: a `test` fixture that fails on page errors, URL builder, condition-based
 * waits and in-page helpers. Prefer these over `page.waitForTimeout` (see eslint.config.js).
 */

export { expect }

type Command = { tipo: string; [field: string]: unknown }

interface Fixtures {
  /** Collected `pageerror` messages and `console.error` texts of the page. */
  pageErrors: string[]
  /** Set to false in a test that expects errors; by default the test fails if there were any. */
  failOnPageErrors: boolean
}

export const test = base.extend<Fixtures>({
  failOnPageErrors: [true, { option: true }],
  pageErrors: [
    async ({ page, failOnPageErrors }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await use(errors)
      if (failOnPageErrors) expect(errors, 'page errors / console.error').toEqual([])
    },
    { auto: true },
  ],
})

export interface ValleyOptions {
  seed?: number
  /** Default true. */
  debug?: boolean
  mode?: 'plano'
  /** Parcel indices to own at start (needs debug). */
  owned?: readonly number[]
  /** Start position (needs debug). */
  at?: 'vado'
  /** Parcel selected at start (needs debug and mode plano). */
  selection?: number
  /** Time multiplier (needs debug). */
  speed?: number
  /** Start time of day `HH:MM` (needs debug). */
  hour?: string
  money?: number
  /** Notice duration in ms (needs debug); default 300 so tests never wait the real 6 s. */
  noticeMs?: number
}

/** Builds the query string (with the leading `?`) for the given options. */
export function valleyQuery(o: ValleyOptions = {}): string {
  const q: string[] = [`semilla=${o.seed ?? 42}`]
  const debug = o.debug ?? true
  if (debug) q.push('debug')
  if (o.mode) q.push(`modo=${o.mode}`)
  if (debug) {
    if (o.owned && o.owned.length > 0) q.push(`propias=${o.owned.join(',')}`)
    if (o.at) q.push(`en=${o.at}`)
    if (o.selection !== undefined) q.push(`seleccion=${o.selection}`)
    if (o.speed !== undefined) q.push(`acelerar=${o.speed}`)
    if (o.hour) q.push(`hora=${o.hour}`)
    if (o.money !== undefined) q.push(`dinero=${o.money}`)
    q.push(`aviso=${o.noticeMs ?? 300}`)
  }
  return `?${q.join('&')}`
}

/** Opens the valley and waits until it is ready (see `waitReady`). */
export async function openValley(page: Page, options: ValleyOptions = {}): Promise<void> {
  await page.goto(`./${valleyQuery(options)}`)
  await waitReady(page)
}

/** Waits `n` animation frames inside a single evaluate. */
export async function waitFrames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count
        const tick = (): void => {
          if (--left <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    n,
  )
}

/** Valley scene active, character present, camera zoom > 0, not guiding, and 2 frames painted. */
export async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__raices?.ready() === true, undefined, {
    polling: 'raf',
    timeout: 60_000,
  })
  const frame = await page.evaluate(() => window.__raices?.frame() ?? 0)
  await page.waitForFunction((f) => (window.__raices?.frame() ?? 0) >= f + 2, frame, {
    polling: 'raf',
    timeout: 30_000,
  })
}

/** expect.poll with the shared intervals. */
export function poll<T>(fn: () => Promise<T> | T, options: { timeout?: number } = {}) {
  return expect.poll(fn, { intervals: [30, 60, 100, 200], ...options })
}

/** Camera has the same scroll and zoom for `frames` consecutive frames. */
export async function cameraSettled(page: Page, frames = 5): Promise<void> {
  await page.evaluate(
    (needed) =>
      new Promise<void>((resolve) => {
        let key = ''
        let still = 0
        const tick = (): void => {
          const c = window.__raices?.camara()
          const k = c ? `${c.scrollX}|${c.scrollY}|${c.zoom}` : ''
          still = k !== '' && k === key ? still + 1 : 0
          key = k
          if (still >= needed) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    frames,
  )
}

/** Centers the Plano camera on tile (cx, cy) and waits for the camera to settle. */
export async function centerOn(page: Page, cx: number, cy: number): Promise<void> {
  await page.evaluate((c) => window.__raices?.centrarCamara(c.cx, c.cy), { cx, cy })
  await cameraSettled(page)
}

/** Applies a core command (needs debug). */
export function emit(page: Page, command: Command): Promise<void> {
  return page.evaluate((c) => window.__raices?.emitir(c), command)
}

/**
 * Walks the character to tile `target` (axis by axis, 60 ms MoverPersonaje steps) in a single
 * evaluate. Throws if it does not arrive. Optionally ends facing south.
 */
export async function goTo(
  page: Page,
  target: { x: number; y: number },
  options: { faceSouth?: boolean; maxSteps?: number } = {},
): Promise<void> {
  const result = await page.evaluate(
    ({ target, faceSouth, maxSteps }) => {
      const r = window.__raices
      if (!r) return 'no hooks'
      for (let i = 0; i < maxSteps; i++) {
        const p = r.personaje()
        if (!p) return 'no character'
        const fx = Math.floor(p.x)
        const fy = Math.floor(p.y)
        if (fx === target.x && fy === target.y) {
          if (!faceSouth) return 'ok'
          r.emitir({ tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 1 })
          const f = r.personaje()
          const same = f && Math.floor(f.x) === target.x && Math.floor(f.y) === target.y
          return same && f.orientacion === 'sur' ? 'ok' : 'did not end facing south on target'
        }
        const dx = fx === target.x ? 0 : Math.sign(target.x + 0.5 - p.x)
        const dy = fx === target.x ? Math.sign(target.y + 0.5 - p.y) : 0
        r.emitir({ tipo: 'MoverPersonaje', dx, dy, ms: 60 })
      }
      return 'too many steps'
    },
    { target, faceSouth: options.faceSouth ?? false, maxSteps: options.maxSteps ?? 400 },
  )
  if (result !== 'ok') throw new Error(`goTo(${target.x}, ${target.y}): ${result}`)
}

/**
 * Negative wait: `read` (a self-contained arrow function evaluated in the page) returns the same
 * JSON value for `frames` consecutive frames, so "nothing happens" is checked over real frames and
 * not a fixed sleep. Returns the stable value; throws if it changes.
 */
export async function unchanged<T>(
  page: Page,
  read: () => T,
  options: { frames?: number } = {},
): Promise<T> {
  const frames = options.frames ?? 10
  const outcome = await page.evaluate(
    ({ src, frames }) =>
      new Promise<{ changed: boolean; value: T }>((resolve) => {
        const fn = new Function(`return (${src})()`) as () => T
        const first = JSON.stringify(fn())
        let left = frames
        const tick = (): void => {
          const now = fn()
          if (JSON.stringify(now) !== first) resolve({ changed: true, value: now })
          else if (--left <= 0) resolve({ changed: false, value: now })
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { src: read.toString(), frames },
  )
  if (outcome.changed)
    throw new Error(`value changed, expected it to stay the same: ${JSON.stringify(outcome.value)}`)
  return outcome.value
}

/** Holds a key down for `ms` (design duration of a press: long press, joystick, hold to move). */
export async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms) // real-wait: the press duration is part of the behaviour under test
  await page.keyboard.up(key)
}
