/** Rompedor · M1-04. Costuras, contador, pérdida de contexto. */
import { expect, test, type Page } from '@playwright/test'

async function abrir(page: Page, ruta: string): Promise<void> {
  await page.goto(ruta)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
}

/** Cuenta píxeles con el color de fondo (#3f5d3a), ausente de la paleta del terreno. */
async function pixelesDeFondo(page: Page, modo: 'racha' | 'fraccion' = 'racha'): Promise<number> {
  const b64 = (await page.screenshot()).toString('base64')
  return page.evaluate(
    async ([datos, modo]) => {
      const bmp = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${datos}`)).blob(),
      )
      const cv = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = cv.getContext('2d') as OffscreenCanvasRenderingContext2D
      ctx.drawImage(bmp, 0, 0)
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
      // Una costura es una línea: se cuenta la racha más larga de píxeles de fondo (horizontal o vertical).
      // Fondo puro (63,93,58) o fondo bajo el tinte de las parcelas en venta (negro al 16 %: 53,78,49).
      const cerca = (i: number, r: number, g: number, bl: number): boolean =>
        Math.abs((d[i] ?? 0) - r) < 6 &&
        Math.abs((d[i + 1] ?? 0) - g) < 6 &&
        Math.abs((d[i + 2] ?? 0) - bl) < 6
      const es = (x: number, y: number): boolean => {
        const i = (y * bmp.width + x) * 4
        return cerca(i, 63, 93, 58) || cerca(i, 53, 78, 49)
      }
      let total = 0
      for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) if (es(x, y)) total++
      if (modo === 'fraccion') return total / (bmp.width * bmp.height)
      let n = 0
      for (let y = 0; y < bmp.height; y++) {
        let r = 0
        for (let x = 0; x < bmp.width; x++) n = Math.max(n, (r = es(x, y) ? r + 1 : 0))
      }
      for (let x = 0; x < bmp.width; x++) {
        let r = 0
        for (let y = 0; y < bmp.height; y++) n = Math.max(n, (r = es(x, y) ? r + 1 : 0))
      }
      return n
    },
    [b64, modo] as const,
  )
}

test(
  'sin costuras ni huecos de fondo con zooms fraccionarios y medio píxel',
  { tag: '@rendimiento' },
  async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio')
    await abrir(page, './?semilla=42&modo=plano')
    const v = page.viewportSize() ?? { width: 1280, height: 720 }
    await page.mouse.move(v.width / 2, v.height / 2)
    for (const delta of [-300, 200, -150, -250, 700, -900]) {
      await page.mouse.wheel(0, delta)
      await page.waitForTimeout(150)
      const c = await page.evaluate(() => window.__raices?.camara())
      await page.mouse.down()
      await page.mouse.move(v.width / 2 + 0.5, v.height / 2 + 0.5)
      await page.mouse.up()
      await page.waitForTimeout(100)
      expect(await pixelesDeFondo(page), `zoom ${c?.zoom}`).toBeLessThan(10)
    }
  },
)

test('el contador no captura gestos: arrastrar desde él mueve la cámara', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'escritorio')
  await abrir(page, './?semilla=42&debug&modo=plano')
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(200)
  const antes = await page.evaluate(() => window.__raices?.camara())
  await page.mouse.move(20, 18)
  await page.mouse.down()
  await page.mouse.move(120, 118, { steps: 5 })
  await page.mouse.up()
  const despues = await page.evaluate(() => window.__raices?.camara())
  expect(despues?.scrollX).not.toBe(antes?.scrollX)
})

test('?debug=0, ?debug=false y ?DEBUG no crean el contador', async ({ page }) => {
  for (const q of ['debug=0', 'debug=false', 'DEBUG']) {
    await abrir(page, `./?semilla=42&${q}`)
    expect(await page.evaluate(() => window.__raices?.contadorFps()), q).toBeUndefined()
  }
})

test('desde la portada con ?debug el contador sobrevive a «Nueva partida»', async ({ page }) => {
  await page.goto('./?debug')
  await expect.poll(() => page.evaluate(() => window.__raices?.contadorFps())).toMatch(/fps/)
  await page.getByRole('button', { name: /nueva partida/i }).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => window.__raices?.contadorFps())).toMatch(/^\d+ fps$/)
})

test('tras perder y recuperar el contexto WebGL el terreno sigue dibujado', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'escritorio')
  await abrir(page, './?semilla=42&modo=plano')
  expect(await pixelesDeFondo(page, 'fraccion')).toBeLessThan(0.05) // antes: terreno visible
  const res = await page.evaluate(async () => {
    const cv = document.querySelector('canvas') as HTMLCanvasElement
    let restaurado = false
    cv.addEventListener('webglcontextrestored', () => (restaurado = true))
    const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGL2RenderingContext | null
    const ext = gl?.getExtension('WEBGL_lose_context')
    if (!ext) return 'sin-extension'
    ext.loseContext()
    await new Promise((r) => setTimeout(r, 300))
    ext.restoreContext()
    await new Promise((r) => setTimeout(r, 1500))
    return restaurado ? 'restaurado' : 'no-restaurado'
  })
  expect(res).toBe('restaurado')
  // S2: sin terreno solo queda el fondo (con o sin tinte de parcelas).
  expect(await pixelesDeFondo(page, 'fraccion')).toBeLessThan(0.05)
})
