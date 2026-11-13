import { expect, test, type CDPSession, type Page } from '@playwright/test'

/**
 * M4-04 · Pincel de zonas en el Modo Plano. Valen en escritorio (ratón y teclado) y en móvil
 * emulado (un dedo pinta). Los gestos son reales: el punto de pantalla de cada casilla sale del
 * gancho `puntoClicCasilla` y el resultado se lee del estado del juego con `zonaDe`.
 */

const SEMILLA = 42
/** Las cuatro parcelas centrales: el centro de la vista inicial (casilla 48, 48) queda en una propia. */
const PROPIAS = '14,15,20,21'
const QUERY = `?semilla=${SEMILLA}&debug&modo=plano&propias=${PROPIAS}`

type Punto = { x: number; y: number }

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
  return errores
}

const esMovil = () => test.info().project.name === 'movil'
const barra = (page: Page) => page.getByRole('group', { name: 'Pincel de zonas' })
const herramienta = (page: Page, nombre: string) =>
  barra(page).getByRole('button', { name: nombre })
const camara = (page: Page) => page.evaluate(() => window.__raices?.camara())

async function abrirBarra(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Zonas', exact: true }).click()
  await expect(barra(page)).toBeVisible()
}

async function puntoCasilla(page: Page, cx: number, cy: number): Promise<Punto> {
  const p = await page.evaluate((c) => window.__raices?.puntoClicCasilla(c.x, c.y), {
    x: cx,
    y: cy,
  })
  if (!p) throw new Error(`La casilla ${cx},${cy} no es visible`)
  return p
}

const zona = (page: Page, cx: number, cy: number) =>
  page.evaluate((c) => window.__raices?.zonaDe(c.x, c.y), { x: cx, y: cy })

/** Cuántas casillas del rectángulo (inclusivo) tienen `esperada` (undefined = sin zona). */
async function contar(
  page: Page,
  r: { x0: number; y0: number; x1: number; y1: number },
  esperada: string | undefined,
): Promise<number> {
  return page.evaluate(
    ([r, e]) => {
      let n = 0
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) if (window.__raices?.zonaDe(x, y) === e) n++
      return n
    },
    [r, esperada] as const,
  )
}

let cdp: CDPSession | undefined

/** Arrastre de verdad con un puntero: ratón en escritorio, un dedo en móvil. `entre` se ejecuta con el gesto a medias. */
async function arrastrar(
  page: Page,
  a: Punto,
  b: Punto,
  entre?: () => Promise<void>,
): Promise<void> {
  const pasos = 6
  const en = (i: number): Punto => ({
    x: a.x + ((b.x - a.x) * i) / pasos,
    y: a.y + ((b.y - a.y) * i) / pasos,
  })
  if (esMovil()) {
    const sesion = (cdp ??= await page.context().newCDPSession(page))
    const toque = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', p?: Punto) =>
      sesion.send('Input.dispatchTouchEvent', {
        type: tipo,
        touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [],
      })
    await toque('touchStart', a)
    for (let i = 1; i <= pasos; i++) await toque('touchMove', en(i))
    await entre?.()
    await toque('touchEnd')
  } else {
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    for (let i = 1; i <= pasos; i++) await page.mouse.move(en(i).x, en(i).y)
    await entre?.()
    await page.mouse.up()
  }
}

// Rectángulo de prueba dentro de las parcelas centrales (casillas 40..55 de ambos ejes).
const RECT = { x0: 44, y0: 44, x1: 51, y1: 49 }

test.beforeEach(() => {
  cdp = undefined
})

