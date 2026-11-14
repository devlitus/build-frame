import { devices, type Browser, type Locator, type Page } from '@playwright/test'
import {
  cameraSettled,
  emit,
  expect,
  openValley,
  test,
  waitFrames,
  type ValleyOptions,
} from './apoyo/game'
import { measureInterface, type InterfaceReport } from './apoyo/interface'

/**
 * Interface rule (E2E-14): "the interface does not cover the game", measured in CSS pixels over
 * the DOM (`apoyo/interface.ts`). R1..R4 walk every state at one viewport, R5 rotates with panels
 * open and checks the controls at 320x568. The last block attacks the measurement itself.
 *
 * Each state gets an annotation `coverage % | focus | controls`, so the report is a table.
 * The thresholds are PROVISIONAL (the PO sets the final ones from that table).
 *
 * States that fail on the current HUD are listed in KNOWN_FAILING: they are still measured and
 * annotated, and the test expects them to fail (like `test.fail()`, but per state). When the HUD
 * refactor fixes one, the test says so and the entry must be removed.
 */

/** PROVISIONAL: max coverage (opaque HUD boxes / canvas) with no panel open. */
const MAX_COVERAGE_BARE = 0.15
/** PROVISIONAL: max coverage with a panel open. */
const MAX_COVERAGE_PANEL = 0.35
/** PROVISIONAL: radius (Chebyshev, tiles) of the square around the character that stays free. */
const FOCUS_RADIUS = 3
/** PROVISIONAL: minimum visible fraction of the chosen parcel in Plano. */
const MIN_PARCEL_VISIBLE = 0.5

const SEED = 42
const OWNED = [14, 15, 20, 21]
/** Valley side and parcel side in tiles (the core cannot be imported here: JSON imports). Checked in `settle`. */
const SIDE = 96
const PARCEL_TILES = 16

/** State keys (`R1 spawn`, ...) that fail on the current HUD. Filled from the measured table. */
const KNOWN_FAILING = new Set<string>([
  'R1 corner-NW',
  'R1 corner-NE',
  'R1 corner-SW',
  'R1 corner-SE',
  'R1 inventory',
  'R2 spawn',
  'R2 corner-NW',
  'R2 corner-NE',
  'R2 corner-SW',
  'R2 corner-SE',
  'R2 inventory',
  'R2 notice',
  'R2 night-notice',
  'R2 plano',
  'R2 parcel',
  'R2 parcel-confirm',
  'R2 build-catalog',
  'R2 build-silhouette',
  'R2 build-confirm',
  'R2 building',
  'R2 building-confirm',
  'R3 spawn',
  'R3 corner-NW',
  'R3 corner-NE',
  'R3 corner-SW',
  'R3 corner-SE',
  'R3 inventory',
  'R3 notice',
  'R3 night-notice',
  'R4 spawn',
  'R4 corner-NW',
  'R4 corner-NE',
  'R4 corner-SW',
  'R4 corner-SE',
  'R4 inventory',
  'R4 notice',
  'R4 night-notice',
  'R4 plano',
  'R4 parcel',
  'R4 parcel-confirm',
  'R4 zones',
  'R4 zones-brush',
  'R4 build-catalog',
  'R4 build-silhouette',
  'R4 build-confirm',
  'R4 building',
  'R4 building-confirm',
  'R4 move',
  'R5 inventory 915x412',
  'R5 inventory 320x568',
])

interface Ctx {
  page: Page
  mobile: boolean
}

interface State {
  id: string
  /** A panel (or bar) is open: the looser coverage threshold applies. */
  panel: boolean
  setup(c: Ctx): Promise<void>
}

const PLANO: ValleyOptions = { mode: 'plano', owned: OWNED, money: 5000, noCounter: true }
const VIDA: ValleyOptions = { noCounter: true }

async function press(_c: Ctx, locator: Locator): Promise<void> {
  // A DOM click, not a pointer gesture: when the interface covers or pushes a control out of the
  // screen the gesture would hit something else, and that is measured separately (controls); it is
  // not a reason to lose the state.
  await locator.dispatchEvent('click')
}

const button = (page: Page, name: string | RegExp, exact = false) =>
  page.getByRole('button', { name, exact })

