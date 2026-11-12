import { expect, test, type Locator, type Page } from '@playwright/test'

/** M2-06 · HUD de hora y fecha, controles de tiempo, ciclo día/noche y aviso de desmayo. */

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

const reloj = (page: Page) => page.evaluate(() => window.__raices?.reloj())
const personaje = (page: Page) => page.evaluate(() => window.__raices?.personaje())
const luz = (page: Page) => page.evaluate(() => window.__raices?.luz())
const pausa = (page: Page) => page.getByRole('button', { name: 'Pausa', exact: true })
const velocidad = (page: Page, v: number) => page.getByRole('button', { name: `Velocidad x${v}` })
const modo = (page: Page) => page.getByRole('button', { name: /Modo de juego/ })

async function minutosTotales(page: Page): Promise<number> {
  const r = await reloj(page)
  if (!r) throw new Error('sin reloj')
  return (r.dia - 1) * 1200 + r.minutoDelDia
}

/** Minutos de juego avanzados en `ms` reales. */
async function avance(page: Page, ms: number): Promise<number> {
  const antes = await minutosTotales(page)
  await page.waitForTimeout(ms)
  return (await minutosTotales(page)) - antes
}

test('el HUD muestra la hora, el día y la estación al empezar', async ({ page }) => {
  const errores = await abrir(page)
  await expect(page.getByRole('timer', { name: 'Hora del juego' })).toHaveText('06:00')
  await expect(page.getByText('Día 1 de Primavera')).toBeVisible()
  await expect(page.getByText(/Año/)).toHaveCount(0)
  expect(errores).toEqual([])
})

test('la hora de la madrugada se ve como 02:00 y no 26:00', async ({ page }) => {
  await abrir(page, '?semilla=42&debug&hora=02:00')
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Pausar' }))
  await expect(page.getByRole('timer')).toHaveText('02:00')
})

test('aceptación M2: pasa un día completo, con desmayo a las 02:00 y fecha nueva', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const errores = await abrir(page, '?semilla=42&debug&acelerar=300')
  const inicio = await personaje(page)
  expect(await reloj(page)).toMatchObject({ dia: 1 })
  const aviso = page.getByRole('status')
  await expect(aviso).toHaveText(/Te quedaste dormido/, { timeout: 30_000 })
  expect(await reloj(page)).toMatchObject({ dia: 2 })
  await expect(page.getByText('Día 2 de Primavera')).toBeVisible()
  expect(await personaje(page)).toMatchObject({ x: inicio?.x, y: inicio?.y })
  // El aviso no bloquea el juego y desaparece solo (con el reloj parado no vuelve a saltar).
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Pausar' }))
  await expect(aviso).not.toHaveText(/Te quedaste dormido/, { timeout: 10_000 })
  expect(errores).toEqual([])
})

test('al despertar el reloj marca las 06:00 del día siguiente', async ({ page }) => {
  await abrir(page, '?semilla=42&debug&hora=01:59')
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 5 }))
  expect(await reloj(page)).toMatchObject({ dia: 2, minutoDelDia: 360 })
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Pausar' }))
  await expect(page.getByRole('timer')).toHaveText('06:00')
  await expect(page.getByRole('status')).toHaveText(/Te quedaste dormido/)
})

test('la pausa detiene el reloj y reanudar lo devuelve', async ({ page }) => {
  await abrir(page, '?semilla=42&debug&acelerar=100')
  expect(await avance(page, 800)).toBeGreaterThan(0)
  await pausa(page).click()
  await expect(pausa(page)).toHaveAttribute('aria-pressed', 'true')
  expect((await reloj(page))?.pausado).toBe(true)
  expect(await avance(page, 600)).toBe(0)
  await pausa(page).click()
  await expect(pausa(page)).toHaveAttribute('aria-pressed', 'false')
  expect(await avance(page, 800)).toBeGreaterThan(0)
})

test('la tecla P alterna la pausa y se ignora con modificadores', async ({ page }) => {
  await abrir(page)
  await page.keyboard.press('p')
  expect((await reloj(page))?.pausado).toBe(true)
  await page.keyboard.press('Control+p')
  expect((await reloj(page))?.pausado).toBe(true)
  await page.keyboard.press('p')
  expect((await reloj(page))?.pausado).toBe(false)
})