test('el botón Zonas abre la barra con las 4 zonas, el borrador y Listo; Listo la cierra', async ({
  page,
}) => {
  const errores = await abrir(page)
  const boton = page.getByRole('button', { name: 'Zonas', exact: true })
  await expect(boton).toBeVisible()
  await abrirBarra(page)
  await expect(boton).toHaveCount(0)
  for (const nombre of ['Cultivo', 'Huerto', 'Vivienda', 'Almacén', 'Borrar', 'Listo']) {
    const b = herramienta(page, nombre)
    await expect(b).toBeVisible()
    // Objetivo táctil de al menos 44 px.
    const caja = await b.boundingBox()
    expect(caja?.width).toBeGreaterThanOrEqual(44)
    expect(caja?.height).toBeGreaterThanOrEqual(44)
  }
  await herramienta(page, 'Listo').click()
  await expect(barra(page)).toHaveCount(0)
  await expect(boton).toBeVisible()
  expect(await page.evaluate(() => window.__raices?.pincel()?.abierto)).toBe(false)
  expect(errores).toEqual([])
})

test('el botón Zonas no existe en el Modo Vida', async ({ page }) => {
  await abrir(page, `?semilla=${SEMILLA}&debug&propias=${PROPIAS}`)
  await expect(page.getByRole('button', { name: 'Zonas', exact: true })).toHaveCount(0)
})

test('arrastrar con una zona elegida dibuja una vista previa y al soltar pinta el rectángulo', async ({
  page,
}) => {
  const errores = await abrir(page)
  await abrirBarra(page)
  await herramienta(page, 'Cultivo').click()
  await expect(herramienta(page, 'Cultivo')).toHaveAttribute('aria-pressed', 'true')
  const a = await puntoCasilla(page, RECT.x0, RECT.y0)
  const b = await puntoCasilla(page, RECT.x1, RECT.y1)
  const vista0 = await camara(page)
  let previa: unknown
  await arrastrar(page, a, b, async () => {
    // Vista previa mientras se arrastra, antes de soltar: nada pintado todavía.
    previa = await page.evaluate(() => window.__raices?.pincel()?.rectangulo)
    expect(await contar(page, RECT, 'cultivo')).toBe(0)
  })
  expect(previa).toEqual(RECT)
  await expect.poll(() => contar(page, RECT, 'cultivo')).toBeGreaterThan(0)
  // Solo dentro del rectángulo.
  expect(await zona(page, RECT.x0 - 1, RECT.y0)).toBeUndefined()
  expect(await zona(page, RECT.x1 + 1, RECT.y1)).toBeUndefined()
  expect(await zona(page, RECT.x0, RECT.y1 + 1)).toBeUndefined()
  // Un dedo o el botón izquierdo no han movido la cámara.
  const vista1 = await camara(page)
  expect(vista1?.scrollX).toBeCloseTo(vista0?.scrollX ?? 0, 3)
  expect(vista1?.scrollY).toBeCloseTo(vista0?.scrollY ?? 0, 3)
  expect(vista1?.zoom).toBeCloseTo(vista0?.zoom ?? 0, 6)
  expect(errores).toEqual([])
})

test('repintar con otra zona la sustituye y el borrador la quita (gratis, sin tocar el dinero)', async ({
  page,
}) => {
  await abrir(page)
  const dinero = await page.evaluate(() => window.__raices?.dinero())
  await abrirBarra(page)
  const a = await puntoCasilla(page, RECT.x0, RECT.y0)
  const b = await puntoCasilla(page, RECT.x1, RECT.y1)
  await herramienta(page, 'Cultivo').click()
  await arrastrar(page, a, b)
  await expect.poll(() => contar(page, RECT, 'cultivo')).toBeGreaterThan(0)
  const n = await contar(page, RECT, 'cultivo')

  await herramienta(page, 'Vivienda').click()
  await arrastrar(page, a, b)
  await expect.poll(() => contar(page, RECT, 'vivienda')).toBe(n)
  expect(await contar(page, RECT, 'cultivo')).toBe(0)

  await herramienta(page, 'Borrar').click()
  await arrastrar(page, a, b)
  await expect.poll(() => contar(page, RECT, 'vivienda')).toBe(0)
  expect(await page.evaluate(() => window.__raices?.dinero())).toBe(dinero)

  await herramienta(page, 'Listo').click()
  await expect(barra(page)).toHaveCount(0)
})

