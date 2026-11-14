// Screenshots by scene (E2E-15): the visual-experience check for the PO and the Breaker.
//
//   npm run capturas -- [--overlay] [--scene=a,b] [--viewport=412x915,640x320]
//
// For every viewport of the interface rule (1280x720 desktop; 412x915, 915x412 and 640x320 as a
// real phone: hasTouch / isMobile) and every scene, it prepares the state with the debug hooks
// (the same preparation as tests/e2e/interface-rule.spec.ts), measures the interface with
// `measureInterface` and writes `capturas/<viewport>/<scene>.png`, `capturas/report.json` and a
// grid `capturas/index.html` with the coverage % of each capture.
// With `--overlay` the PNG also shows the opaque boxes counted (red), the coverage and the focus
// squares (green = free, red = covered). These are not tests: nothing here fails the build.
// Needs a previous build (the npm script does it). Own port: PORT_CAPTURAS (default 4175).
import { chromium, devices, type Browser, type Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { cameraSettled, emit, expect, openValley, waitFrames } from '../tests/e2e/apoyo/game.ts'
import type { ValleyOptions } from '../tests/e2e/apoyo/game.ts'
import { measureInterface } from '../tests/e2e/apoyo/interface.ts'
import type { InterfaceReport, Rect } from '../tests/e2e/apoyo/interface.ts'

const PORT = Number(process.env.PORT_CAPTURAS ?? 4175)
const OUT = 'capturas'
const SEED = 42
const SIDE = 96
const OWNED = [14, 15, 20, 21]

const VIEWPORTS = [
  { id: '1280x720', w: 1280, h: 720, mobile: false },
  { id: '412x915', w: 412, h: 915, mobile: true },
  { id: '915x412', w: 915, h: 412, mobile: true },
  { id: '640x320', w: 640, h: 320, mobile: true },
]

const PLANO: ValleyOptions = { mode: 'plano', owned: OWNED, money: 5000, noCounter: true }
const VIDA: ValleyOptions = { noCounter: true }

interface Ctx {
  page: Page
  mobile: boolean
}
interface Scene {
  id: string
  title: string
  /** No debug hooks and no valley: the start screen. */
  cover?: boolean
  setup(c: Ctx): Promise<void>
}

// A DOM click, not a gesture: if the interface hides a control the state is still captured (and
// the problem is visible in the capture and in the measured controls).
const click = (page: Page, name: string | RegExp, exact = false) =>
  page.getByRole('button', { name, exact }).dispatchEvent('click')

async function focusCanvas(page: Page): Promise<void> {
  await page.locator('#juego').focus()
}

async function selectBuyableParcel(page: Page): Promise<void> {
  const index = await page.evaluate(() => {
    const r = window.__raices
    for (let i = 0; i < 36; i++) if (r?.parcelaInfo(i)?.comprable) return i
    return -1
  })
  if (index < 0) throw new Error('no purchasable parcel')
  await page.evaluate((i) => window.__raices?.seleccionar(i), index)
  await expect(page.locator('.panel-parcela')).toBeVisible()
}

async function paintZones(page: Page): Promise<void> {
  await emit(page, { tipo: 'PintarZona', x0: 40, y0: 40, x1: 47, y1: 55, zona: 'vivienda' })
  await emit(page, { tipo: 'PintarZona', x0: 48, y0: 40, x1: 55, y1: 55, zona: 'almacen' })
}

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
  if (!spot) throw new Error('no valid spot for the shipping box')
  await emit(page, { tipo: 'Construir', tipoEdificio: 'caja-envio', ...spot })
  await expect.poll(() => page.evaluate(() => window.__raices?.edificios().length)).toBe(1)
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
  await click(c.page, 'Construir', true)
  await expect(c.page.getByRole('region', { name: 'Construir' })).toBeVisible()
}

