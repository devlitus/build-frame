/* eslint-disable @typescript-eslint/no-non-null-assertion -- código dentro de page.evaluate, sin tipos de ayuda */
import { expect, test, type Page } from '@playwright/test'

test.skip(({ isMobile }) => isMobile, 'solo escritorio')

async function abrir(page: Page, query = '?semilla=42&debug&en=vado'): Promise<void> {
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.locator('canvas').click({ position: { x: 5, y: 5 } })
}

test('las teclas de movimiento no bloquean atajos del navegador (Ctrl+L, F5)', async ({ page }) => {
  await abrir(page)
  const r = await page.evaluate(() => {
    const prueba = (init: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    return {
      ctrlL: prueba({ key: 'l', code: 'KeyL', keyCode: 76, ctrlKey: true }),
      f5: prueba({ key: 'F5', code: 'F5', keyCode: 116 }),
      ctrlD: prueba({ key: 'd', code: 'KeyD', keyCode: 68, ctrlKey: true }),
    }
  })
  expect(r.ctrlL).toBe(false)
  expect(r.f5).toBe(false)
  // Ctrl+D (marcador) no debe mover al personaje ni capturarse.
  expect(r.ctrlD).toBe(false)
})

test('reiniciar la escena varias veces no duplica el zoom de la rueda ni los objetos', async ({
  page,
}) => {
  await abrir(page)
  const objetos0 = await page.evaluate(() => window.__raices?.objetosValle())
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__raices?.reiniciarValle())
    await expect
      .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
      .toBe(true)
    await page.waitForTimeout(150)
  }
  expect(await page.evaluate(() => window.__raices?.objetosValle())).toBe(objetos0)
  await page.mouse.move(640, 360)
  const z0 = (await page.evaluate(() => window.__raices?.camara()?.zoom)) ?? 1
  await page.mouse.wheel(0, -100)
  await page.waitForTimeout(200)
  const z1 = (await page.evaluate(() => window.__raices?.camara()?.zoom)) ?? 1
  // Un solo oyente: zoom = exp(100 * 0.0015) ~ 1.162 (si hay 2 sería ~1.35).
  expect(z1 / z0).toBeLessThan(1.2)
})

test('mantener una tecla al reiniciar la escena no deja al personaje andando solo', async ({
  page,
}) => {
  await abrir(page)
  await page.keyboard.down('s')
  await page.waitForTimeout(200)
  await page.evaluate(() => window.__raices?.reiniciarValle())
  await page.keyboard.up('s')
  await page.waitForTimeout(300)
  const a = await page.evaluate(() => window.__raices?.personaje())
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.__raices?.personaje())).toEqual(a)
})

test('dos teclas opuestas se anulan', async ({ page }) => {
  await abrir(page)
  const a = await page.evaluate(() => window.__raices?.personaje())
  await page.keyboard.down('a')
  await page.keyboard.down('d')
  await page.waitForTimeout(600)
  const b = await page.evaluate(() => window.__raices?.personaje())
  await page.keyboard.up('a')
  await page.keyboard.up('d')
  expect(b?.x).toBeCloseTo(a?.x ?? 0, 0)
})

test('la cámara se mantiene dentro del valle caminando mucho y al redimensionar', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await abrir(page)
  const dentro = async () => {
    const c = await page.evaluate(() => window.__raices?.camara())
    if (!c) throw new Error('sin cámara')
    const vx = c.ancho / c.zoom
    const vy = c.alto / c.zoom
    const cx = c.scrollX + c.ancho / 2
    const cy = c.scrollY + c.alto / 2
    if (vx < 3072) {
      expect(cx - vx / 2).toBeGreaterThanOrEqual(-0.5)
      expect(cx + vx / 2).toBeLessThanOrEqual(3072.5)
    }
    if (vy < 3072) {
      expect(cy - vy / 2).toBeGreaterThanOrEqual(-0.5)
      expect(cy + vy / 2).toBeLessThanOrEqual(3072.5)
    }
  }
  for (const t of ['a', 'w', 'd', 's']) {
    await page.keyboard.down(t)
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250)
      if (i === 2) await page.setViewportSize({ width: 700 + i * 100, height: 500 })
      if (i === 3) await page.mouse.wheel(0, 300)
      await dentro()
    }
    await page.keyboard.up(t)
  }
})
