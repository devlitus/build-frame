/**
 * Performance batch (`@rendimiento`, E2E-19): the only e2e tests that measure fps or real time. They
 * run alone with one worker (`npm run e2e:rendimiento`, projects `rendimiento-*`): with parallel
 * workers fps drop and the clamped delta (100 ms) slows the game clock.
 *
 * Every number has a target (noted with `target()`, never fails) and a floor (a normal `expect`, about
 * 60 % of the target) so only a real regression breaks the run. CI has no GPU, so the thresholds must
 * hold with software rendering and this batch does not run there.
 *
 * P1 drag and zoom of the Plano (desktop and mobile) · P2 full farm: Plano, panel, Life and moving
 * the silhouette (desktop) · P3 walking at night with the HUD (mobile) · P4 real-time clock (desktop)
 * · P5 baked terrain and bounded object layer at minimum zoom (desktop).
 */
import type { CDPSession, Page } from '@playwright/test'
import {
  cameraSettled,
  centerOn,
  emit,
  expect,
  openValley,
  test,
  waitFrames,
} from './apoyo/game.ts'
import { target } from './apoyo/rendimiento.ts'

/** Fps objective of every scenario; the floor is 60 % of it. */
const TARGET_FPS = 15
const FLOOR_FACTOR = 0.6

/** Notes the objective (`target`) and fails below the floor (`expect`). */
function checkFps(label: string, fps: number, goal = TARGET_FPS): void {
  target(fps > goal, `${label}: ${fps.toFixed(1)} fps, target > ${goal.toFixed(1)}`)
  expect(fps, `floor ${label}`).toBeGreaterThan(goal * FLOOR_FACTOR)
}

/** Loop-frame counter of the game (`frame()` hook) and the page clock, read in one evaluate. */
const readFrames = (page: Page) =>
  page.evaluate(() => ({ f: window.__raices?.frame() ?? 0, t: performance.now() }))

/**
 * Mean fps of the game loop while `action` runs. Without an action it measures the idle scene for
 * `ms` (counting animation frames inside the page, not sleeping in the test).
 */
