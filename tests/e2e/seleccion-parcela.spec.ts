import { expect, test, type Page } from '@playwright/test'

/**
 * M3-03 · Selección de parcela y panel de detalle (Modo Plano). Valen en escritorio y en móvil
 * emulado: el picking se prueba con clics de verdad en el punto que da `puntoClicParcela`.
 */

const SEMILLA = 42
/** «B3»: columna en letra y fila desde 1 (el valle tiene 6 parcelas por lado). */
const nombreParcela = (fila: number, columna: number) => `${'ABCDEF'[columna]}${fila + 1}`

async function abrir(
  page: Page,
  query = `?semilla=${SEMILLA}&debug&modo=plano`,
): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  await page.waitForTimeout(300)
  return errores
}

const seleccionada = (page: Page) => page.evaluate(() => window.__raices?.seleccionada())
const panel = (page: Page) => page.getByRole('region', { name: /^Parcela / })

/** Espera a que la cámara deje de moverse (misma vista en dos lecturas separadas por un fotograma). */
async function camaraEstable(page: Page): Promise<void> {
  let previa = ''
  await expect
    .poll(async () => {
      const c = await page.evaluate(() => window.__raices?.camara())
      const actual = JSON.stringify(c)
      const quieta = actual === previa
      previa = actual
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
      return quieta
    })
    .toBe(true)
}

/** Clic de verdad (ratón o toque, según el dispositivo) en la parcela `i`. */
async function tocar(page: Page, i: number): Promise<void> {
  const punto = await page.evaluate((n) => window.__raices?.puntoClicParcela(n), i)
  if (!punto) throw new Error(`La parcela ${i} no tiene punto de clic visible`)
  if (test.info().project.name === 'movil') {
    await page.touchscreen.tap(punto.x, punto.y)
  } else {
    await page.mouse.click(punto.x, punto.y)
  }
}

/** Una parcela visible desde el principio, distinta de la primera. */
async function parcelaVisible(page: Page): Promise<number> {
  for (let i = 0; i < 36; i++) {
    const p = await page.evaluate((n) => window.__raices?.puntoClicParcela(n), i)
    if (p) return i
  }
  throw new Error('Ninguna parcela visible')
}

test('un clic en una parcela la selecciona y abre el panel con sus atributos y su precio', async ({
  page,
}) => {
  const errores = await abrir(page)
  const i = await parcelaVisible(page)
  expect(await seleccionada(page)).toBeUndefined()
  await expect(panel(page)).toHaveCount(0)
  await tocar(page, i)
  await expect.poll(() => seleccionada(page)).toBe(i)

  // Lo esperado sale del estado del juego (gancho `parcelaInfo`), no de lo que pinta el panel.
  const p = await page.evaluate((n) => window.__raices?.parcelaInfo(n), i)
  if (!p) throw new Error('parcela')
  const caja = panel(page)
  await expect(caja).toBeVisible()
  await expect(caja).toHaveAttribute('data-parcela', String(i))
  await expect(
    caja.getByRole('heading', { name: `Parcela ${nombreParcela(p.fila, p.columna)}` }),
  ).toBeVisible()
  const nombres: Record<string, string> = {
    prado: 'Prado',
    bosque: 'Bosque',
    rocoso: 'Rocoso',
    baja: 'Baja',
    media: 'Media',
    alta: 'Alta',
    rio: 'Río',
    pozo: 'Pozo',
    seca: 'Seca',
  }
  await expect(caja.locator('.parcela-terreno')).toContainText(nombres[p.terreno] ?? '?')
  await expect(caja.locator('.parcela-fertilidad')).toContainText(nombres[p.fertilidad] ?? '?')
  await expect(caja.locator('.parcela-agua')).toContainText(nombres[p.agua] ?? '?')
  expect(p.precio).toBeDefined()
  await expect(caja.locator('.parcela-precio')).toContainText(
    `${p.precio} ${p.precio === 1 ? 'moneda' : 'monedas'}`,
  )
  const faltan = Math.ceil((p.precio ?? 0) - p.dinero)
  await expect(caja.locator('.parcela-compra')).toContainText(
    p.comprable ? 'Se puede comprar' : `No te llega el dinero (te faltan ${faltan})`,
  )
  expect(errores).toEqual([])
})

test('el panel no tapa la parcela seleccionada ni el HUD, y sus botones miden al menos 44 px', async ({
  page,
}) => {
  await abrir(page)
  const i = await parcelaVisible(page)
  await tocar(page, i)
  await expect(panel(page)).toBeVisible()
  await camaraEstable(page)
  const rp = await panel(page).boundingBox()
  if (!rp) throw new Error('sin panel')
  const punto = await page.evaluate((n) => window.__raices?.puntoClicParcela(n), i)
  expect(punto).toBeDefined()
  // El punto de toque de la parcela queda fuera del panel.
  const dentro =
    (punto?.x ?? 0) >= rp.x &&
    (punto?.x ?? 0) <= rp.x + rp.width &&
    (punto?.y ?? 0) >= rp.y &&
    (punto?.y ?? 0) <= rp.y + rp.height
  expect(dentro).toBe(false)
  // No se solapa con el botón de modo ni con el reloj.
  for (const sel of ['.boton-modo', '.reloj', '.controles-tiempo']) {
    const r = await page.locator(sel).first().boundingBox()
    if (!r) continue
    const solapa =
      r.x < rp.x + rp.width &&
      r.x + r.width > rp.x &&
      r.y < rp.y + rp.height &&
      r.y + r.height > rp.y
    expect(solapa, `el panel tapa ${sel}`).toBe(false)
  }
  const cerrar = await panel(page)
    .getByRole('button', { name: /Cerrar/ })
    .boundingBox()
  expect(cerrar?.width).toBeGreaterThanOrEqual(44)
  expect(cerrar?.height).toBeGreaterThanOrEqual(44)
})