async function settle(page: Page): Promise<void> {
  expect(await page.evaluate(() => window.__raices?.vados()?.lado), 'valley side').toBe(SIDE)
  await waitFrames(page, 3)
  await cameraSettled(page)
  await waitFrames(page, 2)
}

async function focusCanvas(page: Page): Promise<void> {
  await page.locator('#juego').focus()
}

/** A purchasable parcel (next to an owned one) and a spot for each building type, via the hooks. */
async function selectBuyableParcel(page: Page): Promise<void> {
  const index = await page.evaluate(() => {
    const r = window.__raices
    for (let i = 0; i < 36; i++) if (r?.parcelaInfo(i)?.comprable) return i
    return -1
  })
  expect(index, 'a purchasable parcel').toBeGreaterThanOrEqual(0)
  await page.evaluate((i) => window.__raices?.seleccionar(i), index)
  await expect(page.locator('.panel-parcela')).toBeVisible()
}

async function paintZones(page: Page): Promise<void> {
  await emit(page, { tipo: 'PintarZona', x0: 40, y0: 40, x1: 47, y1: 55, zona: 'vivienda' })
  await emit(page, { tipo: 'PintarZona', x0: 48, y0: 40, x1: 55, y1: 55, zona: 'almacen' })
}

/** Paints zones, builds a finished `caja-envio` near the centre and selects it. */
async function buildAndSelect(page: Page): Promise<void> {
  await paintZones(page)
  const spot = await page.evaluate(() => {
    const r = window.__raices
    for (let d = 0; d < 12; d++)
      for (let y = 48 - d; y <= 48 + d; y++)
        for (let x = 48 - d; x <= 48 + d; x++)
          if (r?.colocacion('caja-envio', x, y)?.valida) return { x, y }
    return undefined
  })
  expect(spot, 'a valid spot for the shipping box').toBeDefined()
  await emit(page, { tipo: 'Construir', tipoEdificio: 'caja-envio', ...spot })
  await expect.poll(() => page.evaluate(() => window.__raices?.edificios().length)).toBe(1)
  // Finish the work: sleeping passes days; back to Plano afterwards.
  await page.evaluate(() => {
    const r = window.__raices
    for (let i = 0; i < 4; i++) {
      r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
    }
    r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
  })
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.edificios().every((e) => !e.enObra)))
    .toBe(true)
  await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
  await cameraSettled(page)
  const id = await page.evaluate(() => window.__raices?.edificios()[0]?.id)
  await page.evaluate((i) => window.__raices?.seleccionarEdificio(i as number), id)
  await expect(page.locator('.panel-edificio')).toBeVisible()
}

async function startBuilding(c: Ctx): Promise<void> {
  await openValley(c.page, { ...PLANO, seed: SEED })
  await press(c, button(c.page, 'Construir', true))
  await expect(c.page.getByRole('region', { name: 'Construir' })).toBeVisible()
}

async function pickBuilding(c: Ctx): Promise<void> {
  await startBuilding(c)
  await paintZones(c.page)
  await press(
    c,
    c.page
      .getByRole('region', { name: 'Construir' })
      .getByRole('button', { name: /Caja de envío/ }),
  )
  await expect
    .poll(() => c.page.evaluate(() => window.__raices?.construccion()?.silueta !== undefined))
    .toBe(true)
  // The silhouette starts at the centre of the view, which depends on the viewport: the four
  // owned parcels become storage so that the confirmation is possible wherever it starts.
  await emit(c.page, { tipo: 'PintarZona', x0: 32, y0: 32, x1: 63, y1: 63, zona: 'almacen' })
  const silhouette = () => c.page.evaluate(() => window.__raices?.construccion()?.silueta)
  if (!(await silhouette())?.valida) {
    // The centre of the view is an obstacle: move the silhouette to the valid spot nearest to it.
    const point = await c.page.evaluate(() => {
      const r = window.__raices
      const from = r?.construccion()?.centro ?? { x: 48, y: 48 }
      const spots: { x: number; y: number; d: number }[] = []
      for (let y = 32; y < 64; y++)
        for (let x = 32; x < 64; x++)
          if (r?.colocacion('caja-envio', x, y)?.valida)
            spots.push({ x, y, d: Math.hypot(x - from.x, y - from.y) })
      spots.sort((u, v) => u.d - v.d)
      for (const t of spots) {
        const q = r?.puntoClicCasilla(t.x, t.y)
        if (q) return q
      }
      return undefined
    })
    expect(point, 'a visible valid spot').toBeDefined()
    const { x, y } = point as { x: number; y: number }
    if (c.mobile) await c.page.touchscreen.tap(x, y)
    else await c.page.mouse.move(x, y)
  }
  await expect
    .poll(async () => (await silhouette())?.valida, {
      message: `silhouette valid (${JSON.stringify(await silhouette())})`,
    })
    .toBe(true)
}

