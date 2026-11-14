/* eslint-disable @typescript-eslint/no-non-null-assertion -- valores conocidos en tests */
/**
 * Rompedor · M5-01 Inventario y herramienta activa. Ver docs/informes/M5-01-rompedor.md.
 * - Foco y teclas (1–6, E, Espacio, I, Esc, M) con el foco en el lienzo, el panel o el HUD.
 * - E y Espacio mirando hacia fuera del valle; clic o toque adyacente frente a lejano con DPR 1, 2 y 3.
 * - Joystick que empieza en una casilla pegada; giro y redimensionado con el inventario abierto.
 * - Que la barra, los botones y el panel no tapen al personaje ni se solapen entre sí.
 */
import { devices, expect, test, type Browser, type Page } from '@playwright/test'

const TAM = 32 // TAM_CASILLA

async function abrir(page: Page, query = '?semilla=42&debug'): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await camaraQuieta(page)
  return errores
}

/** Espera a que la cámara (que se acerca al personaje con suavizado) se mueva menos de 0,2 px. */
async function camaraQuieta(page: Page): Promise<void> {
  let anterior: number[] = []
  await expect
    .poll(
      async () => {
        const c = await page.evaluate(() => window.__raices?.camara())
        const ahora = [c?.scrollX ?? NaN, c?.scrollY ?? NaN, c?.zoom ?? NaN, c?.ancho ?? 0]
        const quieta =
          anterior.length > 0 && ahora.every((v, i) => Math.abs(v - anterior[i]!) * ahora[2]! < 0.2)
        anterior = ahora
        return quieta
      },
      { timeout: 20_000, intervals: [250] },
    )
    .toBe(true)
}

const herramienta = (p: Page) => p.evaluate(() => window.__raices?.herramienta()?.herramienta)
const ultimoUso = (p: Page) => p.evaluate(() => window.__raices?.ultimoUso())
const destino = (p: Page) => p.evaluate(() => window.__raices?.destino())
const personaje = async (p: Page) => {
  const r = await p.evaluate(() => window.__raices?.personaje())
  if (!r) throw new Error('sin personaje')
  return r
}
const panel = (p: Page) => p.getByRole('region', { name: 'Inventario' })

