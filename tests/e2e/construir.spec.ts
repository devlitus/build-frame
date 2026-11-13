import { expect, test, type CDPSession, type Page } from '@playwright/test'

/**
 * M4-05 · Construir: catálogo, silueta, confirmación y obra visible. Valen en escritorio (ratón y
 * teclado) y en móvil emulado (tocar coloca, arrastrar ajusta y un botón confirma). Las zonas se
 * pintan con comandos (el pincel ya tiene su spec) y los sitios válidos se buscan con el gancho
 * `colocacion` del núcleo, así que no dependen de la semilla más que lo imprescindible.
 */

const QUERY = '?semilla=42&debug&modo=plano&propias=14,15,20,21'
type Punto = { x: number; y: number }

const esMovil = () => test.info().project.name === 'movil'
const panel = (page: Page) => page.getByRole('region', { name: 'Construir' })

async function abrir(page: Page, query = QUERY): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  await page.waitForTimeout(300)
  // Vivienda a la izquierda y almacén a la derecha de las casillas centrales.
  await page.evaluate(() => {
    const r = window.__raices
    r?.emitir({ tipo: 'PintarZona', x0: 40, y0: 40, x1: 47, y1: 55, zona: 'vivienda' })
    r?.emitir({ tipo: 'PintarZona', x0: 48, y0: 40, x1: 55, y1: 55, zona: 'almacen' })
  })
  return errores
}

async function abrirCatalogo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Construir', exact: true }).click()
  await expect(panel(page)).toBeVisible()
}

async function elegir(page: Page, nombre: RegExp): Promise<void> {
  await panel(page).getByRole('button', { name: nombre }).click()
  await expect
    .poll(() => page.evaluate(() => window.__raices?.construccion()?.silueta !== undefined))
    .toBe(true)
}

type Sitio = { x: number; y: number; punto: Punto; cx: number; cy: number }

/**
 * Casilla visible (sin tapar por el panel) cuya silueta de `tipo` da `valida` (y `motivo` si se
 * pide), la más cercana al centro del valle. `cx, cy` es la casilla donde hay que apuntar.
 */
async function buscarSitio(
  page: Page,
  tipo: string,
  valida: boolean,
  motivo?: string,
): Promise<Sitio> {
  const s = await page.evaluate(
    ({ tipo, valida, motivo }) => {
      const r = window.__raices
      const def = { casa: [4, 3], 'caja-envio': [1, 1], cobertizo: [3, 2] }[tipo] as number[]
      const [w, h] = def as [number, number]
      const c: Sitio[] = []
      for (let y = 36; y < 60; y++) {
        for (let x = 36; x < 60; x++) {
          const v = r?.colocacion(tipo, x, y)
          if (!v || v.valida !== valida || (motivo && v.motivo !== motivo)) continue
          const cx = x + Math.floor((w - 1) / 2)
          const cy = y + Math.floor((h - 1) / 2)
          const p = r?.puntoClicCasilla(cx, cy)
          if (p) c.push({ x, y, punto: p, cx, cy })
        }
      }
      c.sort((a, b) => Math.hypot(a.cx - 48, a.cy - 48) - Math.hypot(b.cx - 48, b.cy - 48))
      return c[0]
    },
    { tipo, valida, motivo },
  )
  if (!s)
    throw new Error(`Sin sitio ${valida ? 'válido' : 'inválido ' + (motivo ?? '')} para ${tipo}`)
  return s
}

let cdp: CDPSession | undefined
test.beforeEach(() => {
  cdp = undefined
})

/** Apunta a un punto: ratón (mover, sin pulsar) o un toque. */
async function apuntar(page: Page, p: Punto): Promise<void> {
  if (esMovil()) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.move(p.x, p.y)
}

async function arrastrarDedo(page: Page, a: Punto, b: Punto): Promise<void> {
  const sesion = (cdp ??= await page.context().newCDPSession(page))
  const toque = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', p?: Punto) =>
    sesion.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [],
    })
  await toque('touchStart', a)
  for (let i = 1; i <= 5; i++) {
    await toque('touchMove', { x: a.x + ((b.x - a.x) * i) / 5, y: a.y + ((b.y - a.y) * i) / 5 })
  }
  await toque('touchEnd')
}

const silueta = (page: Page) => page.evaluate(() => window.__raices?.construccion()?.silueta)

