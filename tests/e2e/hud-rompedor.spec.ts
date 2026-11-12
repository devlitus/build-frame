import { expect, test, type Page } from '@playwright/test'

/** M2-06 · Rompedor del HUD de tiempo. */

async function abrir(page: Page, query: string): Promise<void> {
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
}
type R = { x: number; y: number; width: number; height: number }
const caja = async (page: Page, sel: string): Promise<R> => {
  const c = await page.locator(sel).first().boundingBox()
  if (!c) throw new Error('sin caja ' + sel)
  return c
}
const solapa = (a: R, b: R) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test.describe('aviso de desmayo sobre el HUD', () => {
  test.skip(({ isMobile }) => isMobile, 'viewports fijados por el propio test')
  for (const [w, h] of [
    [360, 640],
    [412, 915],
    [915, 412],
  ] as const) {
    for (const debug of [true]) {
      test(`el aviso no tapa reloj ni botones en ${w}x${h}${debug ? ' con debug' : ''}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: w, height: h })
        await abrir(page, debug ? '?semilla=42&debug' : '?semilla=42')
        await expect(page.getByRole('timer')).toHaveText('06:00')
        await page.waitForTimeout(500)
        await page.evaluate(() => window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 1300 }))
        await expect(page.getByRole('status')).toHaveText(/dormido/)
        // Modo Plano: aparece además la insignia «En pausa (Plano)» (peor caso de ancho).
        await page.getByRole('button', { name: /Modo de juego/ }).click()
        const aviso = await caja(page, '.aviso')
        for (const sel of ['.reloj', '.boton-pausa', '.tiempo-detenido', '.boton-modo']) {
          if ((await page.locator(sel).count()) === 0) continue
          expect(solapa(aviso, await caja(page, sel)), `aviso solapa ${sel}`).toBe(false)
        }
      })
    }
  }
})

test('el HUD no se repinta a ritmo de fotograma (x1, 3 s)', async ({ page }) => {
  await abrir(page, '?semilla=42')
  const n = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        let c = 0
        const o = new MutationObserver((l) => {
          c += l.length
        })
        const hud = document.querySelector('.hud')
        if (hud)
          o.observe(hud, { subtree: true, childList: true, characterData: true, attributes: true })
        setTimeout(() => {
          o.disconnect()
          res(c)
        }, 3000)
      }),
  )
  expect(n).toBeLessThan(15)
})

test('P con foco en un botón alterna una sola vez; mantenida no repite', async ({ page }) => {
  test.skip(test.info().project.name.startsWith('movil'), 'teclado')
  await abrir(page, '?semilla=42')
  await page.getByRole('button', { name: 'Velocidad x2' }).focus()
  await page.keyboard.press('p')
  expect(await page.evaluate(() => window.__raices?.reloj()?.pausado)).toBe(true)
  await page.keyboard.down('p')
  for (let i = 0; i < 5; i++) await page.keyboard.down('p')
  await page.keyboard.up('p')
  expect(await page.evaluate(() => window.__raices?.reloj()?.pausado)).toBe(false)
})
