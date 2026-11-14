/**
 * Life-mode flows: F5 crop-cycle, F6 chop-mine, F7 energy-sleep, F8 inventory, F11 time-controls,
 * F12 walk-routes. Desktop and emulated mobile; the game logic lives in `src/core` (see
 * docs/planes/e2e-equivalencias.md), here only what needs the browser: the real HUD, keys, the
 * pointer and the scene. F5 and F8 are `@humo`.
 */
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { emit, expect, goTo, openValley, poll, test, unchanged } from './apoyo/game.ts'
import {
  ALL_PARCELS,
  clickTile,
  clock,
  energy,
  lastUse,
  quantityOf,
  requireCharacter,
  standingTileFacingSouth,
  straightFreeTile,
  totalMinutes,
  turn,
} from './apoyo/life.ts'

const SLOW = { timeout: 30_000 }

const toolbar = (page: Page) => page.getByRole('group', { name: 'Herramientas' })
const tool = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true })
const actionButton = (page: Page) => page.getByRole('button', { name: /^(Usar .+|Cosechar)$/ })
const sleepButton = (page: Page) => page.getByRole('button', { name: 'Dormir', exact: true })
const notice = (page: Page) => page.getByRole('status')
const modeButton = (page: Page) => page.getByRole('button', { name: /Modo de juego/ })
const meter = (page: Page) => page.getByRole('meter', { name: 'Energía' })
const toolState = (page: Page) => page.evaluate(() => window.__raices?.herramienta())
const useCount = async (page: Page) => (await lastUse(page))?.n ?? 0

/** Presses the action button and waits for the use to be recorded; returns the rejection, if any. */
async function use(page: Page): Promise<string | undefined> {
  const before = await useCount(page)
  await actionButton(page).click()
  await poll(() => useCount(page), SLOW).toBe(before + 1)
  return (await lastUse(page))?.error
}

// -------------------------------------------------------------------------------------------------
// F5 crop-cycle
// -------------------------------------------------------------------------------------------------

/** Days until the radish ripens (data/cultivos.json: [1, 1, 2]). */
const RADISH_DAYS = 4

// Was: cosechar › «arar, plantar, regar, dormir varios días y cosechar con el botón contextual».
test(
  'F5 crop-cycle: plough, sow, water, sleep and harvest with the contextual button',
  {
    tag: '@humo',
  },
  async ({ page }) => {
    // Four sleeps and walks: with every core busy (a bare `playwright test`) 30 s is not enough.
    test.setTimeout(60_000)
    await openValley(page, { owned: ALL_PARCELS })
    const stand = await standingTileFacingSouth(page)
    const front = { x: stand.x, y: stand.y + 1 }
    await goTo(page, stand, { faceSouth: true })
    await emit(page, {
      tipo: 'PintarZona',
      x0: front.x,
      y0: front.y,
      x1: front.x,
      y1: front.y,
      zona: 'cultivo',
    })
    expect(await page.evaluate((c) => window.__raices?.zonaDe(c.x, c.y), front)).toBe('cultivo')

    await tool(page, 'Azada').click()
    expect(await use(page)).toBeUndefined()
    await tool(page, 'Semillas').click()
    await emit(page, { tipo: 'ElegirSemilla', objeto: 'semilla-rabano' })
    expect(await use(page)).toBeUndefined()

    // Unripe, with the hand the button does not offer to harvest.
    await tool(page, 'Mano').click()
    await expect(actionButton(page)).not.toHaveText('Cosechar')

    // First day with the real HUD (watering and sleep buttons); the rest with the same commands the
    // buttons send, so the test does not pay for the HUD four times.
    await tool(page, 'Regadera').click()
    expect(await use(page)).toBeUndefined()
    await sleepButton(page).click()
    await poll(async () => (await clock(page))?.dia, SLOW).toBe(2)
    for (let day = 1; day < RADISH_DAYS; day++) {
      await goTo(page, stand, { faceSouth: true })
      await emit(page, { tipo: 'UsarHerramienta', x: front.x, y: front.y })
      expect((await lastUse(page))?.error).toBeUndefined()
      await emit(page, { tipo: 'Dormir' })
      await poll(async () => (await clock(page))?.dia, SLOW).toBe(day + 2)
    }
    await goTo(page, stand, { faceSouth: true })

    await tool(page, 'Mano').click()
    await expect(actionButton(page)).toHaveText('Cosechar')
    expect(await quantityOf(page, 'rabano')).toBe(0)
    expect(await use(page)).toBeUndefined()
    expect(await quantityOf(page, 'rabano')).toBe(1)
    await expect(notice(page)).toContainText('Cosechado: 1 × Rábano')
    await expect(actionButton(page)).not.toHaveText('Cosechar')
  },
)

