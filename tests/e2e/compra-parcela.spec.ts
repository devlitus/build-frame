import { expect, test, type Page } from '@playwright/test'

/**
 * M3-04 · Compra de parcelas desde el panel, dinero en el HUD y estado visual. Valen en
 * escritorio y en móvil emulado. La parcela se abre con el gancho `seleccionar` (el picking
 * ya lo prueba M3-03); la compra se hace con clics de verdad en los botones del panel.
 */

const SEMILLA = 42
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

async function abrir(page: Page, query: string): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  return errores
}

const urlPlano = (extra = '') => `?semilla=${SEMILLA}&debug&modo=plano${extra}`
const dinero = (page: Page) => page.evaluate(() => window.__raices?.dinero())
const panel = (page: Page) => page.getByRole('region', { name: /^Parcela / })
const comprar = (page: Page) => panel(page).getByRole('button', { name: /^Comprar por / })

type Info = NonNullable<ReturnType<NonNullable<Window['__raices']>['parcelaInfo']>>

async function info(page: Page, i: number): Promise<Info> {
  const p = await page.evaluate((n) => window.__raices?.parcelaInfo(n), i)
  if (!p) throw new Error(`sin info de la parcela ${i}`)
  return p
}

/** Primera parcela cuyo estado cumple el filtro. */
async function buscar(page: Page, filtro: (p: Info) => boolean): Promise<number> {
  for (let i = 0; i < 36; i++) if (filtro(await info(page, i))) return i
  throw new Error('No hay ninguna parcela así')
}

async function seleccionar(page: Page, i: number): Promise<void> {
  await page.evaluate((n) => window.__raices?.seleccionar(n), i)
  await expect(panel(page)).toHaveAttribute('data-parcela', String(i))
}

/** Pide la compra, comprueba el texto de la confirmación y la acepta. */
async function comprarConConfirmacion(page: Page, precio: number, antes: number): Promise<void> {
  await comprar(page).click()
  const grupo = panel(page).getByRole('group', { name: /Comprar esta parcela/ })
  await expect(grupo).toBeVisible()
  await expect(grupo).toContainText(
    `¿Comprar esta parcela por ${miles(precio)} monedas? Te quedarán ${miles(antes - precio)} monedas`,
  )
  await grupo.getByRole('button', { name: 'Comprar', exact: true }).click()
}

test('el HUD muestra el dinero con formato español, en Vida y en Plano', async ({ page }) => {
  await abrir(page, `?semilla=${SEMILLA}&debug`)
  const hud = page.locator('.dinero')
  await expect(hud).toBeVisible()
  await expect(hud).toContainText('1.100')
  expect(await dinero(page)).toBe(1100)
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
  await expect(hud).toBeVisible()
  // No se solapa con el reloj, los controles de tiempo ni el botón de modo.
  const r = await hud.boundingBox()
  if (!r) throw new Error('sin dinero')
  for (const sel of ['.reloj', '.controles-tiempo', '.boton-modo']) {
    const o = await page.locator(sel).first().boundingBox()
    if (!o) continue
    const solapa =
      o.x < r.x + r.width && o.x + o.width > r.x && o.y < r.y + r.height && o.y + o.height > r.y
    expect(solapa, `el dinero tapa ${sel}`).toBe(false)
  }
})

test('con ?debug&dinero=N se empieza con ese dinero', async ({ page }) => {
  await abrir(page, urlPlano('&dinero=5000'))
  expect(await dinero(page)).toBe(5000)
  await expect(page.locator('.dinero')).toContainText('5.000')
})