/** Construye la caja de envío en un sitio válido, por la interfaz, y devuelve el sitio. */
async function construirCaja(page: Page): Promise<Sitio> {
  await abrirCatalogo(page)
  await elegir(page, /^Caja de envío/)
  const s = await buscarSitio(page, 'caja-envio', true)
  await apuntar(page, s.punto)
  await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
  if (esMovil()) await panel(page).getByRole('button', { name: 'Construir aquí' }).click()
  else await page.mouse.click(s.punto.x, s.punto.y)
  await expect(panel(page).getByText('¿Construir Caja de envío?')).toBeVisible()
  await panel(page).getByRole('button', { name: 'Construir', exact: true }).click()
  return s
}

test('el catálogo muestra casa, caja de envío y cobertizo con su coste, zona y motivo si no llegan; el HUD muestra madera y piedra', async ({
  page,
}) => {
  const errores = await abrir(page, `${QUERY}&dinero=100`)
  const hud = page.getByRole('group', { name: 'Materiales' })
  await expect(hud).toContainText('80')
  await expect(hud).toContainText('20')
  await abrirCatalogo(page)
  const casa = panel(page).getByRole('button', { name: /^Casa/ })
  const caja = panel(page).getByRole('button', { name: /^Caja de envío/ })
  const cobertizo = panel(page).getByRole('button', { name: /^Cobertizo/ })
  await expect(casa).toContainText('4×3 casillas')
  await expect(casa).toContainText('Zona: Vivienda')
  await expect(casa).toContainText('Gratis')
  await expect(caja).toContainText('1×1 casillas')
  await expect(caja).toContainText('Zona: Vivienda o Almacén')
  await expect(caja).toContainText('50 monedas y 20 de madera')
  await expect(cobertizo).toContainText('300 monedas, 50 de madera y 10 de piedra')
  // Con 100 monedas: la casa es gratis, la caja y el cobertizo no se pagan y dicen por qué.
  await expect(casa).not.toContainText('Te faltan')
  await expect(caja).not.toContainText('Te faltan')
  await expect(cobertizo).toContainText('Te faltan 200 monedas')
  for (const b of [casa, caja, cobertizo, panel(page).getByRole('button', { name: 'Listo' })]) {
    const c = await b.boundingBox()
    expect(c?.width).toBeGreaterThanOrEqual(44)
    expect(c?.height).toBeGreaterThanOrEqual(44)
  }
  expect(errores).toEqual([])
})