test('un toque o clic sin arrastrar pinta una casilla', async ({ page }) => {
  await abrir(page)
  await abrirBarra(page)
  await herramienta(page, 'Almacén').click()
  // El río puede cortar alguna casilla: se prueban varias hasta dar con una pintable.
  let pintada: number | undefined
  for (let x = 44; x <= 52 && pintada === undefined; x++) {
    const p = await puntoCasilla(page, x, 46)
    await arrastrar(page, p, p)
    await page.waitForTimeout(100)
    if ((await zona(page, x, 46)) === 'almacen') pintada = x
  }
  expect(pintada).toBeDefined()
  // Nunca pinta fuera de la casilla pulsada.
  expect(await contar(page, { x0: 40, y0: 40, x1: 56, y1: 52 }, 'almacen')).toBe(1)
})

test('sobre parcelas ajenas no se pinta y sale un aviso amable', async ({ page }) => {
  await abrir(page, `?semilla=${SEMILLA}&debug&modo=plano&propias=21`)
  await abrirBarra(page)
  await herramienta(page, 'Huerto').click()
  // Casillas de la parcela 20 (fila 3, columna 2), que no es propia.
  const a = await puntoCasilla(page, 40, 50)
  const b = await puntoCasilla(page, 45, 55)
  await arrastrar(page, a, b)
  await expect(page.getByRole('status')).toHaveText(/Ahí no se puede pintar/, { timeout: 5000 })
  expect(await contar(page, { x0: 40, y0: 50, x1: 45, y1: 55 }, 'huerto')).toBe(0)
})

