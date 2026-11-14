import { readFileSync } from 'node:fs'
import { devices, type Browser, type Page } from '@playwright/test'
import { cameraSettled, emit, expect, openValley, test, waitFrames } from './apoyo/game'
import { measureInterface, type InterfaceReport } from './apoyo/interface'

/**
 * Breaker round for HUD-01 (PR #83): worst-case notice, speed menu, touches through the bar,
 * camera edges, rotation with the inventory open, #63 and #29. Own contexts, one project only.
 */
const VIEWPORTS = [
  { id: '1280x720', w: 1280, h: 720, mobile: false },
  { id: '412x915', w: 412, h: 915, mobile: true },
  { id: '915x412', w: 915, h: 412, mobile: true },
  { id: '640x320', w: 640, h: 320, mobile: true },
]
const SIDE = 96
const OWNED = [14, 15, 20, 21]

async function withPage(
  browser: Browser,
  baseURL: string,
  vp: { w: number; h: number; mobile: boolean },
  body: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext(
    vp.mobile
      ? {
          ...devices['Pixel 7'],
          baseURL,
          viewport: { width: vp.w, height: vp.h },
          screen: { width: vp.w, height: vp.h },
        }
      : { baseURL, viewport: { width: vp.w, height: vp.h } },
  )
  const page = await context.newPage()
  try {
    await body(page)
  } finally {
    await context.close()
  }
}

const measure = (page: Page): Promise<InterfaceReport> =>
  measureInterface(page, { radius: 3, parcelMin: 0.5, parcelTiles: 16 })

async function settle(page: Page): Promise<void> {
  await waitFrames(page, 3)
  await cameraSettled(page)
  await waitFrames(page, 2)
}

const pct = (r: InterfaceReport): string => `${(r.coverage * 100).toFixed(1)} %`
const focusKo = (r: InterfaceReport): string[] => r.focus.filter((f) => !f.ok).map((f) => f.detail)

async function showNotice(page: Page): Promise<void> {
  await page.locator('#juego').focus()
  await page.keyboard.press('z')
  await expect(page.locator('.aviso')).toBeVisible()
}

async function setNotice(page: Page, text: string): Promise<void> {
  await page.evaluate((s) => {
    const el = document.querySelector('.aviso')
    if (el) el.textContent = s
  }, text)
  await waitFrames(page, 1)
}

