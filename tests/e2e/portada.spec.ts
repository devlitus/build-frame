import { expect, test } from '@playwright/test'

test('la portada muestra el título y el lienzo del juego', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Raíces' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva partida' })).toBeVisible()
  await expect(page.locator('#juego canvas')).toBeVisible()
  expect(errores).toEqual([])
})

test('el manifiesto PWA es accesible', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const res = await request.get(new URL(href ?? '', page.url()).toString())
  expect(res.ok()).toBe(true)
  const manifiesto = await res.json()
  expect(manifiesto.name).toBe('Raíces')
})