async function sampleFps(page: Page, action?: () => Promise<void>, ms = 2500): Promise<number> {
  const a = await readFrames(page)
  if (action) await action()
  else
    await page.evaluate(
      (d) =>
        new Promise<void>((resolve) => {
          const t0 = performance.now()
          const tick = (): void => {
            if (performance.now() - t0 >= d) resolve()
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      ms,
    )
  const b = await readFrames(page)
  return ((b.f - a.f) * 1000) / (b.t - a.t)
}

/** Runs `step(i)` in a loop for about `ms` of real time (an input stream of fixed duration). */
async function stream(ms: number, step: (i: number) => Promise<void>): Promise<void> {
  const end = Date.now() + ms
  for (let i = 0; Date.now() < end; i++) await step(i)
}

const viewport = (page: Page) => page.viewportSize() ?? { width: 1280, height: 720 }

const FARM_ZONES = ['vivienda', 'almacen', 'cultivo', 'huerto'] as const
const ALL_PARCELS = Array.from({ length: 36 }, (_, i) => i)

/** Paints every zone and builds the house and 3 boxes (all the starting wood). Returns the buildings. */
async function fillFarm(page: Page): Promise<number> {
  return page.evaluate((zones) => {
    const r = window.__raices
    if (!r) return 0
    for (let i = 0; i < 24; i++)
      r.emitir({
        tipo: 'PintarZona',
        x0: 0,
        y0: i * 4,
        x1: 95,
        y1: i * 4 + 3,
        zona: zones[i % 4] as string,
      })
    let n = 0
    for (const [tipo, max] of [
      ['casa', 1],
      ['caja-envio', 4],
    ] as const)
      for (let y = 20; y < 96 && n < max; y += 7)
        for (let x = 10; x < 96 && n < max; x += 13)
          if (r.colocacion(tipo, x, y)?.valida) {
            r.emitir({ tipo: 'Construir', tipoEdificio: tipo, x, y })
            n++
          }
    return n
  }, FARM_ZONES)
}

test.describe('performance', () => {
  test.setTimeout(90_000)

  test(
    'P1 plano drag and zoom keep a playable fps',
    { tag: '@rendimiento' },
    async ({ page, isMobile }) => {
      await openValley(page, { mode: 'plano', noCounter: true })
      const v = viewport(page)
      const cx = v.width / 2
      const cy = v.height / 2
      let drag: number
      let zoom: number
      if (isMobile) {
        const cdp: CDPSession = await page.context().newCDPSession(page)
        const touch = async (
          type: 'touchStart' | 'touchMove' | 'touchEnd',
          pts: [number, number][],
        ): Promise<void> => {
          await cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
          })
        }
        await touch('touchStart', [[cx, cy]])
        drag = await sampleFps(page, () =>
          stream(3000, (i) =>
            touch('touchMove', [[cx + (i % 2 ? 90 : -90), cy + (i % 2 ? 50 : -50)]]),
          ),
        )
        await touch('touchEnd', [])
        await touch('touchStart', [
          [cx - 40, cy],
          [cx + 40, cy],
        ])
        zoom = await sampleFps(page, () =>
          stream(3000, (i) => {
            const d = 40 + 50 * Math.abs(Math.sin(i / 6))
            return touch('touchMove', [
              [cx - d, cy],
              [cx + d, cy],
            ])
          }),
        )
        await touch('touchEnd', [])
      } else {
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        drag = await sampleFps(page, () =>
          stream(3000, (i) => page.mouse.move(cx + (i % 2 ? 150 : -150), cy + (i % 2 ? 80 : -80))),
        )
        await page.mouse.up()
        zoom = await sampleFps(page, () =>
          stream(3000, (i) => page.mouse.wheel(0, Math.floor(i / 8) % 2 ? 160 : -160)),
        )
      }
      test.info().annotations.push({
        type: 'fps',
        description: `drag ${drag.toFixed(1)}, zoom ${zoom.toFixed(1)}`,
      })
      console.log(
        `[P1 ${test.info().project.name}] drag ${drag.toFixed(1)}, zoom ${zoom.toFixed(1)} fps`,
      )
      checkFps('drag', drag)
      checkFps('zoom', zoom)
    },
  )

  test(
    'P2 full farm: plano, building panel, life and moving the silhouette',
    { tag: '@rendimiento' },
    async ({ page, isMobile }) => {
      test.skip(isMobile, 'desktop only')
      await openValley(page, {
        mode: 'plano',
        money: 100_000_000,
        owned: ALL_PARCELS,
        noCounter: true,
      })
      const empty = await sampleFps(page)
      const buildings = await fillFarm(page)
      expect(buildings, 'buildings placed').toBeGreaterThan(0)
      await centerOn(page, 48, 48)
      const plano = await sampleFps(page)
      await page.evaluate(() => {
        const r = window.__raices
        r?.seleccionarEdificio(r.edificios()[0]?.id ?? 0)
      })
      await expect(page.getByRole('button', { name: /^(Cancelar obra|Demoler)/ })).toBeVisible()
      const panel = await sampleFps(page)
      // Moving the silhouette of a new building over the full farm.
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Construir', exact: true }).click()
      const catalog = page.getByRole('region', { name: 'Construir' })
      await catalog.getByRole('button', { name: /^Cobertizo/ }).click()
      await expect
        .poll(() => page.evaluate(() => window.__raices?.construccion()?.silueta !== undefined))
        .toBe(true)
      const v = viewport(page)
      const silhouette = await sampleFps(page, () =>
        stream(3000, (i) => {
          const t = (i % 60) / 60
          return page.mouse.move(
            v.width * (0.3 + 0.4 * t),
            v.height * (0.15 + 0.4 * Math.abs(Math.sin(t * 9))),
          )
        }),
      )
      await emit(page, { tipo: 'CambiarModo', modo: 'vida' })
      await emit(page, { tipo: 'Pausar' })
      await waitFrames(page, 3)
      const life = await sampleFps(page)
      const msg = `buildings ${buildings}; empty ${empty.toFixed(1)}, plano ${plano.toFixed(1)}, panel ${panel.toFixed(1)}, silhouette ${silhouette.toFixed(1)}, life ${life.toFixed(1)}`
      test.info().annotations.push({ type: 'fps', description: msg })
      console.log(`[P2 ${test.info().project.name}] ${msg}`)
      // Objective: > min(15, 60 % of the empty valley), so a slow machine does not blame the farm.
      const goal = Math.min(TARGET_FPS, empty * 0.6)
      checkFps('plano', plano, goal)
      checkFps('panel', panel, goal)
      checkFps('silhouette', silhouette, goal)
      checkFps('life', life, goal)
    },
  )

  test('P3 walking at night with the HUD', { tag: '@rendimiento' }, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only')
    await openValley(page, { hour: '23:00', noCounter: true })
    const idle = await sampleFps(page)
    await page.keyboard.down('KeyD')
    const walking = await sampleFps(page, undefined, 3000)
    await page.keyboard.up('KeyD')
    const msg = `night idle ${idle.toFixed(1)}, night walking ${walking.toFixed(1)}`
    test.info().annotations.push({ type: 'fps', description: msg })
    console.log(`[P3 ${test.info().project.name}] ${msg}`)
    checkFps('night walking', walking)
  })

  test(
    'P4 real-time clock: x1 is about 1.33 game min/s and x2/x3 scale',
    { tag: '@rendimiento' },
    async ({ page, isMobile }) => {
      test.skip(isMobile, 'desktop only')
      await openValley(page, { noCounter: true })
      /** Game minutes per real second while the clock advances `minutes` (measured inside the page). */
      const rate = (speed: number, minutes: number) =>
        page.evaluate(
          ({ speed, minutes }) =>
            new Promise<number>((resolve) => {
              const r = window.__raices
              if (!r) return resolve(0)
              r.emitir({ tipo: 'CambiarVelocidad', velocidad: speed })
              // The clock shows whole minutes: start timing on a minute change and stop on another,
              // so the quantisation does not bias the rate.
              const first = r.reloj()?.minutoDelDia ?? 0
              let m0 = -1
              let t0 = 0
              const tick = (): void => {
                const m = r.reloj()?.minutoDelDia ?? 0
                if (m0 < 0) {
                  if (m !== first) {
                    m0 = m
                    t0 = performance.now()
                  }
                } else if (m - m0 >= minutes) {
                  resolve(((m - m0) * 1000) / (performance.now() - t0))
                  return
                }
                requestAnimationFrame(tick)
              }
              requestAnimationFrame(tick)
            }),
          { speed, minutes },
        )
      await rate(1, 2) // warm-up: the clock runs slower while the scene is still settling
      const x1 = await rate(1, 6)
      const x2 = await rate(2, 6)
      const x3 = await rate(3, 6)
      const msg = `x1 ${x1.toFixed(2)} min/s, x2 ${(x2 / x1).toFixed(2)}x, x3 ${(x3 / x1).toFixed(2)}x`
      test.info().annotations.push({ type: 'clock', description: msg })
      console.log(`[P4 ${test.info().project.name}] ${msg}`)
      // Targets: 1.1..1.5 min/s at x1 (a day is 15 real minutes) and x2/x3 within 10 % of 2 and 3.
      target(x1 > 1.1 && x1 < 1.5, `x1 ${x1.toFixed(2)} min/s outside 1.1..1.5`)
      target(Math.abs(x2 / x1 - 2) < 0.2, `x2/x1 ${(x2 / x1).toFixed(2)} not about 2`)
      target(Math.abs(x3 / x1 - 3) < 0.3, `x3/x1 ${(x3 / x1).toFixed(2)} not about 3`)
      // Floors: a clock that stalls or races (60 % of the lower bound, 2x the upper one).
      expect(x1, 'floor x1').toBeGreaterThan(0.66)
      expect(x1, 'ceiling x1').toBeLessThan(3)
      expect(x2 / x1, 'floor x2/x1').toBeGreaterThan(1.2)
      expect(x3 / x1, 'floor x3/x1').toBeGreaterThan(1.8)
      expect(x2 / x1, 'ceiling x2/x1').toBeLessThan(3)
      expect(x3 / x1, 'ceiling x3/x1').toBeLessThan(4.5)
    },
  )

  test(
    'P5 baked terrain and a bounded object layer at minimum zoom',
    { tag: '@rendimiento' },
    async ({ page, isMobile }) => {
      test.skip(isMobile, 'desktop only')
      const count = () =>
        page.evaluate(() => ({
          total: window.__raices?.objetosValle() ?? 0,
          capa: window.__raices?.objetosCapa() ?? { activos: 0, enVista: 0, obstaculos: 0 },
          graficos: window.__raices?.graficosValle() ?? [],
        }))
      await openValley(page, { noCounter: true })
      const first = await count()
      // Initial zoom: measured 256 on desktop out of 657 obstacles; the layer holds only what is in view.
      expect(first.capa.activos).toBeGreaterThan(0)
      expect(first.capa.activos).toBeLessThanOrEqual(350)
      expect(first.capa.activos).toBeLessThanOrEqual(first.capa.enVista)
      // Everything that is not the depth layer (trees, rocks): baked terrain, layers and graphics.
      expect(first.total).toBeLessThanOrEqual(20)
      // Only the parcel Graphics remains (about 1,600 entries; the whole checkerboard was over 30,000).
      for (const n of first.graficos) expect(n).toBeLessThan(5000)

      await emit(page, { tipo: 'CambiarModo', modo: 'plano' })
      const v = viewport(page)
      await page.mouse.move(v.width / 2, v.height / 2)
      for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 600)
      await expect
        .poll(async () => (await page.evaluate(() => window.__raices?.camara()))?.zoom ?? 99)
        .toBeLessThan(0.5)
      await cameraSettled(page)
      const min = await count()
      console.log(
        `[P5 ${test.info().project.name}] layer ${first.capa.activos} -> ${min.capa.activos} of ${min.capa.obstaculos}, other objects ${min.total}`,
      )
      expect(min.capa.activos).toBeGreaterThan(0)
      expect(min.capa.activos).toBeLessThanOrEqual(min.capa.enVista)
      expect(min.capa.obstaculos).toBeGreaterThan(0)
      expect(min.capa.activos).toBeLessThanOrEqual(min.capa.obstaculos)
      expect(min.total).toBeLessThanOrEqual(20)
    },
  )
})