test.describe('HUD-01 breaker', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'escritorio', 'own contexts: one project')
  })
  test.describe.configure({ timeout: 240_000 })

  test('worst-case notice (long, several sentences) stays <= 15 % with the focus free', async ({
    browser,
    baseURL,
  }) => {
    const long =
      'Te quedaste dormido… Despiertas en la entrada del valle. Obra terminada: Cobertizo. Obra terminada: Casa. Obra terminada: Caja de envío'
    for (const vp of VIEWPORTS) {
      await withPage(browser, baseURL as string, vp, async (page) => {
        await openValley(page, {
          noCounter: true,
          seed: 42,
          at: { x: 48, y: 48 },
          noticeMs: 60_000,
        })
        await showNotice(page)
        // Same element and CSS as the real notice, with the text that a day change can produce.
        await setNotice(page, long)
        await settle(page)
        const r = await measure(page)
        test.info().annotations.push({ type: `notice-long ${vp.id}`, description: pct(r) })
        expect.soft(r.coverage, `${vp.id} long notice ${pct(r)}`).toBeLessThanOrEqual(0.15)
        expect.soft(focusKo(r), `${vp.id} focus`).toEqual([])
        expect.soft(r.controls, `${vp.id} controls`).toEqual([])
      })
    }
  })

  test('640x320: every notice text of the game stays <= 15 %', async ({ browser, baseURL }) => {
    const es = JSON.parse(readFileSync('src/ui/textos/es.json', 'utf8')) as Record<string, string>
    const texts = Object.entries(es)
      .filter(([k]) => /^(aviso|errorDormir|errorHerramienta)/.test(k))
      .map(([, v]) => v.replace(/\{[a-z]+\}/g, '1.000'))
    await withPage(browser, baseURL as string, VIEWPORTS[3], async (page) => {
      await openValley(page, { noCounter: true, seed: 42, at: { x: 48, y: 48 }, noticeMs: 60_000 })
      await showNotice(page)
      const worst: { txt: string; cov: number }[] = []
      for (const txt of texts) {
        await setNotice(page, txt)
        worst.push({ txt, cov: (await measure(page)).coverage })
      }
      worst.sort((a, b) => b.cov - a.cov)
      test.info().annotations.push({
        type: 'worst notices 640x320',
        description: worst
          .slice(0, 3)
          .map((w) => `${(w.cov * 100).toFixed(1)} % ${w.txt}`)
          .join(' || '),
      })
      expect(worst[0].cov, `worst: ${worst[0].txt}`).toBeLessThanOrEqual(0.15)
    })
  })

  test('speed menu at 640x320: opens inside the screen, no overlaps, within thresholds', async ({
    browser,
    baseURL,
  }) => {
    for (const mode of ['vida', 'plano'] as const) {
      await withPage(browser, baseURL as string, VIEWPORTS[3], async (page) => {
        await openValley(page, {
          noCounter: true,
          seed: 42,
          ...(mode === 'plano' ? { mode: 'plano', owned: OWNED, money: 5000 } : {}),
        })
        await page.locator('.boton-tiempo-menu').dispatchEvent('click')
        await expect(page.locator('.controles-tiempo')).toHaveAttribute('data-abierto', 'true')
        await settle(page)
        const r = await measure(page)
        test.info().annotations.push({ type: `speed-menu ${mode}`, description: pct(r) })
        // The open menu is a transient list, not a panel: the bare threshold applies in Vida.
        expect
          .soft(r.coverage, `${mode} ${pct(r)}`)
          .toBeLessThanOrEqual(mode === 'vida' ? 0.15 : 0.45)
        expect.soft(r.controls, `${mode} controls`).toEqual([])
        expect.soft(focusKo(r), `${mode} focus`).toEqual([])
      })
    }
  })

  test('touches: no dead zone inside the bar, buttons are hit at their centre, a gap tap does not use the tool', async ({
    browser,
    baseURL,
  }) => {
    for (const vp of VIEWPORTS.filter((v) => v.mobile)) {
      await withPage(browser, baseURL as string, vp, async (page) => {
        await openValley(page, { noCounter: true, seed: 42, at: { x: 48, y: 48 } })
        await settle(page)
        const probe = await page.evaluate(() => {
          const out: string[] = []
          const cont = document.querySelector('.barra-inferior-caja') as HTMLElement
          const r = cont.getBoundingClientRect()
          for (let y = Math.floor(r.top) + 1; y < r.bottom; y += 6)
            for (let x = Math.floor(r.left) + 1; x < r.right; x += 6) {
              const el = document.elementFromPoint(x, y)
              if (!el || el.id === 'juego' || el.closest('button')) continue
              if (el.closest('.hud'))
                out.push(`${Math.round(x)},${Math.round(y)} -> ${el.className || el.tagName}`)
            }
          const hidden = [...document.querySelectorAll('.barra-inferior-caja button')]
            .filter((b) => b.getBoundingClientRect().width > 0)
            .filter((b) => {
              const q = b.getBoundingClientRect()
              const el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)
              return !(el === b || b.contains(el))
            })
            .map((b) => b.getAttribute('aria-label') ?? b.textContent)
          return { out: out.slice(0, 8), n: out.length, hidden }
        })
        test
          .info()
          .annotations.push({ type: `touch ${vp.id}`, description: `${probe.n} dead points` })
        expect.soft(probe.n, `${vp.id} dead zones in the bar: ${probe.out.join(' | ')}`).toBe(0)
        expect.soft(probe.hidden, `${vp.id} buttons hidden at their centre`).toEqual([])
      })
    }
    await withPage(browser, baseURL as string, VIEWPORTS[2], async (page) => {
      await openValley(page, { noCounter: true, seed: 42, at: { x: 48, y: 48 } })
      await settle(page)
      const gap = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('.barra-inferior-caja button')]
          .map((b) => b.getBoundingClientRect())
          .filter((r) => r.width > 0)
          .sort((a, b) => a.left - b.left)
        for (let i = 0; i + 1 < bs.length; i++) {
          const g = bs[i + 1].left - bs[i].right
          if (g >= 3)
            return { x: (bs[i].right + bs[i + 1].left) / 2, y: bs[i].top + bs[i].height / 2 }
        }
        return undefined
      })
      expect(gap, 'a gap between buttons').toBeDefined()
      const before = await page.evaluate(() => window.__raices?.energia())
      await page.touchscreen.tap((gap as { x: number }).x, (gap as { y: number }).y)
      await waitFrames(page, 5)
      expect(
        await page.evaluate(() => window.__raices?.energia()),
        'tool not used by a gap tap',
      ).toBe(before)
    })
  })

  test('rotation with the inventory open: panel inside, focus free, controls reachable', async ({
    browser,
    baseURL,
  }) => {
    await withPage(browser, baseURL as string, VIEWPORTS[1], async (page) => {
      await openValley(page, { noCounter: true, seed: 42, noticeMs: 60_000 })
      await page.getByRole('button', { name: 'Inventario', exact: true }).dispatchEvent('click')
      await expect(page.getByRole('region', { name: 'Inventario' })).toBeVisible()
      for (const [w, h] of [
        [915, 412],
        [640, 320],
        [412, 915],
        [640, 320],
        [320, 568],
        [915, 412],
      ] as const) {
        await page.setViewportSize({ width: w, height: h })
        await settle(page)
        const r = await measure(page)
        const key = `${w}x${h}`
        test.info().annotations.push({ type: `rot-inv ${key}`, description: pct(r) })
        expect.soft(r.controls, `${key} controls`).toEqual([])
        // 320x568 only needs reachable controls (interface-rule R5); recorded, not judged.
        if (w === 320) continue
        expect.soft(focusKo(r), `${key} focus`).toEqual([])
        expect
          .soft(r.coverage, `${key} ${pct(r)}`)
          .toBeLessThanOrEqual(key === '640x320' ? 0.45 : 0.35)
        const panel = await page.getByRole('region', { name: 'Inventario' }).boundingBox()
        expect
          .soft(!!panel && panel.y >= 0 && panel.y + panel.height <= h + 1, `${key} panel inside`)
          .toBe(true)
      }
    })
  })

  test('camera edges (N, S, W, E middles, near-corners): 7x7 free at every viewport', async ({
    browser,
    baseURL,
  }) => {
    const spots: [string, number, number][] = [
      ['N', 48, 0],
      ['S', 48, SIDE - 1],
      ['W', 0, 48],
      ['E', SIDE - 1, 48],
      ['N2', 20, 1],
      ['NE', SIDE - 1, 0],
    ]
    for (const vp of VIEWPORTS) {
      await withPage(browser, baseURL as string, vp, async (page) => {
        for (const [id, x, y] of spots) {
          await openValley(page, { noCounter: true, seed: 42, at: { x, y } })
          await settle(page)
          const r = await measure(page)
          test.info().annotations.push({ type: `edge ${vp.id} ${id}`, description: pct(r) })
          expect.soft(focusKo(r), `${vp.id} ${id}`).toEqual([])
          expect.soft(r.coverage, `${vp.id} ${id} ${pct(r)}`).toBeLessThanOrEqual(0.15)
        }
      })
    }
  })

  test('#63 notice over the site tiles and #29 HUD over the corner tile of an owned parcel', async ({
    browser,
    baseURL,
  }) => {
    for (const vp of VIEWPORTS.slice(2)) {
      await withPage(browser, baseURL as string, vp, async (page) => {
        await openValley(page, {
          mode: 'plano',
          owned: OWNED,
          money: 5000,
          noCounter: true,
          seed: 42,
          noticeMs: 60_000,
        })
        await emit(page, { tipo: 'PintarZona', x0: 32, y0: 32, x1: 63, y1: 63, zona: 'vivienda' })
        const spot = await page.evaluate(() => {
          const r = window.__raices
          for (let d = 0; d < 12; d++)
            for (let y = 48 - d; y <= 48 + d; y++)
              for (let x = 48 - d; x <= 48 + d; x++)
                if (r?.colocacion('casa', x, y)?.valida) return { x, y }
          return undefined
        })
        expect(spot, 'a spot for the house').toBeDefined()
        await emit(page, { tipo: 'Construir', tipoEdificio: 'casa', ...spot })
        await expect.poll(() => page.evaluate(() => window.__raices?.edificios().length)).toBe(1)
        await page.evaluate(
          (s) => window.__raices?.centrarCamara((s as { x: number }).x, (s as { y: number }).y),
          spot,
        )
        await settle(page)
        await expect(page.locator('.aviso')).toBeVisible()
        const hits = await page.evaluate((s) => {
          const r = window.__raices
          const a = document.querySelector('.aviso')?.getBoundingClientRect()
          const { x, y } = s as { x: number; y: number }
          const out: string[] = []
          for (let dy = -4; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const p = r?.puntoClicCasilla(x + dx, y + dy)
              if (a && p && p.x >= a.left && p.x <= a.right && p.y >= a.top && p.y <= a.bottom)
                out.push(`${x + dx},${y + dy}`)
            }
          return out
        }, spot)
        test
          .info()
          .annotations.push({
            type: `#63 ${vp.id}`,
            description: `${hits.length} tiles under the notice`,
          })
        expect.soft(hits, `${vp.id} notice over the site tiles`).toEqual([])
        await page.evaluate(() => window.__raices?.centrarCamara(32, 32))
        await settle(page)
        const corner = await page.evaluate(() => {
          const p = window.__raices?.puntoClicCasilla(32, 32)
          if (!p) return 'not visible'
          return document
            .elementsFromPoint(p.x, p.y)
            .filter((e) => e.closest('.hud') && e.id !== 'juego')
            .filter(
              (e) =>
                e.matches('button, p, h2, [class*=reloj], [class*=dinero]') ||
                getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)',
            )
            .map((e) => e.className || e.tagName)
            .join(',')
        })
        expect.soft(corner, `${vp.id} corner tile (32,32) under HUD`).toBe('')
      })
    }
  })
})
