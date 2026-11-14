import { expect, test, type Page } from '@playwright/test'

/**
 * M5-01 · Inventario y herramienta activa. Escritorio (teclas y ratón) y móvil emulado (barra de
 * herramientas táctil y botón de acción). Las herramientas aún no tienen efecto: se comprueba el
 * último uso (`ultimoUso`) y su motivo de rechazo.
 */

const TAM = 32 // TAM_CASILLA
const NOMBRES = ['Azada', 'Regadera', 'Semillas', 'Mano', 'Hacha', 'Pico']

async function abrirValle(page: Page, query = '?semilla=42&debug'): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  return errores
}

/** Todas las parcelas propias (solo con `debug`): la azada solo ara en parcela propia (M5-03). */
const PROPIAS = `?semilla=42&debug&propias=${Array.from({ length: 36 }, (_, i) => i).join(',')}`
const pintarCultivo = (page: Page, c: { x: number; y: number }) =>
  page.evaluate(
    (k) =>
      window.__raices?.emitir({
        tipo: 'PintarZona',
        x0: k.x,
        y0: k.y,
        x1: k.x,
        y1: k.y,
        zona: 'cultivo',
      }),
    c,
  )

const herramienta = (page: Page) => page.evaluate(() => window.__raices?.herramienta())
const inventario = (page: Page) => page.evaluate(() => window.__raices?.inventario())
const ultimoUso = (page: Page) => page.evaluate(() => window.__raices?.ultimoUso())
const personaje = (page: Page) => page.evaluate(() => window.__raices?.personaje())
const barra = (page: Page) => page.getByRole('group', { name: 'Herramientas' })
const panel = (page: Page) => page.getByRole('region', { name: 'Inventario' })