async function pickBuilding(c: Ctx): Promise<void> {
  await startBuilding(c)
  await paintZones(c.page)
  await c.page
    .getByRole('region', { name: 'Construir' })
    .getByRole('button', { name: /Caja de envío/ })
    .dispatchEvent('click')
  await expect
    .poll(() => c.page.evaluate(() => window.__raices?.construccion()?.silueta !== undefined))
    .toBe(true)
  await emit(c.page, { tipo: 'PintarZona', x0: 32, y0: 32, x1: 63, y1: 63, zona: 'almacen' })
  const silhouette = () => c.page.evaluate(() => window.__raices?.construccion()?.silueta)
  if (!(await silhouette())?.valida) {
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
    if (!point) throw new Error('no visible valid spot')
    if (c.mobile) await c.page.touchscreen.tap(point.x, point.y)
    else await c.page.mouse.move(point.x, point.y)
  }
  await expect.poll(async () => (await silhouette())?.valida).toBe(true)
}

async function withNotice(c: Ctx, options: ValleyOptions): Promise<void> {
  await openValley(c.page, {
    ...VIDA,
    seed: SEED,
    at: { x: 48, y: 48 },
    noticeMs: 60_000,
    ...options,
  })
  await focusCanvas(c.page)
  await c.page.keyboard.press('z')
  await expect(c.page.locator('.aviso')).toBeVisible()
}

