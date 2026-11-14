/* eslint-disable @typescript-eslint/no-non-null-assertion -- valores conocidos en tests */
import { devices, expect, test, type Page } from '@playwright/test'

/**
 * Rompedor · M5-02 Energía y dormir (interfaz). Ver docs/informes/M5-02-rompedor.md.
 * Foco y teclas (Z), inventario abierto, pausa y velocidad, HUD en 320×568, destino pendiente
 * al dormir, aviso de energía junto a otros avisos y el medidor accesible.
 */

const TAM = 32

async function abrir(page: Page, query = '?semilla=42&debug'): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.waitForTimeout(800)
  return errores
}

const reloj = (p: Page) => p.evaluate(() => window.__raices?.reloj())
const energia = (p: Page) => p.evaluate(() => window.__raices?.energia())
const emitir = (p: Page, c: { tipo: string; [k: string]: unknown }) =>
  p.evaluate((x) => window.__raices?.emitir(x), c)
const botonDormir = (p: Page) => p.getByRole('button', { name: 'Dormir', exact: true })
const medidor = (p: Page) => p.getByRole('meter', { name: 'Energía' })

async function gastar(page: Page, herramienta: string, n: number): Promise<void> {
  await page.evaluate(
    ({ h, veces }) => {
      const r = window.__raices
      const p = r?.personaje()
      if (!r || !p) return
      r.emitir({ tipo: 'ElegirHerramienta', herramienta: h })
      for (let i = 0; i < veces; i++) {
        r.emitir({ tipo: 'UsarHerramienta', x: Math.floor(p.x), y: Math.floor(p.y) })
      }
    },
    { h: herramienta, veces: n },
  )
}

/** Aleja al personaje de la cama (norte) a base de MoverPersonaje hasta que Dormir se rechaza. */
async function alejar(page: Page): Promise<void> {
  await page.evaluate(() => {
    const r = window.__raices
    if (!r) return
    for (let i = 0; i < 400; i++) r.emitir({ tipo: 'MoverPersonaje', dx: 0, dy: -1, ms: 50 })
  })
}

type R = { x: number; y: number; width: number; height: number }
const caja = async (page: Page, sel: string): Promise<R | null> =>
  page.locator(sel).first().boundingBox()