test('la barra de herramientas muestra las seis, con botones de al menos 44 px', async ({
  page,
}) => {
  const errores = await abrirValle(page)
  await expect(barra(page)).toBeVisible()
  for (const [i, nombre] of NOMBRES.entries()) {
    const b = barra(page).getByRole('button', { name: nombre, exact: true })
    await expect(b).toBeVisible()
    const caja = await b.boundingBox()
    expect(caja?.width).toBeGreaterThanOrEqual(44)
    expect(caja?.height).toBeGreaterThanOrEqual(44)
    await expect(b).toHaveAttribute('aria-keyshortcuts', String(i + 1))
  }
  // La activa al empezar es la azada, con su nombre en texto.
  await expect(barra(page).getByRole('button', { name: 'Azada', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('Herramienta activa: Azada')).toBeVisible()
  expect(errores).toEqual([])
})

test('elegir una herramienta con un clic o un toque en la barra', async ({ page }) => {
  await abrirValle(page)
  await barra(page).getByRole('button', { name: 'Hacha', exact: true }).click()
  expect((await herramienta(page))?.herramienta).toBe('hacha')
  await expect(barra(page).getByRole('button', { name: 'Hacha', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(barra(page).getByRole('button', { name: 'Azada', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.getByText('Herramienta activa: Hacha')).toBeVisible()
  // Elegir «Semillas» sin semilla elegida toma la primera del inventario (rábano).
  await barra(page).getByRole('button', { name: 'Semillas', exact: true }).click()
  expect(await herramienta(page)).toEqual({ herramienta: 'semillas', semilla: 'semilla-rabano' })
  await expect(page.getByText('Herramienta activa: Semillas (Semillas de rábano)')).toBeVisible()
})

test('las teclas 1 a 6 eligen la herramienta', async ({ page, isMobile }) => {
  test.skip(isMobile, 'el teclado es de escritorio')
  await abrirValle(page)
  const esperadas = ['azada', 'regadera', 'semillas', 'mano', 'hacha', 'pico']
  for (const [i, h] of esperadas.entries()) {
    await page.keyboard.press(String(i + 1))
    await expect.poll(async () => (await herramienta(page))?.herramienta).toBe(h)
  }
  // 7, 8 y 9 no hacen nada.
  await page.keyboard.press('7')
  expect((await herramienta(page))?.herramienta).toBe('pico')
})

test('E y Espacio usan la herramienta en la casilla de enfrente', async ({ page, isMobile }) => {
  test.skip(isMobile, 'el teclado es de escritorio')
  await abrirValle(page, PROPIAS)
  // Se gira hacia una casilla libre (la de enfrente de la aparición puede ser un obstáculo).
  await page.evaluate(() => {
    const r = window.__raices
    const q = r?.personaje()
    if (!r || !q) return
    const cx = Math.floor(q.x)
    const cy = Math.floor(q.y)
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ] as const) {
      if (!r.bloqueada(cx + dx, cy + dy)) {
        r.emitir({ tipo: 'MoverPersonaje', dx, dy, ms: 1 })
        return
      }
    }
  })
  const p = await personaje(page)
  if (!p) throw new Error('sin personaje')
  const HACIA = { norte: [0, -1], sur: [0, 1], este: [1, 0], oeste: [-1, 0] } as const
  const [dx, dy] = HACIA[p.orientacion as keyof typeof HACIA]
  const enfrente = { x: Math.floor(p.x) + dx, y: Math.floor(p.y) + dy }
  await pintarCultivo(page, enfrente)
  await page.keyboard.press('e')
  await expect
    .poll(() => ultimoUso(page))
    .toMatchObject({ n: 1, herramienta: 'azada', ...enfrente })
  expect((await ultimoUso(page))?.error).toBeUndefined()
  await page.keyboard.press('Space')
  await expect.poll(async () => (await ultimoUso(page))?.n).toBe(2)
})

test('el botón de acción usa la herramienta en la casilla de enfrente', async ({ page }) => {
  await abrirValle(page)
  await page.getByRole('button', { name: 'Hacha', exact: true }).click()
  await page.getByRole('button', { name: 'Usar hacha' }).click()
  await expect.poll(() => ultimoUso(page)).toMatchObject({ n: 1, herramienta: 'hacha' })
  expect((await ultimoUso(page))?.error).toBeUndefined()
  const caja = await page.getByRole('button', { name: 'Usar hacha' }).boundingBox()
  expect(caja?.height).toBeGreaterThanOrEqual(44)
})

test('con la pausa el uso se rechaza con su motivo', async ({ page }) => {
  await abrirValle(page)
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Pausar' }))
  await page.getByRole('button', { name: /^Usar azada/ }).click()
  await expect.poll(() => ultimoUso(page)).toMatchObject({ n: 1, error: 'en-pausa' })
  await expect(page.getByRole('status').filter({ hasText: 'en pausa' })).toBeVisible()
})

test('un clic en una casilla pegada usa la herramienta; uno lejano camina', async ({ page }) => {
  await abrirValle(page, PROPIAS)
  // La cámara se asienta sobre el personaje: se espera a que deje de moverse.
  let anterior = ''
  await expect
    .poll(async () => {
      const c = await page.evaluate(() => window.__raices?.camara())
      const ahora = JSON.stringify([c?.scrollX, c?.scrollY, c?.zoom])
      const quieta = ahora === anterior
      anterior = ahora
      return quieta
    })
    .toBe(true)
  const p = await personaje(page)
  if (!p) throw new Error('sin personaje')
  const aPantalla = (cx: number, cy: number) =>
    page.evaluate(
      ({ cx, cy, tam }) => {
        const c = window.__raices?.camara()
        if (!c) return undefined
        return {
          x: ((cx + 0.5) * tam - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
          y: ((cy + 0.5) * tam - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
        }
      },
      { cx, cy, tam: TAM },
    )
  const cx = Math.floor(p.x)
  const cy = Math.floor(p.y)
  // Casilla pegada (diagonal, hacia arriba: abajo puede haber botones): usa la herramienta y el personaje no echa a andar.
  await pintarCultivo(page, { x: cx - 1, y: cy - 1 })
  const cerca = await aPantalla(cx - 1, cy - 1)
  if (!cerca) throw new Error('sin cámara')
  await page.mouse.click(cerca.x, cerca.y)
  await expect.poll(() => ultimoUso(page)).toMatchObject({ n: 1, x: cx - 1, y: cy - 1 })
  expect((await ultimoUso(page))?.error).toBeUndefined()
  expect(await page.evaluate(() => window.__raices?.destino())).toBeUndefined()
  // A tres casillas: camina, sin usar la herramienta.
  const lejos = await aPantalla(cx + 3, cy - 2)
  if (!lejos) throw new Error('sin cámara')
  await page.mouse.click(lejos.x, lejos.y)
  await expect
    .poll(async () => (await personaje(page))?.x ?? 0, { timeout: 15_000 })
    .not.toBeCloseTo(p.x, 0)
  expect((await ultimoUso(page))?.n).toBe(1)
})

test('inventario: el botón abre el panel con ranuras, cantidades y capacidad', async ({ page }) => {
  const errores = await abrirValle(page)
  await expect(panel(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page).getByText('3 de 12 ranuras')).toBeVisible()
  const ranuras = panel(page)
    .getByRole('list', { name: 'Ranuras del inventario' })
    .getByRole('listitem')
  await expect(ranuras).toHaveCount(12)
  await expect(panel(page).getByRole('button', { name: /^Semillas de rábano, 10/ })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: /^Semillas de patata, 10/ })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: /^Semillas de fresa, 5/ })).toBeVisible()
  expect((await inventario(page))?.capacidad).toBe(12)
  expect((await inventario(page))?.abierto).toBe(true)
  // Se cierra con su botón y el del HUD vuelve.
  await panel(page).getByRole('button', { name: 'Cerrar el inventario' }).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Inventario', exact: true })).toBeVisible()
  expect(errores).toEqual([])
})

test('inventario: elegir una semilla del panel activa «Semillas»', async ({ page }) => {
  await abrirValle(page)
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  const fresa = panel(page).getByRole('button', { name: /^Semillas de fresa/ })
  await expect(fresa).toHaveAttribute('aria-pressed', 'false')
  await fresa.click()
  expect(await herramienta(page)).toEqual({ herramienta: 'semillas', semilla: 'semilla-fresa' })
  await expect(fresa).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Herramienta activa: Semillas (Semillas de fresa)')).toBeVisible()
})

test('inventario: la tecla I y Escape abren y cierran, con el teclado', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'el teclado es de escritorio')
  await abrirValle(page)
  await page.keyboard.press('i')
  await expect(panel(page)).toBeVisible()
  // El foco entra en el panel: Tab llega a «Cerrar» y a las semillas; I lo cierra.
  await expect(panel(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel(page).getByRole('button', { name: 'Cerrar el inventario' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel(page).getByRole('button', { name: /^Semillas de rábano/ })).toBeFocused()
  await page.keyboard.press('Enter')
  expect((await herramienta(page))?.semilla).toBe('semilla-rabano')
  await page.keyboard.press('i')
  await expect(panel(page)).toHaveCount(0)
  // El foco vuelve al lienzo: las teclas del juego siguen funcionando.
  await page.keyboard.press('5')
  expect((await herramienta(page))?.herramienta).toBe('hacha')
  await page.keyboard.press('i')
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
})

test('en el Modo Plano no hay barra, ni botones, ni teclas de herramienta', async ({
  page,
  isMobile,
}) => {
  await abrirValle(page, '?semilla=42&debug&modo=plano')
  await expect(barra(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Inventario', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Usar / })).toHaveCount(0)
  if (!isMobile) {
    await page.keyboard.press('4')
    await page.keyboard.press('i')
    expect((await herramienta(page))?.herramienta).toBe('azada')
    await expect(panel(page)).toHaveCount(0)
  }
  // Al volver a Vida reaparecen.
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect(barra(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inventario', exact: true })).toBeVisible()
})

test('el inventario abierto se cierra al pasar al Modo Plano', async ({ page }) => {
  await abrirValle(page)
  await page.getByRole('button', { name: 'Inventario', exact: true }).click()
  await expect(panel(page)).toBeVisible()
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect(panel(page)).toHaveCount(0)
  expect((await inventario(page))?.abierto).toBe(false)
})