test('comprar la primera parcela: el dinero baja exactamente el precio, en el HUD y en el estado', async ({
  page,
}) => {
  const errores = await abrir(page, urlPlano())
  const i = await buscar(page, (p) => p.comprable)
  const { precio } = await info(page, i)
  if (precio === undefined) throw new Error('sin precio')
  await seleccionar(page, i)
  await expect(comprar(page)).toHaveText(`Comprar por ${miles(precio)} monedas`)
  await expect(comprar(page)).toBeEnabled()
  const caja = await comprar(page).boundingBox()
  expect(caja?.height).toBeGreaterThanOrEqual(44)

  await comprarConConfirmacion(page, precio, 1100)
  await expect.poll(() => dinero(page)).toBe(1100 - precio)
  await expect(page.locator('.dinero')).toContainText(miles(1100 - precio))
  // El panel sigue abierto y muestra «Tuya»; ya no hay botón de compra.
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).locator('.parcela-precio')).toContainText('Tuya')
  await expect(comprar(page)).toHaveCount(0)
  await expect(page.locator('.aviso')).toContainText('comprada')
  expect((await info(page, i)).estado).toBe('propia')
  expect(await page.evaluate((n) => window.__raices?.estadoVisual(n), i)).toBe('propia')
  expect(errores).toEqual([])
})

test('una parcela no adyacente tiene el botón desactivado y el motivo en texto', async ({
  page,
}) => {
  await abrir(page, urlPlano('&dinero=5000'))
  const primera = await buscar(page, (p) => p.comprable)
  await seleccionar(page, primera)
  const { precio } = await info(page, primera)
  await comprarConConfirmacion(page, precio ?? 0, 5000)
  await expect.poll(() => dinero(page)).toBe(5000 - (precio ?? 0))

  const lejos = await buscar(page, (p) => p.motivo === 'no-adyacente')
  await seleccionar(page, lejos)
  await expect(comprar(page)).toBeVisible()
  await expect(comprar(page)).toBeDisabled()
  await expect(panel(page).locator('.parcela-compra')).toContainText(
    'Debe tocar una de tus parcelas',
  )
  expect(await page.evaluate((n) => window.__raices?.estadoVisual(n), lejos)).toBe('no-comprable')
  // Pulsarlo no abre la confirmación ni gasta dinero.
  await comprar(page).click({ force: true })
  await expect(panel(page).getByRole('group', { name: /Comprar esta parcela/ })).toHaveCount(0)
  expect(await dinero(page)).toBe(5000 - (precio ?? 0))
})

test('comprar una adyacente: el precio ha subido y el dinero cuadra', async ({ page }) => {
  await abrir(page, urlPlano('&dinero=5000'))
  const primera = await buscar(page, (p) => p.comprable)
  const p1 = (await info(page, primera)).precio ?? 0
  const preciosAntes = await Promise.all(
    Array.from({ length: 36 }, async (_, n) => (await info(page, n)).precio ?? 0),
  )
  await seleccionar(page, primera)
  await comprarConConfirmacion(page, p1, 5000)
  await expect.poll(() => dinero(page)).toBe(5000 - p1)

  const segunda = await buscar(page, (p) => p.comprable)
  const i2 = await info(page, segunda)
  const p2 = i2.precio ?? 0
  // El precio de la segunda incluye la subida por haber comprado una.
  expect(p2).toBeGreaterThan(preciosAntes[segunda] ?? Infinity)
  await seleccionar(page, segunda)
  await expect(comprar(page)).toHaveText(`Comprar por ${miles(p2)} monedas`)
  await comprarConConfirmacion(page, p2, 5000 - p1)
  await expect.poll(() => dinero(page)).toBe(5000 - p1 - p2)
  await expect(page.locator('.dinero')).toContainText(miles(5000 - p1 - p2))
  expect((await info(page, segunda)).estado).toBe('propia')
})