const SCENES: Scene[] = [
  {
    id: 'cover',
    title: 'Portada',
    cover: true,
    setup: async ({ page }) => {
      await page.goto('./')
      await expect(page.getByRole('button', { name: 'Nueva partida' })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await waitFrames(page, 10)
    },
  },
  {
    id: 'life-spawn',
    title: 'Vida: aparición',
    setup: ({ page }) => openValley(page, { ...VIDA, seed: SEED }),
  },
  {
    id: 'life-corner',
    title: 'Vida: esquina SE del valle',
    setup: ({ page }) =>
      openValley(page, { ...VIDA, seed: SEED, at: { x: SIDE - 1, y: SIDE - 1 } }),
  },
  {
    id: 'life-inventory',
    title: 'Vida: inventario',
    setup: async ({ page }) => {
      await openValley(page, { ...VIDA, seed: SEED })
      await click(page, 'Inventario', true)
      await expect(page.getByRole('region', { name: 'Inventario' })).toBeVisible()
    },
  },
  { id: 'life-notice', title: 'Vida: aviso visible', setup: (c) => withNotice(c, {}) },
  { id: 'night', title: 'Noche (con aviso)', setup: (c) => withNotice(c, { hour: '23:00' }) },
  {
    id: 'plano',
    title: 'Plano sin panel',
    setup: ({ page }) => openValley(page, { ...PLANO, seed: SEED }),
  },
  {
    id: 'plano-parcel',
    title: 'Plano: parcela seleccionada',
    setup: async ({ page }) => {
      await openValley(page, { ...PLANO, seed: SEED })
      await selectBuyableParcel(page)
    },
  },
  {
    id: 'plano-parcel-confirm',
    title: 'Plano: confirmación de compra',
    setup: async ({ page }) => {
      await openValley(page, { ...PLANO, seed: SEED })
      await selectBuyableParcel(page)
      await click(page, /^Comprar por/)
      await expect(page.locator('.compra-confirmacion')).toBeVisible()
    },
  },
  {
    id: 'zones-brush',
    title: 'Zonas con pincel',
    setup: async ({ page }) => {
      await openValley(page, { ...PLANO, seed: SEED })
      await click(page, 'Zonas', true)
      await page
        .getByRole('group', { name: 'Pincel de zonas' })
        .getByRole('button', { name: 'Vivienda' })
        .dispatchEvent('click')
      await focusCanvas(page)
      await page.keyboard.press('Enter')
      await expect.poll(() => page.evaluate(() => window.__raices?.pincel()?.cursor)).toBeDefined()
    },
  },
  { id: 'build-catalog', title: 'Construir: catálogo', setup: startBuilding },
  { id: 'build-silhouette', title: 'Construir: silueta', setup: pickBuilding },
  {
    id: 'build-confirm',
    title: 'Construir: confirmación',
    setup: async (c) => {
      await pickBuilding(c)
      await click(c.page, 'Construir aquí')
      await expect(c.page.getByRole('alertdialog')).toBeVisible()
    },
  },
  {
    id: 'building',
    title: 'Edificio elegido',
    setup: async ({ page }) => {
      await openValley(page, { ...PLANO, seed: SEED })
      await buildAndSelect(page)
    },
  },
  {
    id: 'move',
    title: 'Mover edificio',
    setup: async ({ page }) => {
      await openValley(page, { ...PLANO, seed: SEED })
      await buildAndSelect(page)
      await click(page, 'Mover', true)
      await expect(page.getByRole('region', { name: 'Mover edificio' })).toBeVisible()
    },
  },
]

interface Entry {
  viewport: string
  scene: string
  title: string
  file: string
  /** Coverage % of the canvas, or undefined if the scene failed. */
  coverage?: number
  focusKo: string[]
  controlsKo: number
  error?: string
}

function parseArgs(argv: string[]) {
  const list = (name: string): string[] | undefined => {
    const a = argv.find((x) => x.startsWith(`--${name}=`))
    return a
      ? a
          .slice(name.length + 3)
          .split(',')
          .filter(Boolean)
      : undefined
  }
  return {
    overlay: argv.includes('--overlay'),
    scenes: list('scene'),
    viewports: list('viewport'),
  }
}

/** Draws the counted boxes, the coverage and the focus squares over the page (not the canvas). */
async function drawOverlay(page: Page, r: InterfaceReport): Promise<void> {
  await page.evaluate(
    ({ rects, coverage, focus }) => {
      const root = document.createElement('div')
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
      const box = (q: Rect, css: string): HTMLElement => {
        const d = document.createElement('div')
        d.style.cssText = `position:absolute;box-sizing:border-box;left:${q.x}px;top:${q.y}px;width:${q.w}px;height:${q.h}px;${css}`
        root.appendChild(d)
        return d
      }
      for (const q of rects)
        box(q, 'background:rgba(255,0,0,.22);outline:1px solid rgba(255,0,0,.8)')
      for (const f of focus) {
        if (!f.area) continue
        const color = f.ok ? '#00c800' : '#ff0000'
        const d = box(f.area, `border:3px solid ${color};background:${color}18`)
        const t = document.createElement('span')
        t.textContent = `${f.name} ${(f.visible * 100).toFixed(0)} %`
        t.style.cssText = `position:absolute;left:2px;top:2px;font:bold 10px monospace;color:#fff;background:${color};padding:0 2px`
        d.appendChild(t)
      }
      const label = document.createElement('div')
      label.textContent = `coverage ${(coverage * 100).toFixed(1)} %`
      label.style.cssText =
        'position:absolute;left:50%;bottom:4px;transform:translateX(-50%);font:bold 13px monospace;color:#fff;background:#000c;padding:2px 6px'
      root.appendChild(label)
      document.body.appendChild(root)
    },
    { rects: r.rects, coverage: r.coverage, focus: r.focus },
  )
}

async function runViewport(
  browser: Browser,
  baseURL: string,
  vp: (typeof VIEWPORTS)[number],
  scenes: Scene[],
  overlay: boolean,
): Promise<Entry[]> {
  const size = { width: vp.w, height: vp.h }
  const entries: Entry[] = []
  for (const scene of scenes) {
    // One context per scene: every scene starts from a clean state (storage, camera, mode).
    const context = await browser.newContext(
      vp.mobile
        ? { ...devices['Pixel 7'], baseURL, viewport: size, screen: size }
        : { baseURL, viewport: size },
    )
    const page = await context.newPage()
    const file = `${vp.id}/${scene.id}.png`
    const entry: Entry = {
      viewport: vp.id,
      scene: scene.id,
      title: scene.title,
      file,
      focusKo: [],
      controlsKo: 0,
    }
    try {
      await scene.setup({ page, mobile: vp.mobile })
      if (!scene.cover) {
        expect(await page.evaluate(() => window.__raices?.vados()?.lado)).toBe(SIDE)
        await waitFrames(page, 3)
        await cameraSettled(page)
        await waitFrames(page, 2)
      }
      const report = await measureInterface(page)
      entry.coverage = report.coverage * 100
      entry.focusKo = report.focus.filter((f) => !f.ok).map((f) => f.name)
      entry.controlsKo = report.controls.length
      if (overlay) await drawOverlay(page, report)
      await page.screenshot({ path: `${OUT}/${file}` })
    } catch (e) {
      entry.error = e instanceof Error ? e.message.split('\n')[0] : String(e)
    } finally {
      await context.close()
    }
    entries.push(entry)
    console.log(
      `${vp.id.padEnd(8)} ${scene.id.padEnd(22)} ` +
        (entry.error
          ? `ERROR ${entry.error}`
          : `${entry.coverage?.toFixed(1).padStart(5)} %` +
            (entry.focusKo.length ? `  focus KO: ${entry.focusKo.join(', ')}` : '') +
            (entry.controlsKo ? `  controls KO: ${entry.controlsKo}` : '')),
    )
  }
  return entries
}

const esc = (s: string): string =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )

