import { expect, test, type Page } from '@playwright/test'

test.skip(({ isMobile }) => isMobile, 'solo escritorio (el táctil llega en M2-04)')

async function abrir(page: Page, query = '?semilla=42&debug&en=vado'): Promise<void> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.locator('canvas').click({ position: { x: 5, y: 5 } })
}

const personaje = (page: Page) => page.evaluate(() => window.__raices?.personaje())
const camara = (page: Page) => page.evaluate(() => window.__raices?.camara())
const reloj = (page: Page) => page.evaluate(() => window.__raices?.reloj())

test('con ?debug&en=vado el personaje empieza sobre un vado', async ({ page }) => {
  await abrir(page)
  const p = await personaje(page)
  const v = await page.evaluate(() => window.__raices?.vados())
  if (!p || !v) throw new Error('sin datos')
  const clave = Math.floor(p.y) * v.lado + Math.floor(p.x)
  expect(v.claves).toContain(clave)
})

test('al pulsar una tecla de movimiento el personaje se mueve y la cámara lo sigue', async ({
  page,
}) => {
  await abrir(page, '?semilla=42&debug')
  const c0 = await camara(page)
  let movido = false
  // La aparición puede tener un obstáculo al lado: se prueba cada dirección hasta que alguna ande.
  for (const [tecla, eje, signo] of [
    ['d', 'x', 1],
    ['s', 'y', 1],
    ['a', 'x', -1],
    ['w', 'y', -1],
  ] as const) {
    const p0 = await personaje(page)
    await page.keyboard.down(tecla)
    await page.waitForTimeout(2000)
    await page.keyboard.up(tecla)
    const p1 = await personaje(page)
    if (!p0 || !p1 || (p1[eje] - p0[eje]) * signo < 0.5) continue
    movido = true
    await page.waitForTimeout(500)
    const c1 = await camara(page)
    if (!c0 || !c1) throw new Error('sin cámara')
    const k = eje === 'x' ? 'scrollX' : 'scrollY'
    expect((c1[k] - c0[k]) * signo).toBeGreaterThan(5)
    // El centro de la cámara está más cerca del personaje (en px) que al empezar.
    const dist = (c: NonNullable<typeof c0>) =>
      Math.hypot(c.scrollX + c.ancho / 2 - p1.x * 32, c.scrollY + c.alto / 2 - p1.y * 32)
    expect(dist(c1)).toBeLessThan(dist(c0) - 5)
    break
  }
  expect(movido).toBe(true)
})

test('las flechas también mueven y al soltar se detiene', async ({ page }) => {
  await abrir(page, '?semilla=42&debug')
  let movido = false
  // Se prueba cada flecha por si la aparición tiene un obstáculo al lado.
  for (const [tecla, eje, signo] of [
    ['ArrowRight', 'x', 1],
    ['ArrowDown', 'y', 1],
    ['ArrowLeft', 'x', -1],
    ['ArrowUp', 'y', -1],
  ] as const) {
    const antes = await personaje(page)
    await page.keyboard.down(tecla)
    await page.waitForTimeout(1500)
    await page.keyboard.up(tecla)
    const a = await personaje(page)
    if (!antes || !a || (a[eje] - antes[eje]) * signo < 0.5) continue
    movido = true
    await page.waitForTimeout(300)
    expect(await personaje(page)).toEqual(a)
    break
  }
  expect(movido).toBe(true)
})

test('al perder el foco la ventana el personaje deja de andar', async ({ page }) => {
  await abrir(page, '?semilla=42&debug')
  await page.keyboard.down('d')
  await page.waitForTimeout(300)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(100)
  const a = await personaje(page)
  await page.waitForTimeout(400)
  expect(await personaje(page)).toEqual(a)
  await page.keyboard.up('d')
})

test('el reloj avanza con el tiempo real', async ({ page }) => {
  await abrir(page, '?semilla=42&debug')
  const r0 = await reloj(page)
  await expect
    .poll(async () => (await reloj(page))?.minutoDelDia ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(r0?.minutoDelDia ?? Infinity)
})