test.describe('escritorio', () => {
  test.skip(() => esMovil(), 'el teclado es de escritorio')

  test('la rueda sigue haciendo zoom y WASD mueve la cámara con el pincel activo', async ({
    page,
  }) => {
    await abrir(page)
    await abrirBarra(page)
    await herramienta(page, 'Cultivo').click()
    const antes = await camara(page)
    await page.mouse.move(600, 400)
    await page.mouse.wheel(0, -400)
    await expect.poll(async () => (await camara(page))?.zoom).toBeGreaterThan(antes?.zoom ?? 0)
    const x0 = (await camara(page))?.scrollX ?? 0
    await page.keyboard.down('d')
    await page.waitForTimeout(400)
    await page.keyboard.up('d')
    expect((await camara(page))?.scrollX ?? 0).toBeGreaterThan(x0)
  })

  test('con teclado: cursor con Enter, flechas, Enter marca la esquina y Enter aplica', async ({
    page,
  }) => {
    await abrir(page)
    await abrirBarra(page)
    await herramienta(page, 'Cultivo').click()
    const pincel = () => page.evaluate(() => window.__raices?.pincel())
    // Tras el clic el foco volvió al lienzo.
    await page.keyboard.press('Enter')
    const c0 = (await pincel())?.cursor
    expect(c0).toBeDefined()
    // Las flechas mueven el cursor (dentro de la zona libre) y no la cámara.
    const vista0 = await camara(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    const c1 = (await pincel())?.cursor
    const vista1 = await camara(page)
    expect(vista0).toBeDefined()
    expect(vista1?.scrollX).toBeCloseTo(vista0?.scrollX ?? 0, 3)
    expect(vista1?.scrollY).toBeCloseTo(vista0?.scrollY ?? 0, 3)
    expect(c1).toEqual({ x: (c0?.x ?? 0) + 1, y: (c0?.y ?? 0) + 1 })
    await page.keyboard.press('Enter') // primera esquina
    expect((await pincel())?.ancla).toEqual(c1)
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
    const fin = (await pincel())?.cursor
    expect((await pincel())?.rectangulo).toEqual({
      x0: c1?.x,
      y0: c1?.y,
      x1: fin?.x,
      y1: fin?.y,
    })
    await page.keyboard.press('Enter') // aplica
    expect((await pincel())?.ancla).toBeUndefined()
    const r = { x0: c1?.x ?? 0, y0: c1?.y ?? 0, x1: fin?.x ?? 0, y1: fin?.y ?? 0 }
    await expect.poll(() => contar(page, r, 'cultivo')).toBeGreaterThan(0)
    expect(await zona(page, r.x0 - 1, r.y0)).toBeUndefined()
    expect(await zona(page, r.x1 + 1, r.y1)).toBeUndefined()
    // Esc suelta el cursor.
    await page.keyboard.press('Escape')
    expect((await pincel())?.cursor).toBeUndefined()
  })

  test('Esc primero suelta la esquina marcada y luego el cursor', async ({ page }) => {
    await abrir(page)
    await abrirBarra(page)
    await herramienta(page, 'Huerto').click()
    const pincel = () => page.evaluate(() => window.__raices?.pincel())
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    expect((await pincel())?.ancla).toBeDefined()
    await page.keyboard.press('Escape')
    expect((await pincel())?.ancla).toBeUndefined()
    expect((await pincel())?.cursor).toBeDefined()
    await page.keyboard.press('Escape')
    expect((await pincel())?.cursor).toBeUndefined()
  })

  test('Esc sin nada marcado cierra la barra y devuelve el foco al lienzo', async ({ page }) => {
    await abrir(page)
    await abrirBarra(page)
    await herramienta(page, 'Huerto').click()
    await page.keyboard.press('Escape')
    expect((await page.evaluate(() => window.__raices?.pincel()))?.abierto).toBe(false)
    await expect(page.getByRole('group', { name: 'Pincel de zonas' })).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('juego')
  })
})

test.describe('móvil', () => {
  test.skip(() => !esMovil(), 'solo móvil')

  test('con dos dedos la cámara se mueve y no se pinta con el pincel activo', async ({ page }) => {
    await abrir(page)
    await abrirBarra(page)
    await herramienta(page, 'Cultivo').click()
    const c = (cdp ??= await page.context().newCDPSession(page))
    const tocar = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', p: [number, number][]) =>
      c.send('Input.dispatchTouchEvent', {
        type: tipo,
        touchPoints: p.map(([x, y], id) => ({ x, y, id })),
      })
    const antes = await camara(page)
    const medio = { x: 200, y: 350 }
    await tocar('touchStart', [
      [medio.x - 30, medio.y],
      [medio.x + 30, medio.y],
    ])
    for (let i = 1; i <= 5; i++) {
      await tocar('touchMove', [
        [medio.x - 30 + 12 * i, medio.y + 8 * i],
        [medio.x + 30 + 12 * i, medio.y + 8 * i],
      ])
    }
    await tocar('touchEnd', [])
    const despues = await camara(page)
    // Dos dedos desplazan la cámara y no pintan nada.
    expect(Math.abs((despues?.scrollX ?? 0) - (antes?.scrollX ?? 0))).toBeGreaterThan(10)
    expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'cultivo')).toBe(0)
  })
})

test('en el Modo Vida la capa de zonas es un tono suave (ALFA_ZONAS_VIDA) y en Plano es opaca', async ({
  page,
}) => {
  await abrir(page)
  await abrirBarra(page)
  await herramienta(page, 'Cultivo').click()
  const a = await puntoCasilla(page, RECT.x0, RECT.y0)
  const b = await puntoCasilla(page, RECT.x1, RECT.y1)
  await arrastrar(page, a, b)
  await expect.poll(() => contar(page, RECT, 'cultivo')).toBeGreaterThan(0)
  const alfa = () => page.evaluate(() => window.__raices?.alfaZonas())
  expect(await alfa()).toBe(1)
  await herramienta(page, 'Listo').click()
  const modoBoton = page.getByRole('button', { name: /Modo de juego/ })
  await modoBoton.click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
  await expect.poll(() => alfa()).toBeCloseTo(0.35, 5)
  await modoBoton.click()
  await expect.poll(() => alfa()).toBe(1)
})
