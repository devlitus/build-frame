import { expect, test, type Page } from '@playwright/test'

/**
 * M5-02 · Energía y dormir. Escritorio (teclas) y móvil emulado (botones). La energía y el reloj
 * se leen con los ganchos `energia()` y `reloj()`; el agotamiento se provoca con `emitir` (solo
 * con `?debug`) y se comprueba con el botón de acción y el aviso.
 */

async function abrirValle(page: Page, query = '?semilla=42&debug'): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  return errores
}

/** Todas las parcelas del valle propias (solo con `debug`). */
const PROPIAS = `?semilla=42&debug&propias=${Array.from({ length: 36 }, (_, i) => i).join(',')}`

const energia = (page: Page) => page.evaluate(() => window.__raices?.energia())
const reloj = (page: Page) => page.evaluate(() => window.__raices?.reloj())
const medidor = (page: Page) => page.getByRole('meter', { name: 'Energía' })
const botonDormir = (page: Page) => page.getByRole('button', { name: 'Dormir', exact: true })

/** Usa la herramienta 4 puntos de energía por golpe (hacha) sobre la casilla de enfrente, `n` veces. */
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

test('la barra de energía es un medidor accesible con su valor y máximo', async ({ page }) => {
  const errores = await abrirValle(page)
  await expect(medidor(page)).toBeVisible()
  await expect(medidor(page)).toHaveAttribute('aria-valuenow', '100')
  await expect(medidor(page)).toHaveAttribute('aria-valuemin', '0')
  await expect(medidor(page)).toHaveAttribute('aria-valuemax', '100')
  await expect(medidor(page)).toHaveAttribute('aria-valuetext', '100 de 100')
  await expect(medidor(page)).toContainText('100')
  expect(errores).toEqual([])
})

test('usar la azada gasta 2 y el medidor lo refleja; la mano no gasta', async ({ page }) => {
  await abrirValle(page, PROPIAS)
  // M5-03: la azada solo ara en parcela propia con zona de cultivo, y una casilla ya arada se
  // rechaza: se aran tres casillas libres distintas.
  const casillas = await page.evaluate(() => {
    const r = window.__raices
    const p = r?.personaje()
    if (!r || !p) return []
    const cx = Math.floor(p.x)
    const cy = Math.floor(p.y)
    const libres: { x: number; y: number }[] = []
    for (let dy = -1; dy <= 1 && libres.length < 3; dy++)
      for (let dx = -1; dx <= 1 && libres.length < 3; dx++)
        if (!r.bloqueada(cx + dx, cy + dy)) libres.push({ x: cx + dx, y: cy + dy })
    for (const c of libres) {
      r.emitir({ tipo: 'PintarZona', x0: c.x, y0: c.y, x1: c.x, y1: c.y, zona: 'cultivo' })
    }
    r.emitir({ tipo: 'ElegirHerramienta', herramienta: 'azada' })
    for (const c of libres) r.emitir({ tipo: 'UsarHerramienta', x: c.x, y: c.y })
    return libres
  })
  expect(casillas).toHaveLength(3)
  await expect.poll(() => energia(page)).toBe(94)
  await expect(medidor(page)).toHaveAttribute('aria-valuenow', '94')
  await expect(medidor(page)).toHaveAttribute('aria-valuetext', '94 de 100')
  await gastar(page, 'mano', 5)
  expect(await energia(page)).toBe(94)
})

test('sin energía: el botón de acción avisa «Estás agotado» y moverse sigue valiendo', async ({
  page,
}) => {
  await abrirValle(page)
  await gastar(page, 'hacha', 25)
  await expect.poll(() => energia(page)).toBe(0)
  await page.getByRole('button', { name: 'Usar hacha' }).click()
  await expect(page.locator('.aviso')).toHaveText('Estás agotado')
  expect((await page.evaluate(() => window.__raices?.ultimoUso()))?.error).toBe('sin-energia')
  expect(await energia(page)).toBe(0)
  // Cambiar de modo no se bloquea.
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
})

test('el botón Dormir junto a la aparición pasa de día con la energía al máximo', async ({
  page,
}) => {
  const errores = await abrirValle(page)
  await gastar(page, 'hacha', 10)
  await expect.poll(() => energia(page)).toBe(60)
  const antes = await reloj(page)
  await expect(botonDormir(page)).toBeVisible()
  await botonDormir(page).click()
  await expect.poll(() => energia(page)).toBe(100)
  const despues = await reloj(page)
  expect(despues?.dia).toBe((antes?.dia ?? 0) + 1)
  expect(despues?.minutoDelDia).toBeLessThan(380)
  await expect(page.locator('.aviso')).toContainText('Has dormido bien')
  await expect(medidor(page)).toHaveAttribute('aria-valuenow', '100')
  expect(errores).toEqual([])
})

test('la tecla Z duerme y el botón solo se ve donde se puede dormir', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'la tecla es de escritorio')
  await abrirValle(page)
  await page.locator('#juego').focus()
  await expect(botonDormir(page)).toBeVisible()
  await expect(botonDormir(page)).toHaveAttribute('aria-keyshortcuts', 'Z')
  // Se aleja de la aparición hacia el norte hasta que el botón desaparece.
  await page.keyboard.down('w')
  await expect(botonDormir(page)).toBeHidden({ timeout: 15_000 })
  await page.keyboard.up('w')
  const dia = (await reloj(page))?.dia ?? 0
  await page.keyboard.press('z')
  await expect(page.locator('.aviso')).toHaveText('Para dormir vuelve a la entrada del valle')
  expect((await reloj(page))?.dia).toBe(dia)
  // De vuelta junto a la cama, Z duerme.
  await page.keyboard.down('s')
  await expect(botonDormir(page)).toBeVisible({ timeout: 15_000 })
  await page.keyboard.up('s')
  await page.keyboard.press('z')
  await expect.poll(async () => (await reloj(page))?.dia).toBe(dia + 1)
})

test('en el Modo Plano no hay botón Dormir', async ({ page }) => {
  await abrirValle(page)
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect(botonDormir(page)).toBeHidden()
})