test('x2 y x3 aceleran el reloj', async ({ page }) => {
  await abrir(page, '?semilla=42&debug&acelerar=20')
  await expect(velocidad(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(500) // calentamiento: los primeros fotogramas van más lentos
  const x1 = await avance(page, 2000)
  await velocidad(page, 2).click()
  await expect(velocidad(page, 2)).toHaveAttribute('aria-pressed', 'true')
  expect((await reloj(page))?.velocidad).toBe(2)
  const x2 = await avance(page, 2000)
  await velocidad(page, 3).click()
  expect((await reloj(page))?.velocidad).toBe(3)
  const x3 = await avance(page, 2000)
  // La proporción exacta se prueba en unitario (tests/unit/acumulador-velocidad.test.ts).
  expect(x1).toBeGreaterThan(0)
  expect(x2).toBeGreaterThan(x1)
  expect(x3).toBeGreaterThan(x2)
})

test('tras pulsar con el puntero el foco vuelve al lienzo', async ({ page }) => {
  await abrir(page)
  await velocidad(page, 2).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('juego')
})

test('en el Modo Plano se indica que el tiempo está detenido sin tocar la pausa', async ({
  page,
}) => {
  await abrir(page, '?semilla=42&debug&modo=plano&acelerar=100')
  await expect(page.getByText('En pausa (Plano)')).toBeVisible()
  expect((await reloj(page))?.pausado).toBe(false)
  expect(await avance(page, 600)).toBe(0)
  await modo(page).click()
  await expect(page.getByText('En pausa (Plano)')).toHaveCount(0)
  expect(await avance(page, 800)).toBeGreaterThan(0)
})

test('el tinte del valle cambia con la hora: sin tinte de día, oscuro de noche', async ({
  page,
}) => {
  await abrir(page, '?semilla=42&debug&hora=12:00')
  expect((await luz(page))?.alfa).toBe(0)
  await page.goto('./?semilla=42&debug&hora=22:00')
  await expect.poll(async () => (await luz(page))?.alfa).toBeGreaterThan(0.5)
  await page.goto('./?semilla=42&debug&hora=19:00')
  await expect.poll(async () => (await luz(page))?.alfa).toBeGreaterThan(0.1)
  expect((await luz(page))?.alfa).toBeLessThan(0.4)
})

for (const vista of [
  { nombre: '412x915', width: 412, height: 915 },
  { nombre: '915x412', width: 915, height: 412 },
  { nombre: '1280x720', width: 1280, height: 720 },
]) {
  test(`botones de tiempo de al menos 44 px y sin solapes en ${vista.nombre}`, async ({ page }) => {
    await page.setViewportSize({ width: vista.width, height: vista.height })
    await abrir(page, '?semilla=42&modo=plano')
    const caja = async (l: Locator) => {
      const c = await l.boundingBox()
      if (!c) throw new Error('sin caja')
      return c
    }
    const todas: { x: number; y: number; width: number; height: number }[] = []
    for (const b of [pausa(page), velocidad(page, 1), velocidad(page, 2), velocidad(page, 3)]) {
      const c = await caja(b)
      expect(c.width).toBeGreaterThanOrEqual(44)
      expect(c.height).toBeGreaterThanOrEqual(44)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(vista.width)
      todas.push(c)
    }
    todas.push(
      await caja(page.locator('.reloj')),
      await caja(modo(page)),
      await caja(page.getByText('En pausa (Plano)')),
    )
    for (let i = 0; i < todas.length; i++) {
      for (let j = i + 1; j < todas.length; j++) {
        const a = todas[i]
        const b = todas[j]
        if (!a || !b) continue
        const solapa =
          a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        expect(solapa, `cajas ${i} y ${j} solapadas`).toBe(false)
      }
    }
  })
}

test('un segundo desmayo con el aviso visible lo reanuncia (se vacía y vuelve a salir)', async ({
  page,
}) => {
  await abrir(page, '?semilla=42&debug&hora=01:59')
  const aviso = page.getByRole('status')
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 5 }))
  await expect(aviso).toHaveText(/Te quedaste dormido/)
  await page.evaluate(() => {
    const zona = document.querySelector('.aviso-zona')
    ;(window as unknown as { __cambios: number }).__cambios = 0
    if (zona)
      new MutationObserver(() => {
        ;(window as unknown as { __cambios: number }).__cambios++
      }).observe(zona, { childList: true, subtree: true })
    // 06:00 + 1201 min supera las 02:00 (1560): con 1200 se llegaba justo a 1560, que no es
    // desmayo, y el test dependía de que el bucle avanzara un minuto más antes del límite.
    window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 1201 })
  })
  await expect(aviso).toHaveText(/Te quedaste dormido/)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __cambios: number }).__cambios))
    .toBeGreaterThanOrEqual(2)
})
