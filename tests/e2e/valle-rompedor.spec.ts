import { expect, test, type Page } from '@playwright/test'

const escena = (p: Page) => p.evaluate(() => window.__raices?.escenaActiva())
const espiar = (p: Page) => {
  const errores: string[] = []
  p.on('pageerror', (e) => errores.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
  return errores
}

test('doble clic / doble toque en «Nueva partida»: una escena activa y sin errores', async ({
  page,
  isMobile,
}) => {
  const errores = espiar(page)
  await page.goto('./')
  await expect.poll(() => escena(page)).toBe('portada')
  const b = page.getByRole('button', { name: 'Nueva partida' })
  if (isMobile) {
    await b.dispatchEvent('click')
    await b.dispatchEvent('click', undefined, { timeout: 500 }).catch(() => {})
  } else {
    await b.dblclick()
  }
  await expect.poll(() => escena(page)).toBe('valle')
  expect(await page.evaluate(() => window.__raices?.mundoPx())).toBeGreaterThan(0)
  expect(errores).toEqual([])
})

test('dos «Nueva partida» en cargas distintas dan semillas distintas', async ({ browser }) => {
  const sem: (number | undefined)[] = []
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL ?? '' })
    const page = await ctx.newPage()
    await page.goto('./')
    await page.getByRole('button', { name: 'Nueva partida' }).click()
    await expect.poll(() => escena(page)).toBe('valle')
    sem.push(await page.evaluate(() => window.__raices?.semilla()))
    await ctx.close()
  }
  expect(sem[0]).not.toBe(sem[1])
})

for (const q of [
  '?semilla=abc',
  '?semilla=',
  '?semilla=-3',
  '?semilla=1.5',
  '?semilla=99999999999999999999',
  '?debug&propias=1',
]) {
  test(`URL rara ${q}: portada, sin errores`, async ({ page }) => {
    const errores = espiar(page)
    await page.goto('./' + q)
    await expect.poll(() => escena(page)).toBe('portada')
    expect(errores).toEqual([])
  })
}

for (const q of [
  '?semilla=0',
  '?semilla=4294967295',
  '?semilla=1&semilla=2',
  '?semilla=5&debug&propias=0,99,x,-1,5,5',
]) {
  test(`URL ${q}: abre el valle sin errores`, async ({ page }) => {
    const errores = espiar(page)
    await page.goto('./' + q)
    await expect.poll(() => escena(page)).toBe('valle')
    expect(errores).toEqual([])
  })
}

test('girar y redimensionar en el valle no rompe nada', async ({ page }) => {
  const errores = espiar(page)
  await page.goto('./?semilla=42')
  await expect.poll(() => escena(page)).toBe('valle')
  const tamanos = [
    { width: 412, height: 915 },
    { width: 915, height: 412 },
    { width: 100, height: 100 },
    { width: 1, height: 1 },
    { width: 1280, height: 720 },
  ]
  for (const t of tamanos) {
    await page.setViewportSize(t)
    await page.waitForTimeout(100)
  }
  expect(await escena(page)).toBe('valle')
  expect(errores).toEqual([])
})

test('portada: botón «Nueva partida» de al menos 44 px', async ({ page }) => {
  await page.goto('./')
  const box = await page.getByRole('button', { name: 'Nueva partida' }).boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(box?.width).toBeGreaterThanOrEqual(44)
})
