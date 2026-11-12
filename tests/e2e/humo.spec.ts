import { expect, test, type Page } from '@playwright/test'

/**
 * Tanda de humo (`@humo`): lo único que corre la CI (ver docs/PROCESO.md §5). Comprueba los
 * flujos básicos del juego con margen de tiempo amplio, porque el runner de GitHub no tiene GPU
 * y va a pocos fps. La tanda completa (`npm run e2e`) se ejecuta en local antes de cada hito.
 */

const TAM = 32 // TAM_CASILLA
const HUMO = { tag: '@humo' }
const LENTO = { timeout: 30_000 }

async function abrirValle(page: Page, query = '?semilla=42&debug'): Promise<void> {
  page.on('pageerror', (e) => {
    throw e
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva()), LENTO).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined), LENTO)
    .toBe(true)
}

async function personaje(page: Page): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(() => window.__raices?.personaje())
  if (!p) throw new Error('sin personaje')
  return p
}

const distancia = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

test('arrancar: la portada lleva al valle con el HUD', HUMO, async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Nueva partida' }).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva()), LENTO).toBe('valle')
  await expect(page.getByText(/Día 1 de Primavera/)).toBeVisible(LENTO)
  await expect(page.getByRole('button', { name: /Modo de juego/ })).toBeVisible()
})

test('moverse con el teclado', HUMO, async ({ page, isMobile }) => {
  test.skip(isMobile, 'el teclado es de escritorio; en móvil se prueba el toque')
  await abrirValle(page)
  const p0 = await personaje(page)
  // Alguna dirección puede tener un obstáculo pegado a la aparición: se prueban las cuatro.
  for (const tecla of ['w', 'd', 'a', 's']) {
    await page.keyboard.down(tecla)
    await page.waitForTimeout(1500)
    await page.keyboard.up(tecla)
    if (distancia(await personaje(page), p0) > 0.3) break
  }
  expect(distancia(await personaje(page), p0)).toBeGreaterThan(0.3)
})

test('clic o toque hasta un destino cercano', HUMO, async ({ page, isMobile }) => {
  await abrirValle(page)
  // La cámara se asienta sobre el personaje antes de calcular el punto de pantalla.
  await page.waitForTimeout(1500)
  const p = await personaje(page)
  const objetivo = await page.evaluate(
    ({ px, py, tam }) => {
      const r = window.__raices
      const c = r?.camara()
      if (!r || !c) return undefined
      const cx0 = Math.floor(px)
      const cy0 = Math.floor(py)
      // Casilla libre a 2 casillas, con sus vecinas libres: el camino es corto y directo.
      for (const [dx, dy] of [
        [0, -2],
        [2, 0],
        [-2, 0],
        [0, 2],
      ] as const) {
        const cx = cx0 + dx
        const cy = cy0 + dy
        if (r.bloqueada(cx, cy) || r.bloqueada(cx0 + dx / 2, cy0 + dy / 2)) continue
        return {
          cx,
          cy,
          sx: ((cx + 0.5) * tam - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
          sy: ((cy + 0.5) * tam - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
        }
      }
      return undefined
    },
    { px: p.x, py: p.y, tam: TAM },
  )
  if (!objetivo) throw new Error('no hay casilla libre a 2 casillas del personaje')
  if (isMobile) await page.touchscreen.tap(objetivo.sx, objetivo.sy)
  else await page.mouse.click(objetivo.sx, objetivo.sy)
  const meta = { x: objetivo.cx + 0.5, y: objetivo.cy + 0.5 }
  await expect.poll(async () => distancia(await personaje(page), meta), LENTO).toBeLessThan(0.3)
})

test('cambiar de modo detiene el reloj y volver lo reanuda', HUMO, async ({ page }) => {
  await abrirValle(page)
  const boton = page.getByRole('button', { name: /Modo de juego/ })
  await boton.click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo()), LENTO).toBe('plano')
  const r0 = await page.evaluate(() => window.__raices?.reloj()?.minutoDelDia)
  await page.waitForTimeout(2000)
  expect(await page.evaluate(() => window.__raices?.reloj()?.minutoDelDia)).toBe(r0)
  await boton.click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo()), LENTO).toBe('vida')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.reloj()?.minutoDelDia), LENTO)
    .toBeGreaterThan(r0 ?? 0)
})

test('un día acelerado pasa al día siguiente con el aviso', HUMO, async ({ page }) => {
  await abrirValle(page, '?semilla=42&debug&hora=01:30&acelerar=50')
  await expect(page.getByRole('status')).toHaveText(/Te quedaste dormido/, LENTO)
  await expect.poll(() => page.evaluate(() => window.__raices?.reloj()?.dia), LENTO).toBe(2)
  await expect(page.getByText(/Día 2 de Primavera/)).toBeVisible()
})

test('seleccionar una parcela en el Modo Plano abre el panel', HUMO, async ({ page, isMobile }) => {
  await abrirValle(page, '?semilla=42&debug&modo=plano')
  await expect.poll(() => page.evaluate(() => window.__raices?.modo()), LENTO).toBe('plano')
  // Sin depender de los fps: se pulsa el punto de una parcela visible en el primer fotograma.
  await expect
    .poll(() => page.evaluate(() => window.__raices?.puntoClicParcela(14) !== undefined), LENTO)
    .toBe(true)
  const punto = await page.evaluate(() => window.__raices?.puntoClicParcela(14))
  if (!punto) throw new Error('la parcela 14 no está visible')
  if (isMobile) await page.touchscreen.tap(punto.x, punto.y)
  else await page.mouse.click(punto.x, punto.y)
  await expect(page.getByRole('region', { name: /^Parcela / })).toBeVisible(LENTO)
})