/** Centro en pantalla (px CSS) de la casilla (cx, cy), calculado solo con la cámara. */
async function centroCasilla(p: Page, cx: number, cy: number): Promise<{ x: number; y: number }> {
  const c = await p.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('sin cámara')
  return {
    x: ((cx + 0.5) * TAM - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: ((cy + 0.5) * TAM - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  }
}

/** ¿Lo que hay en ese punto de la pantalla es el lienzo (nada del HUD encima)? */
const lienzoEn = (p: Page, x: number, y: number) =>
  p.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName === 'CANVAS', [x, y])

/** Lleva al personaje con `MoverPersonaje` (ms cortos para no saltar obstáculos). */
async function andar(p: Page, dx: number, dy: number, pasos: number): Promise<void> {
  await p.evaluate(
    ([dx, dy, n]) => {
      for (let i = 0; i < n!; i++)
        window.__raices?.emitir({ tipo: 'MoverPersonaje', dx, dy, ms: 100 })
    },
    [dx, dy, pasos],
  )
}

type Caja = { x: number; y: number; width: number; height: number }
const solapan = (a: Caja, b: Caja) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test.describe('teclado y foco (escritorio)', () => {
  test.skip(({ isMobile }) => isMobile, 'el teclado es de escritorio')

  test('tras cerrar el inventario cambiando de modo con M, las teclas de herramienta siguen vivas', async ({
    page,
  }) => {
    await abrir(page)
    await page.keyboard.press('i')
    await expect(panel(page)).toBeFocused()
    // M (atajo global de Phaser) cambia al Plano: el panel desaparece con el foco dentro.
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
    await expect(panel(page)).toHaveCount(0)
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
    // Sin tocar el ratón, el jugador sigue con el teclado: 2 = regadera, E = usar, I = inventario.
    await page.keyboard.press('2')
    await expect.poll(() => herramienta(page), { timeout: 1500 }).toBe('regadera')
    await page.keyboard.press('e')
    await expect.poll(async () => (await ultimoUso(page))?.n, { timeout: 1500 }).toBe(1)
    await page.keyboard.press('i')
    await expect(panel(page)).toBeVisible()
  })

  test('con el inventario abierto por teclado, un clic en el valle devuelve las teclas al juego', async ({
    page,
  }) => {
    await abrir(page)
    await page.keyboard.press('i')
    await expect(panel(page)).toBeFocused()
    const p = await personaje(page)
    // Clic lejano (camina), en una zona libre de HUD.
    let pt: { x: number; y: number } | undefined
    for (const [dx, dy] of [
      [4, -4],
      [-4, -4],
      [6, -2],
      [0, -5],
    ] as const) {
      const c = await centroCasilla(page, Math.floor(p.x) + dx, Math.floor(p.y) + dy)
      if (await lienzoEn(page, c.x, c.y)) {
        pt = c
        break
      }
    }
    test.skip(!pt, 'sin casilla libre de HUD')
    await page.mouse.click(pt!.x, pt!.y)
    await page.keyboard.press('4')
    await expect.poll(() => herramienta(page), { timeout: 1500 }).toBe('mano')
  })

  test('E y Espacio mirando fuera del valle: rechazo «fuera-del-valle» con aviso y sin errores', async ({
    page,
  }) => {
    const errores = await abrir(page)
    // Pegado al borde oeste, mirando al oeste.
    await andar(page, -1, 0, 600)
    const p = await personaje(page)
    expect(Math.floor(p.x)).toBe(0)
    expect(p.orientacion).toBe('oeste')
    await page.keyboard.press('e')
    await expect
      .poll(() => ultimoUso(page))
      .toMatchObject({ n: 1, x: -1, y: Math.floor(p.y), error: 'fuera-del-valle' })
    await expect(page.getByRole('status').filter({ hasText: /valle/i })).toBeVisible()
    await page.keyboard.press('Space')
    await expect.poll(async () => (await ultimoUso(page))?.n).toBe(2)
    expect(await destino(page)).toBeUndefined()
    expect(errores).toEqual([])
  })

  test('las teclas con modificadores no eligen herramienta ni usan (Ctrl+1, Shift+E, Alt+I)', async ({
    page,
  }) => {
    await abrir(page)
    await page.keyboard.press('Shift+3')
    await page.keyboard.press('Shift+KeyE')
    await page.keyboard.press('Alt+KeyI')
    await page.waitForTimeout(200)
    expect(await herramienta(page)).toBe('azada')
    expect(await ultimoUso(page)).toBeUndefined()
    await expect(panel(page)).toHaveCount(0)
  })

  test('con el foco en un botón de herramienta (Tab), Espacio pulsa el botón y no usa la azada', async ({
    page,
  }) => {
    await abrir(page)
    const hacha = page.getByRole('button', { name: 'Hacha', exact: true })
    await hacha.focus()
    await page.keyboard.press('Space')
    await expect.poll(() => herramienta(page)).toBe('hacha')
    await expect(hacha).toBeFocused()
    expect(await ultimoUso(page)).toBeUndefined()
  })
})

/** Clic o toque en cada casilla de alcance (las 9) y en una a distancia 2, con el DPR dado. */
async function alcanceConDpr(browser: Browser, baseURL: string, movil: boolean, dpr: number) {
  const ctx = await browser.newContext({
    ...(movil ? devices['Pixel 7'] : devices['Desktop Chrome']),
    deviceScaleFactor: dpr,
    baseURL,
  })
  const page = await ctx.newPage()
  try {
    const errores = await abrir(page)
    // Más al norte, lejos de los botones de abajo.
    await andar(page, 0, -1, 40)
    await camaraQuieta(page)
    const p = await personaje(page)
    const cx = Math.floor(p.x)
    const cy = Math.floor(p.y)
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = await centroCasilla(page, cx + dx, cy + dy)
        if (!(await lienzoEn(page, c.x, c.y))) continue
        if (movil) await page.touchscreen.tap(c.x, c.y)
        else await page.mouse.click(c.x, c.y)
        n++
        await expect
          .poll(() => ultimoUso(page), { message: `DPR ${dpr} casilla ${dx},${dy}` })
          .toMatchObject({ n, x: cx + dx, y: cy + dy })
        expect(await destino(page)).toBeUndefined()
      }
    }
    expect(n, 'casillas de alcance pulsadas').toBeGreaterThanOrEqual(6)
    // Distancia de Chebyshev 2: camina y no usa.
    const lejos = await centroCasilla(page, cx + 2, cy - 2)
    if (movil) await page.touchscreen.tap(lejos.x, lejos.y)
    else await page.mouse.click(lejos.x, lejos.y)
    await expect.poll(() => destino(page)).toBeDefined()
    expect((await ultimoUso(page))?.n).toBe(n)
    expect(errores).toEqual([])
  } finally {
    await ctx.close()
  }
}

for (const dpr of [1, 2, 3]) {
  test(`clic o toque: las 9 casillas de alcance usan la herramienta y la de distancia 2 camina (DPR ${dpr})`, async ({
    browser,
    isMobile,
    baseURL,
  }) => {
    await alcanceConDpr(browser, baseURL!, isMobile, dpr)
  })
}

