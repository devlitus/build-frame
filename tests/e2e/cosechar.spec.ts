import { expect, test, type Page } from '@playwright/test'

/**
 * M5-05 · Ciclo completo de la granja (aceptación del hito M5): arar, plantar, regar, dormir
 * varios días y cosechar con el botón contextual. Vale en escritorio y en móvil emulado.
 * No lleva @humo: lo cubre `npm run e2e` en local.
 */

const QUERY = `?semilla=42&debug&propias=${Array.from({ length: 36 }, (_, i) => i).join(',')}`
/** Días hasta madurar el rábano (data/cultivos.json: [1, 1, 2]). */
const DIAS_RABANO = 4

async function abrir(page: Page): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${QUERY}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.waitForTimeout(600)
  return errores
}

const emitir = (page: Page, c: { tipo: string; [k: string]: unknown }) =>
  page.evaluate((x) => window.__raices?.emitir(x), c)
const herramienta = (page: Page, h: string) => page.locator(`[data-herramienta="${h}"]`).click()
const accion = (page: Page) => page.locator('.boton-accion')
const rabanos = (page: Page) =>
  page.evaluate(
    () => window.__raices?.inventario()?.ranuras.find((r) => r.objeto === 'rabano')?.cantidad ?? 0,
  )
const usos = async (page: Page) => (await page.evaluate(() => window.__raices?.ultimoUso()?.n)) ?? 0

/** Pulsa el botón de acción y espera a que el uso quede registrado (sin error). */
async function usar(page: Page): Promise<void> {
  const antes = await usos(page)
  await accion(page).click()
  await expect.poll(() => usos(page)).toBe(antes + 1)
  expect(await page.evaluate(() => window.__raices?.ultimoUso()?.error)).toBeUndefined()
}

/**
 * Lleva al personaje, andando, a una casilla libre cercana con su casilla del sur también libre,
 * de modo que mire al sur hacia ella (los obstáculos de la semilla 42 no caen donde queremos
 * arar). Devuelve la casilla de enfrente.
 */
async function colocarseFrenteACasillaLibre(page: Page): Promise<{ x: number; y: number }> {
  const inicio = await page.evaluate(() => window.__raices?.personaje())
  if (!inicio) throw new Error('sin personaje')
  const sx = Math.floor(inicio.x)
  const sy = Math.floor(inicio.y)
  // Un tramo recto (horizontal y luego vertical) libre hasta la casilla de pie.
  const meta = await page.evaluate(
    ({ sx, sy }) => {
      const r = window.__raices
      if (!r) return undefined
      const libre = (x: number, y: number) => !r.bloqueada(x, y)
      for (let d = 0; d <= 4; d++) {
        for (let dy = -d; dy <= d; dy++) {
          for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue
            const x = sx + dx
            const y = sy + dy
            let ok = libre(x, y) && libre(x, y + 1)
            for (let i = 0; i <= Math.abs(dx) && ok; i++) ok = libre(sx + Math.sign(dx) * i, sy)
            for (let j = 0; j <= Math.abs(dy) && ok; j++) ok = libre(x, sy + Math.sign(dy) * j)
            if (ok) return { x, y }
          }
        }
      }
      return undefined
    },
    { sx, sy },
  )
  if (!meta) throw new Error('sin casilla libre cerca')
  await irA(page, meta)
  return { x: meta.x, y: meta.y + 1 }
}

/** Anda hasta la casilla (x, y) y queda mirando al sur (dormir devuelve al personaje a la cama). */
async function irA(page: Page, meta: { x: number; y: number }): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const p = await page.evaluate(() => window.__raices?.personaje())
    if (!p) throw new Error('sin personaje')
    const fx = Math.floor(p.x)
    const fy = Math.floor(p.y)
    if (fx === meta.x && fy === meta.y) break
    const dx = fx === meta.x ? 0 : Math.sign(meta.x + 0.5 - p.x)
    const dy = fx === meta.x ? Math.sign(meta.y + 0.5 - p.y) : 0
    await emitir(page, { tipo: 'MoverPersonaje', dx, dy, ms: 60 })
  }
  // Un último paso mínimo al sur para quedar mirando hacia la casilla de enfrente.
  await emitir(page, { tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 1 })
  const f = await page.evaluate(() => window.__raices?.personaje())
  expect(f?.orientacion).toBe('sur')
  expect(Math.floor(f?.x ?? -1)).toBe(meta.x)
  expect(Math.floor(f?.y ?? -1)).toBe(meta.y)
}

test('arar, plantar, regar, dormir varios días y cosechar con el botón contextual', async ({
  page,
}) => {
  const errores = await abrir(page)
  const { x, y } = await colocarseFrenteACasillaLibre(page)
  const dePie = { x, y: y - 1 }
  await emitir(page, { tipo: 'PintarZona', x0: x, y0: y, x1: x, y1: y, zona: 'cultivo' })
  expect(await page.evaluate((c) => window.__raices?.zonaDe(c.x, c.y), { x, y })).toBe('cultivo')

  await herramienta(page, 'azada')
  await usar(page)
  await herramienta(page, 'semillas')
  await emitir(page, { tipo: 'ElegirSemilla', objeto: 'semilla-rabano' })
  await usar(page)

  // Con la mano, aún sin madurar, el botón no cambia ni avisa.
  await herramienta(page, 'mano')
  await expect(accion(page)).not.toHaveText('Cosechar')

  for (let d = 0; d < DIAS_RABANO; d++) {
    await herramienta(page, 'regadera')
    await usar(page)
    await page.getByRole('button', { name: 'Dormir', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__raices?.reloj()?.dia)).toBe(d + 2)
    await irA(page, dePie)
  }

  await irA(page, dePie)
  await herramienta(page, 'mano')
  await expect(accion(page)).toHaveText('Cosechar')
  expect(await rabanos(page)).toBe(0)
  await usar(page)
  expect(await rabanos(page)).toBe(1)
  await expect(page.getByRole('status')).toContainText('Cosechado: 1 × Rábano')
  await expect(accion(page)).not.toHaveText('Cosechar')
  expect(errores).toEqual([])
})