const VIDA_STATES: State[] = [
  { id: 'spawn', panel: false, setup: (c) => openValley(c.page, { ...VIDA, seed: SEED }) },
  ...(
    [
      ['corner-NW', 0, 0],
      ['corner-NE', SIDE - 1, 0],
      ['corner-SW', 0, SIDE - 1],
      ['corner-SE', SIDE - 1, SIDE - 1],
    ] as const
  ).map(([id, x, y]): State => ({
    id,
    panel: false,
    setup: (c) => openValley(c.page, { ...VIDA, seed: SEED, at: { x, y } }),
  })),
  {
    id: 'inventory',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...VIDA, seed: SEED })
      await press(c, button(c.page, 'Inventario', true))
      await expect(c.page.getByRole('region', { name: 'Inventario' })).toBeVisible()
    },
  },
  {
    id: 'notice',
    panel: false,
    setup: async (c) => {
      await openValley(c.page, { ...VIDA, seed: SEED, at: { x: 48, y: 48 }, noticeMs: 60_000 })
      await focusCanvas(c.page)
      await c.page.keyboard.press('z')
      await expect(c.page.locator('.aviso')).toBeVisible()
    },
  },
]

const NIGHT_NOTICE: State = {
  id: 'night-notice',
  panel: false,
  setup: async (c) => {
    await openValley(c.page, {
      ...VIDA,
      seed: SEED,
      at: { x: 48, y: 48 },
      hour: '23:00',
      noticeMs: 60_000,
    })
    await focusCanvas(c.page)
    await c.page.keyboard.press('z')
    await expect(c.page.locator('.aviso')).toBeVisible()
  },
}

const PLANO_STATES: State[] = [
  { id: 'plano', panel: false, setup: (c) => openValley(c.page, { ...PLANO, seed: SEED }) },
  {
    id: 'parcel',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...PLANO, seed: SEED })
      await selectBuyableParcel(c.page)
    },
  },
  {
    id: 'parcel-confirm',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...PLANO, seed: SEED })
      await selectBuyableParcel(c.page)
      await press(c, button(c.page, /^Comprar por/))
      await expect(c.page.locator('.compra-confirmacion')).toBeVisible()
    },
  },
  {
    id: 'zones',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...PLANO, seed: SEED })
      await press(c, button(c.page, 'Zonas', true))
      await expect(c.page.getByRole('group', { name: 'Pincel de zonas' })).toBeVisible()
    },
  },
  {
    id: 'zones-brush',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...PLANO, seed: SEED })
      await press(c, button(c.page, 'Zonas', true))
      await press(
        c,
        c.page
          .getByRole('group', { name: 'Pincel de zonas' })
          .getByRole('button', { name: 'Vivienda' }),
      )
      await focusCanvas(c.page)
      await c.page.keyboard.press('Enter')
      await expect
        .poll(() => c.page.evaluate(() => window.__raices?.pincel()?.cursor))
        .toBeDefined()
    },
  },
  { id: 'build-catalog', panel: true, setup: startBuilding },
  { id: 'build-silhouette', panel: true, setup: pickBuilding },
  {
    id: 'build-confirm',
    panel: true,
    setup: async (c) => {
      await pickBuilding(c)
      await press(c, button(c.page, 'Construir aquí'))
      await expect(c.page.getByRole('alertdialog')).toBeVisible()
    },
  },
  {
    id: 'building',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...PLANO, seed: SEED })
      await buildAndSelect(c.page)
    },
  },
  {
    id: 'building-confirm',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...PLANO, seed: SEED })
      await buildAndSelect(c.page)
      await press(c, button(c.page, 'Demoler', true))
      await expect(c.page.getByRole('alertdialog')).toBeVisible()
    },
  },
  {
    id: 'move',
    panel: true,
    setup: async (c) => {
      await openValley(c.page, { ...PLANO, seed: SEED })
      await buildAndSelect(c.page)
      await press(c, button(c.page, 'Mover', true))
      await expect(c.page.getByRole('region', { name: 'Mover edificio' })).toBeVisible()
    },
  },
]