// -------------------------------------------------------------------------------------------------
// F6 chop-mine (new)
// -------------------------------------------------------------------------------------------------

interface ObstacleSpot {
  o: { x: number; y: number }
  stand: { x: number; y: number }
  facing: { dx: number; dy: number }
  hits: number
  loot: number
}

/** Hits and loot per terrain (data/recursos.json). */
const RESOURCES = JSON.parse(readFileSync('data/recursos.json', 'utf8')) as {
  arbol: { golpes: Record<string, number>; madera: Record<string, number> }
  roca: { golpes: Record<string, number>; piedra: Record<string, number> }
}
const FULL_ENERGY = (JSON.parse(readFileSync('data/energia.json', 'utf8')) as { maximo: number })
  .maximo
const ENERGY_COST = { hacha: 4, pico: 4 } as const

/**
 * Closest tree or rock to the character with a free orthogonal neighbour to stand on, read from the
 * page (`obstaculos`, `parcelaInfo` and `bloqueada` hooks). Returns the obstacle, the tile to stand
 * on, the direction that faces it and what the data say it takes and gives.
 */
async function nearestObstacle(page: Page, type: 'arbol' | 'roca'): Promise<ObstacleSpot> {
  const found = await page.evaluate((t) => {
    const r = window.__raices
    const p = r?.personaje()
    if (!r || !p) return undefined
    const side = (r.mundoPx() ?? 3072) / 32 / 6
    const candidates = r
      .obstaculos()
      .filter((o) => o.tipo === t)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
    for (const o of candidates) {
      for (const [dx, dy] of [
        [0, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
      ] as const) {
        const stand = { x: o.x + dx, y: o.y + dy }
        if (r.bloqueada(stand.x, stand.y)) continue
        const index = Math.floor(o.y / side) * 6 + Math.floor(o.x / side)
        return { o, stand, facing: { dx: -dx, dy: -dy }, terrain: r.parcelaInfo(index)?.terreno }
      }
    }
    return undefined
  }, type)
  if (!found?.terrain) throw new Error(`no ${type} with a free side`)
  const table = type === 'arbol' ? RESOURCES.arbol : RESOURCES.roca
  const loot = type === 'arbol' ? RESOURCES.arbol.madera : RESOURCES.roca.piedra
  return {
    o: found.o,
    stand: found.stand,
    facing: found.facing,
    hits: table.golpes[found.terrain] ?? 0,
    loot: loot[found.terrain] ?? 0,
  }
}

// New. Logic: core/recursos.test.ts, prop/m5-simulation (talar, picar, energía).
for (const kind of [
  { type: 'arbol', tool: 'Hacha', material: 'madera' },
  { type: 'roca', tool: 'Pico', material: 'piedra' },
] as const) {
  test(`F6 chop-mine: the ${kind.tool.toLowerCase()} clears a ${kind.type} and gives ${kind.material}`, async ({
    page,
  }) => {
    // First open: the obstacles are read from the page; the second one starts next to the obstacle.
    await openValley(page, { owned: ALL_PARCELS })
    const { o, stand, facing, hits, loot } = await nearestObstacle(page, kind.type)
    await openValley(page, { owned: ALL_PARCELS, at: stand })
    await turn(page, facing.dx, facing.dy)
    expect(await page.evaluate((c) => window.__raices?.bloqueada(c.x, c.y), o)).toBe(true)
    const before = await page.evaluate(() => window.__raices?.materiales())

    await tool(page, kind.tool).click()
    for (let i = 0; i < hits; i++) {
      expect(await use(page), `hit ${i + 1} of ${hits}`).toBeUndefined()
      // Until the last hit the obstacle stays in its tile.
      if (i < hits - 1)
        expect(await page.evaluate((c) => window.__raices?.bloqueada(c.x, c.y), o)).toBe(true)
    }
    await poll(
      async () => (await page.evaluate(() => window.__raices?.materiales()))?.[kind.material],
    ).toBe((before?.[kind.material] ?? 0) + loot)
    expect(await page.evaluate((c) => window.__raices?.bloqueada(c.x, c.y), o)).toBe(false)
    expect(await energy(page)).toBe(
      FULL_ENERGY - hits * ENERGY_COST[kind.tool === 'Hacha' ? 'hacha' : 'pico'],
    )
  })
}

// -------------------------------------------------------------------------------------------------
// F7 energy-sleep
// -------------------------------------------------------------------------------------------------

/** Uses the tool `times` times on the character's own tile (hits the air; costs energy). */
async function spend(page: Page, toolName: string, times: number): Promise<void> {
  await page.evaluate(
    ({ h, n }) => {
      const r = window.__raices
      const p = r?.personaje()
      if (!r || !p) return
      r.emitir({ tipo: 'ElegirHerramienta', herramienta: h })
      for (let i = 0; i < n; i++)
        r.emitir({ tipo: 'UsarHerramienta', x: Math.floor(p.x), y: Math.floor(p.y) })
    },
    { h: toolName, n: times },
  )
}

// Was: energia › «la barra de energía es un medidor accesible», «usar la azada gasta 2 y el medidor lo
// refleja; la mano no gasta», «sin energía: el botón de acción avisa «Estás agotado»…», «el botón
// Dormir junto a la aparición pasa de día con la energía al máximo», «la tecla Z duerme y el botón
// solo se ve donde se puede dormir» · humo › «dormir junto a la aparición pasa de día…».
test('F7 energy-sleep: the meter follows the energy, exhaustion warns, sleeping restores it', async ({
  page,
  isMobile,
}) => {
  await openValley(page, { noticeMs: 3000 })
  await expect(meter(page)).toBeVisible()
  await expect(meter(page)).toHaveAttribute('aria-valuenow', '100')
  await expect(meter(page)).toHaveAttribute('aria-valuemax', '100')
  await expect(meter(page)).toHaveAttribute('aria-valuetext', '100 de 100')

  // The axe costs 4 per hit, the hand nothing.
  await spend(page, 'hacha', 10)
  await poll(() => energy(page)).toBe(60)
  await expect(meter(page)).toHaveAttribute('aria-valuetext', '60 de 100')
  await spend(page, 'mano', 5)
  expect(await energy(page)).toBe(60)

  // Exhausted: the action button warns and no energy is spent.
  await spend(page, 'hacha', 15)
  await poll(() => energy(page)).toBe(0)
  await actionButton(page).click()
  await expect(notice(page)).toContainText('Estás agotado')
  expect((await lastUse(page))?.error).toBe('sin-energia')
  expect(await energy(page)).toBe(0)

  // Sleeping next to the spawn: new day, full energy, the notice.
  const before = await clock(page)
  await expect(sleepButton(page)).toBeVisible()
  await sleepButton(page).click()
  await poll(() => energy(page)).toBe(100)
  const after = await clock(page)
  expect(after?.dia).toBe((before?.dia ?? 0) + 1)
  expect(after?.minutoDelDia).toBeLessThan(380)
  await expect(notice(page)).toContainText('Has dormido bien')
  await expect(meter(page)).toHaveAttribute('aria-valuenow', '100')

  if (isMobile) return
  // Keyboard: Z only sleeps where the button shows; far from the bed it explains why.
  await page.locator('#juego').focus()
  await expect(sleepButton(page)).toHaveAttribute('aria-keyshortcuts', 'Z')
  const way = await straightFreeTile(page, 6)
  const [away, back] =
    way.dx === 1 ? ['d', 'a'] : way.dx === -1 ? ['a', 'd'] : way.dy === 1 ? ['s', 'w'] : ['w', 's']
  await page.keyboard.down(away)
  await expect(sleepButton(page)).toBeHidden(SLOW)
  await page.keyboard.up(away)
  const day = (await clock(page))?.dia ?? 0
  await page.keyboard.press('z')
  await expect(notice(page)).toContainText('Para dormir vuelve a la entrada del valle')
  expect((await clock(page))?.dia).toBe(day)
  await page.keyboard.down(back)
  await expect(sleepButton(page)).toBeVisible(SLOW)
  await page.keyboard.up(back)
  await page.keyboard.press('z')
  await poll(async () => (await clock(page))?.dia, SLOW).toBe(day + 1)
})

// -------------------------------------------------------------------------------------------------
// F8 inventory
// -------------------------------------------------------------------------------------------------

const TOOL_NAMES = ['Azada', 'Regadera', 'Semillas', 'Mano', 'Hacha', 'Pico']
const TOOL_IDS = ['azada', 'regadera', 'semillas', 'mano', 'hacha', 'pico']

// Was: inventario › «la barra de herramientas muestra las seis…», «elegir una herramienta con un clic o
// un toque», «las teclas 1 a 6 eligen la herramienta», «E y Espacio usan la herramienta…», «el botón de
// acción usa la herramienta…», «inventario: el botón abre el panel…», «…elegir una semilla del panel…»,
// «…la tecla I y Escape…», «en el Modo Plano no hay barra…», «el inventario abierto se cierra al pasar
// al Modo Plano» · humo › «elegir una herramienta y abrir y cerrar el inventario».
test(
  'F8 inventory: tool bar, action button, inventory panel and the Plano',
  { tag: '@humo' },
  async ({ page, isMobile }) => {
    // Many HUD round trips: with every core busy (a bare `playwright test`) 30 s is not enough.
    test.setTimeout(60_000)
    await openValley(page)
    const panel = page.getByRole('region', { name: 'Inventario' })
    const inventoryButton = page.getByRole('button', { name: 'Inventario', exact: true })

    // The six tools, reachable (>= 44 px) and the azada active at the start.
    await expect(toolbar(page)).toBeVisible()
    for (const [i, name] of TOOL_NAMES.entries()) {
      const button = tool(page, name)
      await expect(button).toBeVisible()
      const box = await button.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
      await expect(button).toHaveAttribute('aria-keyshortcuts', String(i + 1))
    }
    await expect(tool(page, 'Azada')).toHaveAttribute('aria-pressed', 'true')

    // Choosing a tool; the seeds default to the first of the inventory.
    await tool(page, 'Hacha').click()
    expect((await toolState(page))?.herramienta).toBe('hacha')
    await expect(tool(page, 'Hacha')).toHaveAttribute('aria-pressed', 'true')
    await expect(tool(page, 'Azada')).toHaveAttribute('aria-pressed', 'false')
    await tool(page, 'Semillas').click()
    expect(await toolState(page)).toEqual({ herramienta: 'semillas', semilla: 'semilla-rabano' })

    // The action button uses the tool on the tile in front.
    await tool(page, 'Hacha').click()
    expect(await use(page)).toBeUndefined()
    expect(await lastUse(page)).toMatchObject({ n: 1, herramienta: 'hacha' })

    // The inventory panel: slots, quantities and capacity; choosing a seed activates «Semillas».
    await expect(panel).toHaveCount(0)
    await inventoryButton.click()
    await expect(panel).toBeVisible()
    await expect(panel.getByText('3 de 12 ranuras')).toBeVisible()
    await expect(
      panel.getByRole('list', { name: 'Ranuras del inventario' }).getByRole('listitem'),
    ).toHaveCount(12)
    await expect(panel.getByRole('button', { name: /^Semillas de rábano, 10/ })).toBeVisible()
    const strawberry = panel.getByRole('button', { name: /^Semillas de fresa, 5/ })
    await strawberry.click()
    expect(await toolState(page)).toEqual({ herramienta: 'semillas', semilla: 'semilla-fresa' })
    await expect(strawberry).toHaveAttribute('aria-pressed', 'true')
    await panel.getByRole('button', { name: 'Cerrar el inventario' }).click()
    await expect(panel).toHaveCount(0)

    if (!isMobile) {
      // Keys 1-6 choose, I opens and Escape closes, and the focus goes back to the game.
      for (const [i, id] of TOOL_IDS.entries()) {
        await page.keyboard.press(String(i + 1))
        await poll(async () => (await toolState(page))?.herramienta).toBe(id)
      }
      await page.keyboard.press('i')
      await expect(panel).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await page.keyboard.press('4')
      await poll(async () => (await toolState(page))?.herramienta).toBe('mano')
    }

    // The Plano has no tool bar and closes the inventory; Life brings them back.
    await inventoryButton.click()
    await expect(panel).toBeVisible()
    await modeButton(page).click()
    await expect(toolbar(page)).toHaveCount(0)
    await expect(panel).toHaveCount(0)
    expect(await page.evaluate(() => window.__raices?.inventario()?.abierto)).toBe(false)
    await expect(inventoryButton).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Usar / })).toHaveCount(0)
    await modeButton(page).click()
    await expect(toolbar(page)).toBeVisible()
    await expect(inventoryButton).toBeVisible()
  },
)

