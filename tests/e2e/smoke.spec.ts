/**
 * Smoke (`@humo`, S1-S4): what the CI runs (docs/PROCESO.md section 5). The basic flows of the game
 * with a wide time margin: the GitHub runner has no GPU and runs at a few fps. Every test runs on
 * desktop and on emulated mobile.
 *
 * S1 boot · S2 move · S3 mode-switch · S4 accelerated-day
 */
import { expect, openValley, poll, test, unchanged, waitReady } from './apoyo/game.ts'
import {
  character,
  clickTile,
  clock,
  distance,
  requireCharacter,
  straightFreeTile,
  totalMinutes,
} from './apoyo/life.ts'

const HUMO = { tag: '@humo' }
const SLOW = { timeout: 30_000 }

// Was: portada › «la portada muestra el título y el lienzo del juego»,
// «el manifiesto PWA es accesible», «la ilustración de fondo se carga» · valle › «Nueva partida
// lleva al valle con una semilla nueva» · humo › «arrancar: la portada lleva al valle con el HUD» ·
// tiempo-hud › «el HUD muestra la hora, el día y la estación al empezar» ·
// m5-00-final › [S3] «mientras el arte se carga (valle aún no activo), camara() y personaje() no
// devuelven datos de una cámara sin configurar».
test(
  'S1 boot: start screen, art gating, new game opens the valley with the HUD',
  HUMO,
  async ({ page, request }) => {
    // [S3] While the art loads (slowed down) the valley scene exists but has no camera yet: the hooks
    // must not return data of an unconfigured camera. Sampled every frame inside the page.
    await page.route('**/assets/**', async (route) => {
      if (!/portada/.test(route.request().url())) await new Promise((r) => setTimeout(r, 600))
      await route.continue()
    })
    await page.goto('./?semilla=1')
    const bad = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const found: string[] = []
          const tick = (): void => {
            const r = window.__raices
            const scene = r?.escenaActiva()
            if (scene === 'valle') return resolve(found)
            if (scene && (r?.camara() || r?.personaje()))
              found.push(
                `scene ${scene}: camera ${JSON.stringify(r?.camara())} character ${JSON.stringify(r?.personaje())}`,
              )
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
    )
    expect(bad.slice(0, 2), 'camara()/personaje() while the art is loading').toEqual([])
    await waitReady(page)
    await page.unroute('**/assets/**')

    // The start screen: title, canvas, manifest and background illustration.
    const background = page.waitForResponse((r) => /portada-\d+\.webp$/.test(r.url()))
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Raíces' })).toBeVisible()
    await expect(page.locator('#juego canvas')).toBeVisible()
    expect((await background).ok()).toBe(true)
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    const manifest = await request.get(new URL(href ?? '', page.url()).toString())
    expect(manifest.ok()).toBe(true)
    expect((await manifest.json()).name).toBe('Raíces')

    // New game: the valley with a fresh seed and the HUD.
    await page.getByRole('button', { name: 'Nueva partida' }).click()
    await poll(() => page.evaluate(() => window.__raices?.escenaActiva()), SLOW).toBe('valle')
    await waitReady(page)
    await expect(page.getByRole('heading', { name: 'Raíces' })).toBeHidden()
    expect(typeof (await page.evaluate(() => window.__raices?.semilla()))).toBe('number')
    expect(await page.evaluate(() => window.__raices?.mundoPx())).toBeGreaterThan(0)
    await expect(page.getByRole('timer', { name: 'Hora del juego' })).toHaveText(/^\d\d:\d\d$/)
    await expect(page.getByText('Día 1 de Primavera')).toBeVisible()
    await expect(page.getByRole('button', { name: /Modo de juego/ })).toBeVisible()
  },
)

// Was: humo › «moverse con el teclado», «clic o toque hasta un destino cercano» · personaje ›
// «al pulsar una tecla de movimiento el personaje se mueve y la cámara lo sigue», «las flechas
// también mueven y al soltar se detiene».
test(
  'S2 move: keyboard on desktop, click or tap to a nearby tile',
  HUMO,
  async ({ page, isMobile }) => {
    await openValley(page)
    if (!isMobile) {
      const start = await requireCharacter(page)
      // The first direction with two free tiles; hold its key until the character has moved.
      const way = await straightFreeTile(page, 2)
      const key = way.dx === 1 ? 'd' : way.dx === -1 ? 'a' : way.dy === 1 ? 's' : 'w'
      await page.keyboard.down(key)
      await poll(
        async () => distance((await character(page)) ?? start, start),
        SLOW,
      ).toBeGreaterThan(0.3)
      await page.keyboard.up(key)
      // Released: it stops (the position stays put over several frames).
      await unchanged(page, () => JSON.stringify(window.__raices?.personaje()))
    }
    // Click or tap a free tile two steps away: the character walks there.
    const from = await requireCharacter(page)
    const way = await straightFreeTile(page, 2)
    const target = { x: Math.floor(from.x) + way.dx * 2, y: Math.floor(from.y) + way.dy * 2 }
    await clickTile(page, target.x, target.y)
    await poll(
      async () =>
        distance((await character(page)) ?? from, { x: target.x + 0.5, y: target.y + 0.5 }),
      SLOW,
    ).toBeLessThan(0.3)
  },
)

// Was: humo › «cambiar de modo detiene el reloj y volver lo reanuda» · modos › «el reloj se detiene
// en Plano» (logic in prop/modos-rompedor › «en Plano ni el reloj ni el personaje cambian…»).
test('S3 mode-switch: the Plano stops the clock and Life resumes it', HUMO, async ({ page }) => {
  await openValley(page)
  const mode = page.getByRole('button', { name: /Modo de juego/ })
  await mode.click()
  await poll(() => page.evaluate(() => window.__raices?.modo()), SLOW).toBe('plano')
  const frozen = await unchanged(page, () => window.__raices?.reloj()?.minutoDelDia)
  expect(frozen).toBeGreaterThan(0)
  await mode.click()
  await poll(() => page.evaluate(() => window.__raices?.modo()), SLOW).toBe('vida')
  await poll(async () => (await clock(page))?.minutoDelDia ?? 0, SLOW).toBeGreaterThan(frozen ?? 0)
})

// Was: humo › «un día acelerado pasa al día siguiente con el aviso» · tiempo-hud › «aceptación M2:
// pasa un día completo, con desmayo a las 02:00 y fecha nueva».
test(
  'S4 accelerated-day: the faint at 02:00 starts the next day at the spawn',
  HUMO,
  async ({ page }) => {
    await openValley(page, { hour: '01:30', speed: 50, noticeMs: 1500 })
    const spawn = await requireCharacter(page)
    await expect(page.getByRole('status')).toHaveText(/Te quedaste dormido/, SLOW)
    await poll(async () => (await clock(page))?.dia, SLOW).toBe(2)
    await expect(page.getByText('Día 2 de Primavera')).toBeVisible()
    expect(await totalMinutes(page)).toBeGreaterThanOrEqual(1200 + 360)
    expect(distance((await character(page)) ?? spawn, spawn)).toBeLessThan(0.2)
    // The notice does not block the game and goes away by itself.
    await expect(page.getByRole('status')).not.toHaveText(/Te quedaste dormido/, SLOW)
  },
)