test('la silueta sigue al cursor o al dedo, es válida o inválida y dice el motivo', async ({
  page,
}) => {
  const errores = await abrir(page)
  await abrirCatalogo(page)
  await elegir(page, /^Cobertizo/)
  const mala = await buscarSitio(page, 'cobertizo', false, 'zona-incompatible')
  await apuntar(page, mala.punto)
  await expect.poll(async () => (await silueta(page))?.valida).toBe(false)
  expect((await silueta(page))?.motivo).toBe('zona-incompatible')
  const huella = await silueta(page)
  expect([huella?.ancho, huella?.alto]).toEqual([3, 2])
  await expect(panel(page)).toContainText('Hace falta pintar la zona: Almacén')
  await expect(panel(page).getByRole('button', { name: 'Construir aquí' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  const buena = await buscarSitio(page, 'cobertizo', true)
  await apuntar(page, buena.punto)
  await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
  expect(await silueta(page)).toMatchObject({ x: buena.x, y: buena.y })
  await expect(panel(page)).toContainText('Aquí se puede construir')
  if (esMovil()) {
    // Arrastrar ajusta la silueta; un toque no construye nada.
    const otro = await buscarSitio(page, 'cobertizo', false, 'zona-incompatible')
    await arrastrarDedo(page, buena.punto, otro.punto)
    await expect.poll(async () => (await silueta(page))?.valida).toBe(false)
    expect(await page.evaluate(() => window.__raices?.edificios().length)).toBe(0)
    expect((await page.evaluate(() => window.__raices?.construccion()))?.confirmando).toBe(false)
  }
  expect(errores).toEqual([])
})

test('confirmar muestra coste y lo que queda; construir deja una obra con andamio y cartel', async ({
  page,
}) => {
  const errores = await abrir(page)
  await abrirCatalogo(page)
  await elegir(page, /^Caja de envío/)
  const s = await buscarSitio(page, 'caja-envio', true)
  await apuntar(page, s.punto)
  await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
  if (esMovil()) await panel(page).getByRole('button', { name: 'Construir aquí' }).click()
  else await page.mouse.click(s.punto.x, s.punto.y)
  await expect(panel(page)).toContainText('¿Construir Caja de envío?')
  await expect(panel(page)).toContainText('Cuesta: 50 monedas y 20 de madera')
  await expect(panel(page)).toContainText('Te quedará: 1.050 monedas, 60 de madera y 20 de piedra')
  // Cancelar no gasta nada.
  await panel(page).getByRole('button', { name: 'Cancelar' }).click()
  expect(await page.evaluate(() => window.__raices?.dinero())).toBe(1100)
  expect(await page.evaluate(() => window.__raices?.edificios().length)).toBe(0)
  if (esMovil()) await panel(page).getByRole('button', { name: 'Construir aquí' }).click()
  else await page.mouse.click(s.punto.x, s.punto.y)
  await panel(page).getByRole('button', { name: 'Construir', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.dinero())).toBe(1050)
  expect(await page.evaluate(() => window.__raices?.materiales())).toEqual({
    madera: 60,
    piedra: 20,
  })
  await expect(page.getByRole('group', { name: 'Materiales' })).toContainText('60')
  await expect(page.getByRole('status').first()).toContainText('Obra empezada: Caja de envío')
  const [obra] = (await page.evaluate(() => window.__raices?.edificios())) ?? []
  expect(obra).toMatchObject({
    tipo: 'caja-envio',
    x: s.x,
    y: s.y,
    enObra: true,
    diasCartel: 1,
  })
  // Vuelve al catálogo, con el modo abierto.
  await expect(panel(page).getByRole('button', { name: /^Casa/ })).toBeVisible()
  expect(errores).toEqual([])
})

test('al pasar los días la obra termina y se ve el edificio', async ({ page }) => {
  const errores = await abrir(page)
  await construirCaja(page)
  await expect.poll(() => page.evaluate(() => window.__raices?.edificios().length)).toBe(1)
  const texturas = await page.evaluate(() => window.__raices?.texturas())
  await page.evaluate(() => {
    const r = window.__raices
    r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    r?.emitir({ tipo: 'AvanzarTiempo', minutos: 2000 })
  })
  await expect.poll(() => page.evaluate(() => window.__raices?.reloj()?.dia)).toBe(2)
  await expect
    .poll(async () => (await page.evaluate(() => window.__raices?.edificios()))?.[0]?.enObra)
    .toBe(false)
  await expect(page.getByRole('status').first()).toContainText('Obra terminada: Caja de envío')
  // El cartel (un texto con su textura) desaparece con la obra: no se acumulan texturas.
  expect(await page.evaluate(() => window.__raices?.texturas())).toBeLessThanOrEqual(texturas ?? 0)
  expect(errores).toEqual([])
})

test('sin fondos: el catálogo y la silueta dicen que no llega y no se puede construir', async ({
  page,
}) => {
  const errores = await abrir(page, `${QUERY}&dinero=10`)
  await abrirCatalogo(page)
  await expect(panel(page).getByRole('button', { name: /^Caja de envío/ })).toContainText(
    'Te faltan 40 monedas',
  )
  await elegir(page, /^Caja de envío/)
  const s = await buscarSitio(page, 'caja-envio', false, 'fondos-insuficientes')
  await apuntar(page, s.punto)
  await expect.poll(async () => (await silueta(page))?.motivo).toBe('fondos-insuficientes')
  await expect(panel(page)).toContainText('No te llega el dinero (te faltan 40)')
  await panel(page).getByRole('button', { name: 'Construir aquí' }).click({ force: true })
  if (!esMovil()) await page.mouse.click(s.punto.x, s.punto.y)
  await expect(panel(page).getByText('¿Construir')).toHaveCount(0)
  expect(await page.evaluate(() => window.__raices?.edificios().length)).toBe(0)
  expect(await page.evaluate(() => window.__raices?.dinero())).toBe(10)
  expect(errores).toEqual([])
})

test('teclado: flechas mueven la silueta, Enter pide la confirmación y otro Enter construye; Escape sale', async ({
  page,
}) => {
  test.skip(esMovil(), 'el teclado es de escritorio')
  const errores = await abrir(page)
  await abrirCatalogo(page)
  await elegir(page, /^Caja de envío/)
  const antes = (await page.evaluate(() => window.__raices?.construccion()))?.centro
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(async () => (await page.evaluate(() => window.__raices?.construccion()))?.centro?.x)
    .toBe((antes?.x ?? 0) + 1)
  // Se lleva la silueta a un sitio válido con las flechas y se confirma con Enter.
  const s = await buscarSitio(page, 'caja-envio', true)
  let c = (await page.evaluate(() => window.__raices?.construccion()))?.centro
  for (let i = 0; i < 80 && c && (c.x !== s.cx || c.y !== s.cy); i++) {
    const tecla =
      c.x < s.cx ? 'ArrowRight' : c.x > s.cx ? 'ArrowLeft' : c.y < s.cy ? 'ArrowDown' : 'ArrowUp'
    await page.keyboard.press(tecla)
    c = (await page.evaluate(() => window.__raices?.construccion()))?.centro
  }
  expect(c).toEqual({ x: s.cx, y: s.cy })
  await page.keyboard.press('Enter')
  await expect(panel(page)).toContainText('¿Construir Caja de envío?')
  // Escape cancela solo la confirmación; no se ha gastado nada.
  await page.keyboard.press('Escape')
  await expect(panel(page).getByText('¿Construir')).toHaveCount(0)
  expect(await page.evaluate(() => window.__raices?.construccion()?.abierto)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('button', { name: 'Construir', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => window.__raices?.dinero())).toBe(1050)
  expect(await page.evaluate(() => window.__raices?.edificios().length)).toBe(1)
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  expect(await page.evaluate(() => window.__raices?.construccion()?.abierto)).toBe(false)
  expect(errores).toEqual([])
})

test('construir convive con las zonas y la parcela: abrir uno cierra los otros', async ({
  page,
}) => {
  const errores = await abrir(page)
  await page.evaluate(() => window.__raices?.seleccionar(14))
  await expect(page.getByRole('region', { name: /^Parcela / })).toBeVisible()
  // Con el panel de la parcela abierto el botón Construir no está (taparía el panel en pantallas bajas).
  await expect(page.getByRole('button', { name: 'Construir', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /^Cerrar/ }).click()
  await abrirCatalogo(page)
  await panel(page).getByRole('button', { name: 'Listo' }).click()
  await expect(panel(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Zonas', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Pincel de zonas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Construir', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Listo' }).click()
  await abrirCatalogo(page)
  expect(await page.evaluate(() => window.__raices?.pincel()?.abierto)).toBe(false)
  // Volver al Modo Vida cierra el modo.
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
  await expect(panel(page)).toHaveCount(0)
  expect(errores).toEqual([])
})

test('la zona requerida de cada edificio se ve en pantallas apaisadas bajas y los botones de abajo no se cortan', async ({
  page,
}) => {
  test.skip(esMovil(), 'fija sus propios tamaños')
  for (const vp of [
    { width: 915, height: 412 },
    { width: 640, height: 320 },
    { width: 320, height: 640 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(vp)
    const errores = await abrir(page)
    // Botones inferiores: dentro de la pantalla.
    for (const nombre of ['Construir', 'Zonas']) {
      const b = await page.getByRole('button', { name: nombre, exact: true }).boundingBox()
      expect(b, `${nombre} ${vp.width}×${vp.height}`).not.toBeNull()
      if (!b) continue
      expect.soft(b.x, `${nombre} ${vp.width}×${vp.height} izquierda`).toBeGreaterThanOrEqual(0)
      expect.soft(b.x + b.width, `${nombre} derecha`).toBeLessThanOrEqual(vp.width)
    }
    await abrirCatalogo(page)
    for (const [nombre, zona] of [
      [/^Casa/, 'Zona: Vivienda'],
      [/^Caja de envío/, 'Zona: Vivienda o Almacén'],
      [/^Cobertizo/, 'Zona: Almacén'],
    ] as const) {
      const opcion = panel(page).getByRole('button', { name: nombre })
      await expect(opcion).toContainText(zona)
      // El texto de la zona es visible (no oculto con display: none) y cabe dentro del botón.
      const detalle = opcion.locator('.edificio-detalle')
      await expect(detalle, `${zona} ${vp.width}×${vp.height}`).toBeVisible()
      const d = await detalle.boundingBox()
      const o = await opcion.boundingBox()
      expect(d && o && d.y >= o.y && d.y + d.height <= o.y + o.height + 0.5).toBe(true)
    }
    expect(errores).toEqual([])
  }
})