// -------------------------------------------------------------------------------------------------
// F11 time-controls
// -------------------------------------------------------------------------------------------------

// Was: tiempo-hud › «la pausa detiene el reloj y reanudar lo devuelve», «la tecla P alterna la pausa y
// se ignora con modificadores», «x2 y x3 aceleran el reloj», «en el Modo Plano se indica que el tiempo
// está detenido…» (the exact ratio of the speeds: unit/acumulador-velocidad).
test('F11 time-controls: pause, speeds and the Plano badge', async ({ page, isMobile }) => {
  await openValley(page, { speed: 20 })
  const pause = page.getByRole('button', { name: 'Pausa', exact: true })
  const speed = (v: number) => page.getByRole('button', { name: `Velocidad x${v}` })

  await poll(() => totalMinutes(page), SLOW).toBeGreaterThan(360)
  await pause.click()
  await expect(pause).toHaveAttribute('aria-pressed', 'true')
  expect((await clock(page))?.pausado).toBe(true)
  await unchanged(page, () => window.__raices?.reloj()?.minutoDelDia)
  await pause.click()
  await expect(pause).toHaveAttribute('aria-pressed', 'false')
  const resumed = await totalMinutes(page)
  await poll(() => totalMinutes(page), SLOW).toBeGreaterThan(resumed)

  await expect(speed(1)).toHaveAttribute('aria-pressed', 'true')
  await speed(2).click()
  await expect(speed(2)).toHaveAttribute('aria-pressed', 'true')
  expect((await clock(page))?.velocidad).toBe(2)
  await speed(3).click()
  await expect(speed(3)).toHaveAttribute('aria-pressed', 'true')
  expect((await clock(page))?.velocidad).toBe(3)

  if (!isMobile) {
    // P toggles the pause; with a modifier it is ignored.
    await page.locator('#juego').focus()
    await page.keyboard.press('p')
    await poll(async () => (await clock(page))?.pausado).toBe(true)
    await page.keyboard.press('Control+p')
    await unchanged(page, () => window.__raices?.reloj()?.pausado)
    await page.keyboard.press('p')
    await poll(async () => (await clock(page))?.pausado).toBe(false)
  }

  // In the Plano the clock is stopped without touching the pause button, and says so.
  await modeButton(page).click()
  await expect(page.getByText('En pausa (Plano)')).toBeVisible()
  expect((await clock(page))?.pausado).toBe(false)
  await unchanged(page, () => window.__raices?.reloj()?.minutoDelDia)
  await modeButton(page).click()
  await expect(page.getByText('En pausa (Plano)')).toHaveCount(0)
})