const solapa = (a: R, b: R) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test.describe('Z y el foco (escritorio)', () => {
  test.skip(({ isMobile }) => isMobile, 'tecla de escritorio')

  test('Z con el inventario abierto: si el botón se oculta, la tecla no debe dormir', async ({
    page,
  }) => {
    await abrir(page)
    await page.locator('#juego').focus()
    await page.keyboard.press('i')
    await expect(page.getByRole('region', { name: 'Inventario' })).toBeVisible()
    await expect(botonDormir(page)).toBeHidden()
    const dia = (await reloj(page))?.dia
    // El foco neutro (como tras cerrar un panel o pulsar el fondo) deja pasar las teclas.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('z')
    await page.waitForTimeout(300)
    expect((await reloj(page))?.dia, 'la tecla Z durmió con el botón oculto').toBe(dia)
  })

  test('Z con el foco en un botón del HUD (velocidad x2) no duerme ni avisa', async ({ page }) => {
    await abrir(page)
    await page.getByRole('button', { name: /Velocidad x2/i }).focus()
    const dia = (await reloj(page))?.dia
    await page.keyboard.press('z')
    await page.waitForTimeout(300)
    expect((await reloj(page))?.dia).toBe(dia)
  })

  test('Z con el foco en <body> duerme', async ({ page }) => {
    await abrir(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const dia = (await reloj(page))?.dia ?? 0
    await page.keyboard.press('z')
    await expect.poll(async () => (await reloj(page))?.dia).toBe(dia + 1)
  })

  test('Z mantenida (auto-repetición) duerme una sola vez', async ({ page }) => {
    await abrir(page)
    await page.locator('#juego').focus()
    const dia = (await reloj(page))?.dia ?? 0
    await page.keyboard.down('z')
    await page.evaluate(() => {
      const d = document.activeElement ?? document.body
      for (let i = 0; i < 8; i++) {
        d.dispatchEvent(
          new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', repeat: true, bubbles: true }),
        )
      }
    })
    await page.keyboard.up('z')
    await page.waitForTimeout(400)
    expect((await reloj(page))?.dia).toBe(dia + 1)
  })

  test('Z en el Modo Plano no hace nada ni avisa', async ({ page }) => {
    await abrir(page)
    await page.getByRole('button', { name: /Modo de juego/ }).click()
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
    await page.locator('#juego').focus()
    const dia = (await reloj(page))?.dia
    await page.keyboard.press('z')
    await page.waitForTimeout(300)
    expect((await reloj(page))?.dia).toBe(dia)
    await expect(page.locator('.aviso')).toHaveCount(0)
  })

  test('Z y E a la vez: sin energía, E avisa agotado y Z después sigue durmiendo', async ({
    page,
  }) => {
    await abrir(page)
    await gastar(page, 'hacha', 25)
    await expect.poll(() => energia(page)).toBe(0)
    await page.locator('#juego').focus()
    await page.keyboard.press('e')
    await expect(page.locator('.aviso')).toHaveText('Estás agotado')
    await page.keyboard.press('z')
    await expect.poll(() => energia(page)).toBe(100)
    await expect(page.locator('.aviso')).toContainText('Has dormido bien')
  })
})

test('dormir en pausa conserva la pausa; a velocidad x3 conserva la velocidad', async ({
  page,
}) => {
  await abrir(page)
  await emitir(page, { tipo: 'CambiarVelocidad', velocidad: 3 })
  await emitir(page, { tipo: 'Pausar' })
  const antes = await reloj(page)
  expect(antes?.pausado).toBe(true)
  await gastar(page, 'hacha', 5)
  await expect(botonDormir(page)).toBeVisible()
  await botonDormir(page).click()
  await expect.poll(async () => (await reloj(page))?.dia).toBe((antes?.dia ?? 0) + 1)
  const despues = await reloj(page)
  expect(despues).toMatchObject({ pausado: true, velocidad: 3, minutoDelDia: 360 })
  await page.waitForTimeout(500)
  expect((await reloj(page))?.minutoDelDia, 'el reloj corre en pausa').toBe(360)
  expect(await energia(page)).toBe(100)
})

test('al dormir con un destino pendiente (toque) el personaje no sigue andando hacia él', async ({
  page,
}) => {
  await abrir(page)
  const p = (await page.evaluate(() => window.__raices?.personaje()))!
  const c = (await page.evaluate(() => window.__raices?.camara()))!
  const pt = {
    x: ((p.x + 3) * TAM - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: (p.y * TAM - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  }
  await page.mouse.click(pt.x, pt.y)
  await expect.poll(() => page.evaluate(() => window.__raices?.destino())).toBeTruthy()
  await emitir(page, { tipo: 'Dormir' }) // (equivale al botón; el personaje aún está junto a la cama)
  await page.waitForTimeout(200)
  const inicio = (await page.evaluate(() => window.__raices?.personaje()))!
  await page.waitForTimeout(1500)
  const fin = (await page.evaluate(() => window.__raices?.personaje()))!
  const destino = await page.evaluate(() => window.__raices?.destino())
  expect(
    { destino: destino ?? null, movido: Math.hypot(fin.x - inicio.x, fin.y - inicio.y) > 0.5 },
    'tras dormir el personaje sigue caminando hacia el destino anterior',
  ).toEqual({ destino: null, movido: false })
})

test('aviso agotado y aviso de herramienta rechazada a la vez: queda uno legible', async ({
  page,
}) => {
  await abrir(page)
  await gastar(page, 'hacha', 25)
  await alejar(page)
  await emitir(page, { tipo: 'UsarHerramienta', x: 0, y: 0 })
  // Dos rechazos seguidos desde la interfaz: fuera de alcance / sin energía / lejos de la cama.
  await page.getByRole('button', { name: 'Usar hacha' }).click()
  await expect(page.locator('.aviso')).toHaveText('Estás agotado')
  const n = await page.locator('.aviso').count()
  expect(n).toBe(1)
})

test('el medidor de energía: valor y texto accesibles coherentes con el estado en cada gasto', async ({
  page,
}) => {
  await abrir(page)
  await gastar(page, 'hacha', 13) // 100 - 52 = 48
  await expect(medidor(page)).toHaveAttribute('aria-valuenow', '48')
  await expect(medidor(page)).toHaveAttribute('aria-valuetext', '48 de 100')
  await expect(medidor(page)).toHaveAttribute('data-baja', 'false')
  await gastar(page, 'hacha', 6) // 48 - 24 = 24 (24 %, ya es baja)
  await expect(medidor(page)).toHaveAttribute('aria-valuenow', '24')
  await expect(medidor(page)).toHaveAttribute('data-baja', 'true')
  // El valor en pantalla es el mismo que el accesible.
  await expect(medidor(page)).toContainText('24')
  await gastar(page, 'hacha', 7)
  await expect(medidor(page)).toHaveAttribute('aria-valuenow', '0')
  await expect(medidor(page)).toHaveAttribute('data-baja', 'true')
})

test('el botón Dormir al aparecer no mueve los botones de acción e inventario', async ({
  page,
}) => {
  await abrir(page)
  await alejar(page)
  await expect(botonDormir(page)).toBeHidden()
  const acc = await caja(page, '.boton-accion')
  const inv = await caja(page, '.boton-inventario')
  await emitir(page, { tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 0 })
  // Vuelve junto a la cama.
  await page.evaluate(() => {
    const r = window.__raices
    if (!r) return
    for (let i = 0; i < 400; i++) r.emitir({ tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 50 })
  })
  await expect(botonDormir(page)).toBeVisible()
  const acc2 = await caja(page, '.boton-accion')
  const inv2 = await caja(page, '.boton-inventario')
  expect({ acc: acc2, inv: inv2 }, 'los botones se desplazan al aparecer Dormir').toEqual({
    acc,
    inv,
  })
})

test.describe('HUD en 320×568 con energía, Dormir y aviso', () => {
  test.skip(({ isMobile }) => isMobile, 'viewport fijado por el propio test')
  for (const [w, h] of [
    [320, 568],
    [360, 640],
    [568, 320],
  ] as const) {
    test(`sin solapes ni cortes en ${w}x${h}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        ...devices['Pixel 7'],
        viewport: { width: w, height: h },
      })
      const page = await ctx.newPage()
      await abrir(page)
      await gastar(page, 'hacha', 25)
      await page.getByRole('button', { name: /Usar hacha/ }).click()
      await expect(page.locator('.aviso')).toHaveText('Estás agotado')
      await expect(botonDormir(page)).toBeVisible()
      const sels = [
        '.energia',
        '.reloj',
        '.aviso',
        '.boton-dormir',
        '.boton-accion',
        '.boton-inventario',
        '.boton-modo',
        '.barra-herramientas-caja',
        '.boton-pausa',
      ]
      const cajas: Record<string, R> = {}
      for (const s of sels) {
        const c = await caja(page, s)
        if (c) cajas[s] = c
      }
      const nombres = Object.keys(cajas)
      const choques: string[] = []
      for (let i = 0; i < nombres.length; i++)
        for (let j = i + 1; j < nombres.length; j++) {
          if (
            !(nombres[i] === '.energia' && nombres[j] === '.reloj') &&
            solapa(cajas[nombres[i]!]!, cajas[nombres[j]!]!)
          )
            choques.push(`${nombres[i]} x ${nombres[j]}`)
        }
      const fuera = nombres.filter((n) => {
        const c = cajas[n]!
        return c.x < -0.5 || c.y < -0.5 || c.x + c.width > w + 0.5 || c.y + c.height > h + 0.5
      })
      expect({ choques, fuera }).toEqual({ choques: [], fuera: [] })
      // Táctil: mínimo 44 px para Dormir.
      expect(cajas['.boton-dormir']!.height).toBeGreaterThanOrEqual(44)
      expect(cajas['.boton-dormir']!.width).toBeGreaterThanOrEqual(44)
      await ctx.close()
    })
  }
})