test('cancelar no cambia nada y devuelve el foco al botón; Esc cancela antes de cerrar el panel', async ({
  page,
}) => {
  await abrir(page, urlPlano())
  const i = await buscar(page, (p) => p.comprable)
  await seleccionar(page, i)
  const antes = await dinero(page)
  const visual = await page.evaluate((n) => window.__raices?.estadoVisual(n), i)

  await comprar(page).click()
  const grupo = panel(page).getByRole('group', { name: /Comprar esta parcela/ })
  await expect(grupo).toBeVisible()
  // El foco pasa a «Cancelar» (la opción segura).
  await expect(grupo.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await grupo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(grupo).toHaveCount(0)
  await expect(comprar(page)).toBeFocused()
  expect(await dinero(page)).toBe(antes)
  expect(await page.evaluate((n) => window.__raices?.estadoVisual(n), i)).toBe(visual)

  // Esc: la primera vez cancela la confirmación; la segunda cierra el panel.
  await comprar(page).click()
  await expect(grupo).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(grupo).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
  expect(await page.evaluate(() => window.__raices?.seleccionada())).toBe(i)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  expect(await dinero(page)).toBe(antes)
})

test('con el teclado: Enter pide la confirmación y Espacio la acepta', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'el teclado es de escritorio')
  await abrir(page, urlPlano())
  const i = await buscar(page, (p) => p.comprable)
  const precio = (await info(page, i)).precio ?? 0
  await seleccionar(page, i)
  await comprar(page).focus()
  await page.keyboard.press('Enter')
  const grupo = panel(page).getByRole('group', { name: /Comprar esta parcela/ })
  await expect(grupo).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(grupo.getByRole('button', { name: 'Comprar', exact: true })).toBeFocused()
  await page.keyboard.press('Space')
  await expect.poll(() => dinero(page)).toBe(1100 - precio)
  await expect(panel(page).locator('.parcela-precio')).toContainText('Tuya')
})

test('la confirmación se cancela si cambia la selección o el modo', async ({ page }) => {
  await abrir(page, urlPlano('&dinero=5000'))
  const i = await buscar(page, (p) => p.comprable)
  await seleccionar(page, i)
  await comprar(page).click()
  const grupo = panel(page).getByRole('group', { name: /Comprar esta parcela/ })
  await expect(grupo).toBeVisible()
  const j = i === 0 ? 1 : 0
  await seleccionar(page, j)
  await expect(grupo).toHaveCount(0)
  // Y al volver a la misma parcela se parte de cero, sin confirmación.
  await seleccionar(page, i)
  await expect(grupo).toHaveCount(0)
  await comprar(page).click()
  await expect(grupo).toBeVisible()
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect(panel(page)).toHaveCount(0)
  expect(await dinero(page)).toBe(5000)
})

test('sin fondos el botón está desactivado y el motivo se explica', async ({ page }) => {
  await abrir(page, urlPlano('&dinero=1'))
  await seleccionar(page, 14)
  await expect(comprar(page)).toBeDisabled()
  await expect(panel(page).locator('.parcela-compra')).toContainText('No te llega el dinero')
  for (let n = 0; n < 36; n++)
    expect(await page.evaluate((k) => window.__raices?.estadoVisual(k), n)).toBe('no-comprable')
  expect(await dinero(page)).toBe(1)
})

test('una parcela propia no tiene botón de compra', async ({ page }) => {
  await abrir(page, urlPlano('&propias=14&seleccion=14'))
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).locator('.parcela-precio')).toContainText('Tuya')
  await expect(comprar(page)).toHaveCount(0)
  await expect(panel(page).getByRole('button', { name: /Comprar/ })).toHaveCount(0)
})

test('el estado visual distingue propia, comprable y no comprable, y comprar no rehornea el valle', async ({
  page,
}) => {
  await abrir(page, urlPlano('&dinero=5000&propias=14'))
  const estados = async () =>
    Promise.all(
      Array.from({ length: 36 }, (_, n) =>
        page.evaluate((k) => window.__raices?.estadoVisual(k), n),
      ),
    )
  const antes = await estados()
  expect(antes[14]).toBe('propia')
  expect(antes.filter((s) => s === 'comprable')).toHaveLength(4)
  expect(antes.filter((s) => s === 'no-comprable')).toHaveLength(31)

  const texturas = await page.evaluate(() => window.__raices?.texturas())
  const repintados = await page.evaluate(() => window.__raices?.repintadosParcelas())
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'ComprarParcela', indice: 15 }))
  await expect.poll(() => estados().then((e) => e[15])).toBe('propia')
  expect(await page.evaluate(() => window.__raices?.texturas())).toBe(texturas)
  expect(await page.evaluate(() => window.__raices?.repintadosParcelas())).toBe(
    (repintados ?? 0) + 1,
  )
  // El tiempo cambia el estado en cada fotograma, pero no repinta las parcelas.
  const tras = await page.evaluate(() => window.__raices?.repintadosParcelas())
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.__raices?.repintadosParcelas())).toBe(tras)
})