function writeIndex(entries: Entry[], overlay: boolean): void {
  const viewports = [...new Set(entries.map((e) => e.viewport))]
  const sections = viewports
    .map((v) => {
      const cards = entries
        .filter((e) => e.viewport === v)
        .map((e) => {
          const note = e.error
            ? `<b class="ko">ERROR: ${esc(e.error)}</b>`
            : `${(e.coverage ?? 0).toFixed(1)} % coverage` +
              (e.focusKo.length
                ? ` · <b class="ko">focus KO: ${esc(e.focusKo.join(', '))}</b>`
                : '') +
              (e.controlsKo ? ` · <b class="ko">controls KO: ${e.controlsKo}</b>` : '')
          const img = e.error ? '' : `<a href="${e.file}"><img src="${e.file}" loading="lazy"></a>`
          return `<figure>${img}<figcaption><b>${esc(e.title)}</b> <code>${e.scene}</code><br>${note}</figcaption></figure>`
        })
        .join('\n')
      return `<h2>${v}</h2>\n<div class="grid" data-vp="${v}">\n${cards}\n</div>`
    })
    .join('\n')
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Raíces: capturas por escenas</title>
<style>
body{font:14px system-ui,sans-serif;margin:16px;background:#f4f1ea;color:#222}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #ccc;padding:6px}
img{width:100%;height:auto;display:block;border:1px solid #999}
figcaption{margin-top:4px;font-size:12px}.ko{color:#b00020}
</style></head><body>
<h1>Raíces: capturas por escenas${overlay ? ' (con overlay)' : ''}</h1>
<p>Cobertura = área de las cajas opacas del HUD / área del lienzo. Pulsa una captura para verla a tamaño real.</p>
${sections}
</body></html>
`
  writeFileSync(`${OUT}/index.html`, html)
  writeFileSync(`${OUT}/report.json`, JSON.stringify(entries, null, 2))
}

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`The preview server does not respond at ${url}`)
}

const args = parseArgs(process.argv.slice(2))
const scenes = args.scenes ? SCENES.filter((s) => args.scenes?.includes(s.id)) : SCENES
const viewports = args.viewports
  ? VIEWPORTS.filter((v) => args.viewports?.includes(v.id))
  : VIEWPORTS
if (scenes.length === 0 || viewports.length === 0) {
  console.error(
    `Nothing to capture. Scenes: ${SCENES.map((s) => s.id).join(', ')}. Viewports: ${VIEWPORTS.map((v) => v.id).join(', ')}`,
  )
  process.exit(1)
}

const started = Date.now()
rmSync(OUT, { recursive: true, force: true })
for (const v of viewports) mkdirSync(`${OUT}/${v.id}`, { recursive: true })
// Vite is launched straight with Node (no shell) so it can be closed reliably on Windows too.
const vite = join(
  dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin/vite.js',
)
const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
let browser: Browser | undefined
try {
  const baseURL = `http://localhost:${PORT}/`
  await waitForServer(baseURL)
  browser = await chromium.launch()
  const results = await Promise.all(
    viewports.map((vp) => runViewport(browser as Browser, baseURL, vp, scenes, args.overlay)),
  )
  const entries = results.flat()
  writeIndex(entries, args.overlay)
  const failed = entries.filter((e) => e.error).length
  console.log(
    `\n${entries.length - failed}/${entries.length} captures in ${((Date.now() - started) / 1000).toFixed(0)} s -> ${OUT}/index.html`,
  )
  if (failed) process.exitCode = 1
} finally {
  await browser?.close()
  server.kill()
}
