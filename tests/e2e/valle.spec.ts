import { expect, test } from '@playwright/test'

const escena = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__raices?.escenaActiva())

test('«Nueva partida» lleva al valle con una semilla nueva', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto('./')
  await expect.poll(() => escena(page)).toBe('portada')
  await page.getByRole('button', { name: 'Nueva partida' }).click()
  await expect.poll(() => escena(page)).toBe('valle')
  await expect(page.getByRole('heading', { name: 'Raíces' })).toBeHidden()
  const semilla = await page.evaluate(() => window.__raices?.semilla())
  expect(typeof semilla).toBe('number')
  expect(await page.evaluate(() => window.__raices?.mundoPx())).toBeGreaterThan(0)
  expect(errores).toEqual([])
})

test('con ?semilla=N se abre el valle directamente, sin portada', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto('./?semilla=42&debug&propias=0,1,6')
  await expect.poll(() => escena(page)).toBe('valle')
  await expect(page.getByRole('button', { name: 'Nueva partida' })).toBeHidden()
  expect(await page.evaluate(() => window.__raices?.semilla())).toBe(42)
  expect(await page.evaluate(() => window.__raices?.mundoPx())).toBe(3072)
  expect(errores).toEqual([])
})
