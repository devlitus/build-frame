import { expect, test, type Page } from '@playwright/test'

/** M2-05 · Modos Vida y Plano. Valen en escritorio y en móvil emulado (ratón y teclado). */

async function abrir(page: Page, query = '?semilla=42&debug'): Promise<string[]> {
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

const boton = (page: Page) => page.getByRole('button', { name: /Modo de juego/ })
const modo = (page: Page) => page.evaluate(() => window.__raices?.modo())
const personaje = (page: Page) => page.evaluate(() => window.__raices?.personaje())
const camara = (page: Page) => page.evaluate(() => window.__raices?.camara())
const reloj = (page: Page) => page.evaluate(() => window.__raices?.reloj())

const centroCamara = (c: NonNullable<Awaited<ReturnType<typeof camara>>>) => ({
  x: c.scrollX + c.ancho / 2,
  y: c.scrollY + c.alto / 2,
})

/** Distancia (px del mundo) del personaje al rectángulo visible; 0 si está dentro con `margen`. */
function fueraDePantalla(
  c: NonNullable<Awaited<ReturnType<typeof camara>>>,
  p: { x: number; y: number },
  margen = 16,
): number {
  const o = centroCamara(c)
  const mx = c.ancho / c.zoom / 2 - margen
  const my = c.alto / c.zoom / 2 - margen
  return Math.max(0, Math.abs(p.x * 32 - o.x) - mx, Math.abs(p.y * 32 - o.y) - my)
}

async function arrastrar(page: Page, dx: number, dy: number): Promise<void> {
  const v = page.viewportSize() ?? { width: 1280, height: 720 }
  const x = v.width / 2
  const y = v.height / 3
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

/** Acerca con la rueda para que haya sitio donde desplazar la cámara. */
async function acercar(page: Page): Promise<void> {
  await page.mouse.move(400, 300)
  await page.mouse.wheel(0, -600) // en el móvil emulado la rueda no actúa: ahí ya sobra sitio
  await page.waitForTimeout(300)
}

test('al empezar el personaje está en pantalla, en Modo Vida', async ({ page }) => {
  const errores = await abrir(page, '?semilla=42')
  expect(await modo(page)).toBe('vida')
  const p = await personaje(page)
  const c = await camara(page)
  if (!p || !c) throw new Error('sin datos')
  // La cámara no sale del valle: si el personaje está junto al borde no queda en el centro exacto.
  expect(fueraDePantalla(c, p)).toBeLessThan(1)
  expect(errores).toEqual([])
})

test('?modo=plano empieza en Plano con la vista centrada en el valle', async ({ page }) => {
  await abrir(page, '?semilla=42&modo=plano')
  expect(await modo(page)).toBe('plano')
  const c = await camara(page)
  const mundo = await page.evaluate(() => window.__raices?.mundoPx())
  if (!c || !mundo) throw new Error('sin datos')
  expect(centroCamara(c).x).toBeCloseTo(mundo / 2, 0)
  expect(centroCamara(c).y).toBeCloseTo(mundo / 2, 0)
  await expect(boton(page)).toHaveAttribute('aria-pressed', 'true')
})

test('el botón muestra el modo, cambia al otro y es tocable', async ({ page }) => {
  await abrir(page, '?semilla=42')
  const b = boton(page)
  await expect(b).toHaveText('Vida')
  await expect(b).toHaveAttribute('aria-pressed', 'false')
  const caja = await b.boundingBox()
  expect(caja?.height).toBeGreaterThanOrEqual(44)
  expect(caja?.width).toBeGreaterThanOrEqual(44)
  await b.click()
  await expect.poll(() => modo(page)).toBe('plano')
  await expect(b).toHaveText('Plano')
  await expect(b).toHaveAttribute('aria-pressed', 'true')
  await b.click()
  await expect.poll(() => modo(page)).toBe('vida')
  await expect(b).toHaveText('Vida')
})

test('el botón queda abajo a la derecha, dentro de la pantalla, en vertical y horizontal', async ({
  page,
}) => {
  await abrir(page, '?semilla=42')
  for (const tam of [
    { width: 412, height: 915 },
    { width: 915, height: 412 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(tam)
    const caja = await boton(page).boundingBox()
    if (!caja) throw new Error('sin botón')
    expect(caja.x + caja.width).toBeLessThanOrEqual(tam.width)
    expect(caja.y + caja.height).toBeLessThanOrEqual(tam.height)
    // Libres la parte de arriba (hora y tiempo) y abajo a la izquierda (joystick).
    expect(caja.x).toBeGreaterThan(tam.width / 2)
    expect(caja.y).toBeGreaterThan(tam.height / 2)
  }
})

test('la tecla M cambia de modo', async ({ page }) => {
  await abrir(page, '?semilla=42')
  await page.locator('canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('m')
  await expect.poll(() => modo(page)).toBe('plano')
  await page.keyboard.press('m')
  await expect.poll(() => modo(page)).toBe('vida')
})

test('tras pulsar el botón el teclado sigue moviendo al personaje', async ({ page }) => {
  await abrir(page, '?semilla=42')
  await boton(page).click()
  await boton(page).click()
  expect(await modo(page)).toBe('vida')
  let movido = false
  for (const tecla of ['d', 's', 'a', 'w']) {
    const p0 = await personaje(page)
    await page.keyboard.down(tecla)
    await page.waitForTimeout(1500)
    await page.keyboard.up(tecla)
    const p1 = await personaje(page)
    if (p0 && p1 && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.5) {
      movido = true
      break
    }
  }
  expect(movido).toBe(true)
})

test('en Plano el reloj no avanza y el personaje no se mueve', async ({ page }) => {
  await abrir(page, '?semilla=42')
  await boton(page).click()
  await expect.poll(() => modo(page)).toBe('plano')
  const r0 = await reloj(page)
  const p0 = await personaje(page)
  for (const t of ['d', 's', 'a', 'w']) {
    await page.keyboard.down(t)
    await page.waitForTimeout(500)
    await page.keyboard.up(t)
  }
  await page.waitForTimeout(1500)
  expect(await reloj(page)).toEqual(r0)
  expect(await personaje(page)).toEqual(p0)
})

test('en Vida el reloj avanza', async ({ page }) => {
  await abrir(page, '?semilla=42')
  const r0 = await reloj(page)
  await expect
    .poll(async () => (await reloj(page))?.minutoDelDia ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(r0?.minutoDelDia ?? 0)
})

test('volver a Vida recupera la pausa previa', async ({ page }) => {
  await abrir(page)
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Pausar' }))
  await boton(page).click()
  await boton(page).click()
  expect(await modo(page)).toBe('vida')
  const r0 = await reloj(page)
  expect(r0?.pausado).toBe(true)
  await page.waitForTimeout(1800)
  expect(await reloj(page)).toEqual(r0)
  // Sin pausa previa el reloj sigue en cuanto se vuelve a Vida.
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Reanudar' }))
  await expect
    .poll(async () => (await reloj(page))?.minutoDelDia ?? 0, { timeout: 20_000 })
    .toBeGreaterThan(r0?.minutoDelDia ?? 0)
})

test('20 cambios rápidos seguidos no dan errores en consola', async ({ page }) => {
  const errores = await abrir(page, '?semilla=42')
  await page.locator('canvas').click({ position: { x: 5, y: 5 } })
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('m')
    await boton(page).click()
  }
  await page.waitForTimeout(300)
  // 10 teclas + 10 clics = 20 cambios: acaba donde empezó.
  expect(await modo(page)).toBe('vida')
  expect(errores).toEqual([])
})

test('en Vida el arrastre no mueve la cámara; la rueda hace zoom', async ({ page }) => {
  await abrir(page, '?semilla=42')
  await page.waitForTimeout(300)
  const c0 = await camara(page)
  await arrastrar(page, -150, -90)
  await page.waitForTimeout(300)
  expect(await camara(page)).toEqual(c0)
  await page.mouse.move(400, 300)
  await page.mouse.wheel(0, -400)
  await expect.poll(async () => (await camara(page))?.zoom ?? 0).toBeGreaterThan(c0?.zoom ?? 0)
})

test('en Plano el arrastre mueve la cámara y el personaje no se mueve', async ({ page }) => {
  await abrir(page, '?semilla=42')
  await acercar(page)
  await boton(page).click()
  await expect.poll(() => modo(page)).toBe('plano')
  const c0 = await camara(page)
  const p0 = await personaje(page)
  if (!c0) throw new Error('sin cámara')
  await arrastrar(page, -120, -70)
  const c1 = await camara(page)
  if (!c1) throw new Error('sin cámara')
  expect(Math.hypot(c1.scrollX - c0.scrollX, c1.scrollY - c0.scrollY)).toBeGreaterThan(20)
  expect(await personaje(page)).toEqual(p0)
})

test('en Plano WASD desplazan la cámara y +/- hacen zoom; al volver a Vida la cámara regresa al personaje', async ({
  page,
}) => {
  await abrir(page, '?semilla=42')
  await acercar(page)
  await page.locator('canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('m')
  await expect.poll(() => modo(page)).toBe('plano')
  const p = await personaje(page)
  if (!p) throw new Error('sin personaje')

  // Alguna dirección desplaza la cámara (una puede estar contra el borde del valle).
  let movida = false
  for (const tecla of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    const antes = await camara(page)
    await page.keyboard.down(tecla)
    await page.waitForTimeout(500)
    await page.keyboard.up(tecla)
    const despues = await camara(page)
    if (
      antes &&
      despues &&
      Math.hypot(despues.scrollX - antes.scrollX, despues.scrollY - antes.scrollY) > 20
    ) {
      movida = true
      break
    }
  }
  expect(movida).toBe(true)
  expect(await personaje(page)).toEqual(p)

  // Zoom con el teclado.
  const z0 = (await camara(page))?.zoom ?? 0
  await page.keyboard.down('-')
  await page.waitForTimeout(500)
  await page.keyboard.up('-')
  const z1 = (await camara(page))?.zoom ?? 0
  expect(z1).toBeLessThan(z0)
  await page.keyboard.down('+')
  await page.waitForTimeout(500)
  await page.keyboard.up('+')
  expect((await camara(page))?.zoom ?? 0).toBeGreaterThan(z1)

  // De vuelta a Vida la cámara regresa al personaje aunque esté quieto.
  await page.keyboard.press('m')
  await expect.poll(() => modo(page)).toBe('vida')
  await expect
    .poll(async () => {
      const c = await camara(page)
      if (!c) return Infinity
      return fueraDePantalla(c, p)
    })
    .toBeLessThan(1)
})
