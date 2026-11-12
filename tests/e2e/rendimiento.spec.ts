import { expect, test, type Page } from '@playwright/test'

async function abrir(page: Page, ruta: string): Promise<void> {
  await page.goto(ruta)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
}

test('el terreno está horneado: pocos objetos y ningún Graphics grande', async ({ page }) => {
  await abrir(page, './?semilla=42')
  const objetos = await page.evaluate(() => window.__raices?.objetosValle())
  expect(objetos).toBeGreaterThan(0)
  expect(objetos).toBeLessThanOrEqual(20)
  const graficos = await page.evaluate(() => window.__raices?.graficosValle() ?? [])
  // Solo queda el Graphics de las 36 parcelas (cada orden ocupa varias entradas del buffer: unas 1.600 hoy; el damero entero superaba las 30.000).
  for (const n of graficos) expect(n).toBeLessThan(5000)
})

test('el contador de fps solo existe con ?debug', async ({ page }) => {
  await abrir(page, './?semilla=42')
  expect(await page.evaluate(() => window.__raices?.contadorFps())).toBeUndefined()
  await abrir(page, './?semilla=42&debug')
  await expect.poll(() => page.evaluate(() => window.__raices?.contadorFps())).toMatch(/^\d+ fps$/)
})

test('fps medias arrastrando (informativo, sin GPU en CI)', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'se mide solo en escritorio')
  test.setTimeout(60_000)
  await abrir(page, './?semilla=42')
  const v = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.mouse.move(v.width / 2, v.height / 2)
  await page.mouse.down()
  const muestras: number[] = []
  // Arrastre limitado por tiempo (no por movimientos): sin GPU cada fotograma es lento.
  const fin = Date.now() + 4000
  for (let i = 0; Date.now() < fin; i++) {
    await page.mouse.move(v.width / 2 + (i % 2 ? 150 : -150), v.height / 2 + (i % 2 ? 80 : -80))
    if (i % 4 === 3) muestras.push((await page.evaluate(() => window.__raices?.fps())) ?? 0)
  }
  await page.mouse.up()
  const media = muestras.reduce((a, b) => a + b, 0) / Math.max(1, muestras.length)
  console.log(`fps medias arrastrando: ${media.toFixed(1)}`)
  expect(media).toBeGreaterThan(5) // solo detecta bloqueos
})

test('reiniciar el valle varias veces no acumula texturas ni objetos', async ({ page }) => {
  await abrir(page, './?semilla=42&debug')
  const medir = () =>
    page.evaluate(() => ({
      texturas: window.__raices?.texturas(),
      objetos: window.__raices?.objetosValle(),
    }))
  const inicial = await medir()
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__raices?.reiniciarValle())
    await expect
      .poll(() => page.evaluate(() => window.__raices?.objetosValle()))
      .toBe(inicial.objetos)
  }
  expect(await medir()).toEqual(inicial)
})