// -------------------------------------------------------------------------------------------------
// F12 walk-routes
// -------------------------------------------------------------------------------------------------

const destination = (page: Page) => page.evaluate(() => window.__raices?.destino())

/** Clicks or taps a free tile `steps` away in a straight line and waits for the route to start. */
async function startRoute(page: Page, steps: number): Promise<void> {
  const way = await straightFreeTile(page, steps)
  await clickTile(page, way.tile.x, way.tile.y)
  await poll(() => destination(page), SLOW).toBeDefined()
}

// Was: m2-global › «desmayo con una ruta en curso: sin destino, personaje en la aparición y la cámara con
// él», «Modo Plano con una ruta activa: la ruta se cancela…» · energia-rompedor › «al dormir con un
// destino pendiente el personaje no sigue andando».
test('F12 walk-routes: a faint, the Plano or sleeping cancel the route in progress', async ({
  page,
}) => {
  await openValley(page, { hour: '01:00' })
  const spawn = await requireCharacter(page)

  // A faint with a route in progress: no destination, back at the spawn, camera on the character.
  await startRoute(page, 5)
  await emit(page, { tipo: 'AvanzarTiempo', minutos: 120 })
  await poll(async () => (await clock(page))?.dia, SLOW).toBe(2)
  await poll(() => destination(page), SLOW).toBeUndefined()
  const fainted = await requireCharacter(page)
  expect(Math.hypot(fainted.x - spawn.x, fainted.y - spawn.y)).toBeLessThan(0.2)
  const rect = await page.evaluate((c) => window.__raices?.rectCasilla(c.x, c.y), {
    x: Math.floor(fainted.x),
    y: Math.floor(fainted.y),
  })
  const view = page.viewportSize()
  expect(
    rect &&
      view &&
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.ancho <= view.width &&
      rect.y + rect.alto <= view.height,
  ).toBe(true)
  expect(await page.evaluate(() => window.__raices?.modo())).toBe('vida')

  // The Plano cancels the route and coming back does not resume it.
  await startRoute(page, 5)
  await modeButton(page).click()
  await poll(() => page.evaluate(() => window.__raices?.modo()), SLOW).toBe('plano')
  expect(await destination(page)).toBeUndefined()
  await modeButton(page).click()
  await poll(() => page.evaluate(() => window.__raices?.modo()), SLOW).toBe('vida')
  await unchanged(page, () => JSON.stringify(window.__raices?.personaje()))
  expect(await destination(page)).toBeUndefined()

  // Sleeping with a pending destination: the character does not keep walking.
  await startRoute(page, 3)
  const day = (await clock(page))?.dia ?? 0
  await emit(page, { tipo: 'Dormir' })
  await poll(async () => (await clock(page))?.dia, SLOW).toBe(day + 1)
  await poll(() => destination(page), SLOW).toBeUndefined()
  await unchanged(page, () => JSON.stringify(window.__raices?.personaje()))
})