const ALL_STATES: State[] = [...VIDA_STATES, NIGHT_NOTICE, ...PLANO_STATES]

/** Violations of the rule in a report; empty = the state passes. */
function violations(r: InterfaceReport, panel: boolean, rotated = false): string[] {
  const out: string[] = []
  const max = panel ? MAX_COVERAGE_PANEL : MAX_COVERAGE_BARE
  if (!rotated && r.coverage > max)
    out.push(`coverage ${(r.coverage * 100).toFixed(1)} % > ${max * 100} %`)
  for (const f of r.focus) if (!f.ok) out.push(`focus "${f.name}": ${f.detail}`)
  for (const c of r.controls) out.push(`control: ${c}`)
  return out
}

function summary(r: InterfaceReport): string {
  const focusKo = r.focus.filter((f) => !f.ok).map((f) => f.name)
  return [
    `${(r.coverage * 100).toFixed(1)} %`,
    `focus ${focusKo.length === 0 ? `OK (${r.focus.length})` : `KO (${focusKo.join(', ')})`}`,
    `controls ${r.controls.length === 0 ? 'OK' : `KO (${r.controls.length})`}`,
  ].join(' | ')
}

/** Annotates and asserts one state (soft), inverting the check for the known-failing ones. */
function judge(key: string, r: InterfaceReport, panel: boolean, rotated = false): void {
  const problems = violations(r, panel, rotated)
  test.info().annotations.push({ type: key, description: summary(r) })
  if (KNOWN_FAILING.has(key)) {
    expect
      .soft(problems.length, `${key} passes now (${summary(r)}): remove it from KNOWN_FAILING`)
      .toBeGreaterThan(0)
  } else {
    expect.soft(problems, `${key} (${summary(r)})`).toEqual([])
  }
}

function measure(page: Page): Promise<InterfaceReport> {
  return measureInterface(page, {
    radius: FOCUS_RADIUS,
    parcelMin: MIN_PARCEL_VISIBLE,
    parcelTiles: PARCEL_TILES,
  })
}

async function withPage(
  browser: Browser,
  baseURL: string,
  size: { w: number; h: number },
  mobile: boolean,
  body: (c: Ctx) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext(
    mobile
      ? {
          ...devices['Pixel 7'],
          baseURL,
          viewport: { width: size.w, height: size.h },
          screen: { width: size.w, height: size.h },
        }
      : { baseURL, viewport: { width: size.w, height: size.h } },
  )
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await body({ page, mobile })
    expect(errors, 'page errors').toEqual([])
  } finally {
    await context.close()
  }
}

test.describe('interface rule', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'escritorio', 'own contexts: runs in one project only')
  })
  test.describe.configure({ timeout: 240_000 })

  const RUNS = [
    { id: 'R1', w: 1280, h: 720, mobile: false },
    { id: 'R2', w: 412, h: 915, mobile: true },
    { id: 'R3', w: 915, h: 412, mobile: true },
    { id: 'R4', w: 640, h: 320, mobile: true },
  ]
  for (const run of RUNS) {
    test(`${run.id} ${run.w}x${run.h}: the interface does not cover the game`, async ({
      browser,
      baseURL,
    }) => {
      await withPage(browser, baseURL as string, run, run.mobile, async (c) => {
        for (const state of ALL_STATES) {
          await state.setup(c)
          await settle(c.page)
          judge(`${run.id} ${state.id}`, await measure(c.page), state.panel)
        }
      })
    })
  }

  test('R5 rotating with panels open keeps the focus in view and the controls inside; 320x568 controls', async ({
    browser,
    baseURL,
  }) => {
    const rotating = ['inventory', 'parcel', 'parcel-confirm', 'build-confirm', 'night-notice']
    await withPage(browser, baseURL as string, { w: 412, h: 915 }, true, async (c) => {
      for (const id of rotating) {
        const state = ALL_STATES.find((s) => s.id === id) as State
        await c.page.setViewportSize({ width: 412, height: 915 })
        await state.setup(c)
        await settle(c.page)
        for (const [w, h] of [
          [915, 412],
          [412, 915],
        ] as const) {
          await c.page.setViewportSize({ width: w, height: h })
          await settle(c.page)
          judge(`R5 ${id} ${w}x${h}`, await measure(c.page), state.panel, true)
        }
      }
    })
    await withPage(browser, baseURL as string, { w: 320, h: 568 }, true, async (c) => {
      for (const id of ['spawn', 'inventory', 'parcel-confirm', 'build-confirm', 'zones']) {
        const state = ALL_STATES.find((s) => s.id === id) as State
        await state.setup(c)
        await settle(c.page)
        const r = await measure(c.page)
        const key = `R5 ${id} 320x568`
        test.info().annotations.push({ type: key, description: summary(r) })
        const problems = r.controls.map((x) => `control: ${x}`)
        if (KNOWN_FAILING.has(key))
          expect
            .soft(problems.length, `${key} passes now: remove it from KNOWN_FAILING`)
            .toBeGreaterThan(0)
        else expect.soft(problems, key).toEqual([])
      }
    })
  })
})