test('tocar otra parcela cambia la selección y tocar la misma la mantiene', async ({ page }) => {
  await abrir(page)
  const a = await parcelaVisible(page)
  await tocar(page, a)
  await expect.poll(() => seleccionada(page)).toBe(a)
  await camaraEstable(page)
  await tocar(page, a)
  await page.waitForTimeout(200)
  expect(await seleccionada(page)).toBe(a)
  await expect(panel(page)).toBeVisible()
})

test('un arrastre de cámara no selecciona', async ({ page }) => {
  await abrir(page)
  const i = await parcelaVisible(page)
  const p = await page.evaluate((n) => window.__raices?.puntoClicParcela(n), i)
  if (!p) throw new Error('sin punto')
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.move(p.x + 60, p.y + 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await seleccionada(page)).toBeUndefined()
  await expect(panel(page)).toHaveCount(0)
})

test('Esc cierra el panel y deselecciona', async ({ page }) => {
  await abrir(page)
  const i = await parcelaVisible(page)
  await tocar(page, i)
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  expect(await seleccionada(page)).toBeUndefined()
})

test('el botón Cerrar cierra el panel y devuelve el foco al lienzo', async ({ page }) => {
  await abrir(page)
  const i = await parcelaVisible(page)
  await tocar(page, i)
  await panel(page)
    .getByRole('button', { name: /Cerrar/ })
    .click()
  await expect(panel(page)).toHaveCount(0)
  expect(await seleccionada(page)).toBeUndefined()
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('juego')
})

test('tocar fuera del valle deselecciona', async ({ page }) => {
  await abrir(page)
  // Se aleja para que haya fondo alrededor del valle (la rueda solo hace zoom en Plano).
  await page.evaluate(() => window.__raices?.seleccionar(0))
  await expect.poll(() => seleccionada(page)).toBe(0)
  // La parte libre de la pantalla, sin el panel, a la izquierda del valle encuadrado.
  const v = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.mouse.move(v.width / 2, v.height / 2)
  for (let n = 0; n < 8; n++) await page.mouse.wheel(0, 400)
  await camaraEstable(page)
  const c = await page.evaluate(() => window.__raices?.camara())
  const mundo = await page.evaluate(() => window.__raices?.mundoPx())
  if (!c || !mundo) throw new Error('sin cámara')
  // Con el valle encuadrado sobra fondo a los lados (pantalla ancha) o arriba y abajo (vertical).
  const aMundo = (px: number, py: number) => ({
    x: c.scrollX + c.ancho / 2 + (px - c.ancho / 2) / c.zoom,
    y: c.scrollY + c.alto / 2 + (py - c.alto / 2) / c.zoom,
  })
  const candidatos = [
    { x: 6, y: v.height / 2 },
    { x: v.width / 2, y: 6 },
  ]
  const fuera = candidatos.find((p) => {
    const m = aMundo(p.x, p.y)
    return m.x < 0 || m.y < 0 || m.x >= mundo || m.y >= mundo
  })
  if (!fuera) throw new Error('No hay fondo fuera del valle que tocar')
  await page.mouse.click(fuera.x, fuera.y)
  await expect.poll(() => seleccionada(page)).toBeUndefined()
  await expect(panel(page)).toHaveCount(0)
})

test('en Vida no se selecciona nada y el toque sigue yendo al destino', async ({ page }) => {
  await abrir(page, `?semilla=${SEMILLA}&debug`)
  expect(await page.evaluate(() => window.__raices?.modo())).toBe('vida')
  const v = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.mouse.click(v.width / 2 + 90, v.height / 2 + 60)
  await page.waitForTimeout(300)
  expect(await seleccionada(page)).toBeUndefined()
  await expect(panel(page)).toHaveCount(0)
  // El gancho tampoco selecciona en Vida.
  await page.evaluate(() => window.__raices?.seleccionar(3))
  expect(await seleccionada(page)).toBeUndefined()
})

test('al volver a Vida se deselecciona y el panel se cierra', async ({ page }) => {
  await abrir(page)
  const i = await parcelaVisible(page)
  await tocar(page, i)
  await expect(panel(page)).toBeVisible()
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
  await expect(panel(page)).toHaveCount(0)
  expect(await seleccionada(page)).toBeUndefined()
})

test('?seleccion=N abre el panel de esa parcela (solo con debug)', async ({ page }) => {
  await abrir(page, `?semilla=${SEMILLA}&debug&modo=plano&seleccion=14`)
  await expect.poll(() => seleccionada(page)).toBe(14)
  await expect(panel(page)).toBeVisible()
})

test('sin debug no hay ganchos de selección ni ?seleccion funciona', async ({ page }) => {
  await abrir(page, `?semilla=${SEMILLA}&modo=plano&seleccion=14`)
  expect(await seleccionada(page)).toBeUndefined()
  await page.evaluate(() => window.__raices?.seleccionar(3))
  expect(await seleccionada(page)).toBeUndefined()
  expect(await page.evaluate(() => window.__raices?.puntoClicParcela(0))).toBeUndefined()
})