test.describe('táctil', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')

  test('un joystick que empieza en una casilla pegada mueve al personaje y no usa la herramienta', async ({
    page,
  }) => {
    await abrir(page)
    await andar(page, 0, -1, 40)
    await camaraQuieta(page)
    const p = await personaje(page)
    const c = await centroCasilla(page, Math.floor(p.x) + 1, Math.floor(p.y) - 1)
    const cdp = await page.context().newCDPSession(page)
    const tocar = (type: string, pts: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type: type as 'touchStart',
        touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
      })
    await tocar('touchStart', [[c.x, c.y]])
    for (let i = 1; i <= 10; i++) {
      await tocar('touchMove', [[c.x - i * 4, c.y]])
      await page.waitForTimeout(30)
    }
    await page.waitForTimeout(300)
    await tocar('touchEnd', [])
    await page.waitForTimeout(200)
    expect(await ultimoUso(page)).toBeUndefined()
    expect((await personaje(page)).x).toBeLessThan(p.x)
  })
})

test.describe('disposición: nada tapa al personaje ni se solapa', () => {
  test('en la esquina inferior izquierda del valle, la barra de herramientas no tapa al personaje', async ({
    page,
  }) => {
    await abrir(page)
    await andar(page, 0, 1, 200)
    await andar(page, -1, 0, 600)
    await camaraQuieta(page)
    const p = await personaje(page)
    expect(Math.floor(p.x)).toBe(0)
    // Centro del cuerpo del personaje (su casilla) en pantalla.
    const c = await centroCasilla(page, p.x - 0.5, p.y - 0.5)
    const barra = (await page.locator('.barra-herramientas-caja').boundingBox())!
    expect(
      solapan({ x: c.x - 8, y: c.y - 8, width: 16, height: 16 }, barra),
      `personaje en (${Math.round(c.x)}, ${Math.round(c.y)}) bajo la barra ${JSON.stringify(barra)}`,
    ).toBe(false)
  })

  test('el panel de inventario no se solapa con la barra de herramientas ni con los botones de Vida', async ({
    page,
  }) => {
    await abrir(page)
    await page.getByRole('button', { name: 'Inventario', exact: true }).click()
    await expect(panel(page)).toBeVisible()
    const caja = (await page.locator('.panel-inventario-caja').boundingBox())!
    const barra = (await page.locator('.barra-herramientas-caja').boundingBox())!
    const accion = (await page.locator('.boton-accion').boundingBox())!
    const modo = (await page.getByRole('button', { name: /Modo de juego/ }).boundingBox())!
    expect(
      solapan(caja, barra),
      `panel ${JSON.stringify(caja)} / barra ${JSON.stringify(barra)}`,
    ).toBe(false)
    expect(solapan(caja, accion)).toBe(false)
    expect(solapan(caja, modo)).toBe(false)
    // Dentro de la pantalla.
    const vp = page.viewportSize()!
    expect(caja.x).toBeGreaterThanOrEqual(0)
    expect(caja.y).toBeGreaterThanOrEqual(0)
    expect(caja.x + caja.width).toBeLessThanOrEqual(vp.width)
    expect(caja.y + caja.height).toBeLessThanOrEqual(vp.height)
  })

  test('con el personaje en medio del valle, el inventario abierto no lo tapa', async ({
    page,
  }) => {
    await abrir(page)
    // Lejos de los bordes: la cámara lo centra.
    await andar(page, 0, -1, 200)
    await camaraQuieta(page)
    await page.getByRole('button', { name: 'Inventario', exact: true }).click()
    await expect(panel(page)).toBeVisible()
    const p = await personaje(page)
    const c = await centroCasilla(page, p.x - 0.5, p.y - 0.5)
    const caja = (await page.locator('.panel-inventario-caja').boundingBox())!
    expect(
      solapan({ x: c.x - 8, y: c.y - 8, width: 16, height: 16 }, caja),
      `personaje en (${Math.round(c.x)}, ${Math.round(c.y)}) bajo el panel ${JSON.stringify(caja)}`,
    ).toBe(false)
  })

  test('girar el móvil con el inventario abierto: sigue dentro de la pantalla y usable', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'solo móvil')
    const errores = await abrir(page)
    await page.getByRole('button', { name: 'Inventario', exact: true }).click()
    for (const [w, h] of [
      [915, 412],
      [412, 915],
      [915, 412],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(400)
      await expect(panel(page)).toBeVisible()
      const caja = (await page.locator('.panel-inventario-caja').boundingBox())!
      expect(caja.x + caja.width).toBeLessThanOrEqual(w)
      expect(caja.y).toBeGreaterThanOrEqual(0)
      expect(caja.y + caja.height).toBeLessThanOrEqual(h)
      const cerrar = panel(page).getByRole('button', { name: 'Cerrar el inventario' })
      const b = (await cerrar.boundingBox())!
      expect(b.height).toBeGreaterThanOrEqual(44)
    }
    await panel(page)
      .getByRole('button', { name: /^Semillas de patata/ })
      .click()
    expect(await page.evaluate(() => window.__raices?.herramienta())).toEqual({
      herramienta: 'semillas',
      semilla: 'semilla-patata',
    })
    expect(errores).toEqual([])
  })
})