/**
 * Attack on the measurement: a plain page with a canvas and a `.hud` built to fool it. The
 * measurement must see transparent containers with opaque children, opaque boxes without pointer
 * events and overflowing text, and must not count invisible elements.
 */
test.describe('interface rule: the measurement itself', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio', 'one project is enough')
    await page.setViewportSize({ width: 1000, height: 500 })
  })

  const AREA = 1000 * 500
  const hud = (html: string): string => `
    <style>body{margin:0} canvas{position:fixed;inset:0;width:100%;height:100%}
    .hud{position:fixed;inset:0;pointer-events:none} .hud *{box-sizing:border-box}
    .abs{position:absolute}</style>
    <canvas></canvas><div class="hud">${html}</div>`

  async function coverageOf(page: Page, html: string): Promise<InterfaceReport> {
    await page.setContent(hud(html))
    return measureInterface(page)
  }

  test('empty HUD: nothing covered', async ({ page }) => {
    const r = await coverageOf(page, '')
    expect(r.coverage).toBe(0)
    expect(r.canvas).toEqual({ x: 0, y: 0, w: 1000, h: 500 })
  })

  test('a transparent container with opaque children counts the children, not the container', async ({
    page,
  }) => {
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;width:600px;height:400px">
         <div class="abs" style="left:10px;top:10px;width:100px;height:50px;background:#123"></div>
         <button class="abs" style="left:200px;top:10px;width:60px;height:60px">x</button>
       </div>`,
    )
    expect(r.coverage * AREA).toBeCloseTo(100 * 50 + 60 * 60, 3)
  })

  test('an opaque element with pointer-events:none still counts', async ({ page }) => {
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;width:200px;height:100px;background:#000;pointer-events:none"></div>`,
    )
    expect(r.coverage * AREA).toBeCloseTo(200 * 100, 3)
  })

  test('semi-transparent background: counts from alpha 0.2, not below', async ({ page }) => {
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;width:100px;height:100px;background:rgba(0,0,0,.25)"></div>
       <div class="abs" style="left:300px;top:0;width:100px;height:100px;background:rgba(0,0,0,.1)"></div>`,
    )
    expect(r.coverage * AREA).toBeCloseTo(100 * 100, 3)
  })

  test('a transparent box with its own text covers only the text lines', async ({ page }) => {
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;width:900px;height:300px;font:16px monospace">Hello</div>`,
    )
    expect(r.coverage).toBeGreaterThan(0)
    expect(r.coverage * AREA).toBeLessThan(120 * 30)
  })

  test('overlaps are counted once (exact union)', async ({ page }) => {
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;width:100px;height:100px;background:#000"></div>
       <div class="abs" style="left:50px;top:50px;width:100px;height:100px;background:#000"></div>`,
    )
    expect(r.coverage * AREA).toBeCloseTo(100 * 100 * 2 - 50 * 50, 3)
  })

  test('only the part inside the canvas and viewport counts', async ({ page }) => {
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:-50px;top:-50px;width:100px;height:100px;background:#000"></div>`,
    )
    expect(r.coverage * AREA).toBeCloseTo(50 * 50, 3)
  })

  test('invisible elements are not counted', async ({ page }) => {
    const box = 'width:300px;height:200px;background:#000'
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;${box};display:none"></div>
       <div class="abs" style="left:0;top:0;${box};visibility:hidden"></div>
       <div class="abs" style="left:0;top:0;${box};opacity:0"></div>
       <div class="abs" style="left:0;top:0;opacity:0"><button style="${box}">x</button></div>
       <div class="abs" style="left:0;top:0;${box}" hidden></div>
       <div class="abs" style="left:0;top:0;${box}" aria-hidden="false" ><span class="solo-lector" style="${box}">only for readers</span></div>
       <div class="abs joystick-base" style="left:0;top:0;${box}"></div>
       <div class="abs" style="left:0;top:0;width:0;height:0;overflow:hidden"><button style="${box}">clipped away</button></div>
       <button class="abs" style="left:0;top:0;${box};display:none">z</button>`,
    )
    // The only visible thing is the wrapper with aria-hidden=false, which is opaque (background).
    expect(r.coverage * AREA).toBeCloseTo(300 * 200, 3)
    expect(r.controls).toEqual([])
  })

  test('effective opacity (ancestors included): faint boxes are not counted', async ({ page }) => {
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;opacity:0.1"><div style="width:100px;height:100px;background:#000"></div></div>
       <div class="abs" style="left:300px;top:0;opacity:0.5"><div style="width:100px;height:100px;background:#000"></div></div>`,
    )
    expect(r.coverage * AREA).toBeCloseTo(100 * 100, 3)
  })

  test('invisible elements alone: zero coverage and no controls', async ({ page }) => {
    const box = 'width:300px;height:200px;background:#000'
    const r = await coverageOf(
      page,
      `<div class="abs" style="left:0;top:0;${box};display:none"></div>
       <div class="abs" style="left:0;top:0;${box};visibility:hidden"></div>
       <div class="abs" style="left:0;top:0;${box};opacity:0"></div>
       <div class="abs" style="left:0;top:0;opacity:0"><button style="${box}">x</button></div>
       <div class="abs" style="left:0;top:0;${box}" hidden></div>
       <span class="abs solo-lector" style="left:0;top:0;${box}">only for readers</span>
       <div class="abs joystick-base" style="left:0;top:0;${box}"></div>
       <div class="abs" style="left:0;top:0;width:0;height:0;overflow:hidden"><button style="${box}">clipped away</button></div>`,
    )
    expect(r.coverage).toBe(0)
    expect(r.boxes).toBe(0)
    expect(r.controls).toEqual([])
  })

  test('overflowing text in a control is reported', async ({ page }) => {
    const r = await coverageOf(
      page,
      `<button class="abs" style="left:0;top:0;width:60px;height:50px;white-space:nowrap;overflow:hidden">A very long label that does not fit</button>`,
    )
    expect(r.controls.some((c) => c.includes('overflows'))).toBe(true)
    // And a text that fits is not.
    const ok = await coverageOf(
      page,
      `<button class="abs" style="left:0;top:0;width:120px;height:50px;white-space:nowrap">Short</button>`,
    )
    expect(ok.controls).toEqual([])
  })

  test('controls: too small, outside the viewport and overlapping are reported', async ({
    page,
  }) => {
    const small = await coverageOf(
      page,
      `<button class="abs" style="left:0;top:0;width:30px;height:30px">a</button>`,
    )
    expect(small.controls.some((c) => c.includes('too small'))).toBe(true)
    const outside = await coverageOf(
      page,
      `<button class="abs" style="left:970px;top:0;width:60px;height:60px">a</button>`,
    )
    expect(outside.controls.some((c) => c.includes('outside the viewport'))).toBe(true)
    const overlap = await coverageOf(
      page,
      `<button class="abs" style="left:0;top:0;width:60px;height:60px">a</button>
       <button class="abs" style="left:50px;top:10px;width:60px;height:60px">b</button>`,
    )
    expect(overlap.controls.some((c) => c.includes('overlaps'))).toBe(true)
    const touching = await coverageOf(
      page,
      `<button class="abs" style="left:0;top:0;width:60px;height:60px">a</button>
       <button class="abs" style="left:59.5px;top:0;width:60px;height:60px">b</button>`,
    )
    expect(touching.controls).toEqual([])
  })
})
