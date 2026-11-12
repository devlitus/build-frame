import { expect, test, type Page } from '@playwright/test'

/**
 * M3-03 · Rompedor. Ataques al picking, al panel y a la cámara guiada.
 */

async function abrir(page: Page, query = '?semilla=42&debug&modo=plano'): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  await page.waitForTimeout(300)
  return errores
}

interface Caja {
  x: number
  y: number
  w: number
  h: number
}

/** Rectángulo en pantalla de la parcela `i`, según la cámara y el tamaño del mundo. */
async function rectParcela(page: Page, i: number): Promise<Caja> {
  return page.evaluate((n) => {
    const c = window.__raices?.camara()
    const mundo = window.__raices?.mundoPx()
    if (!c || !mundo) throw new Error('sin cámara')
    const lado = mundo / 6
    const cx = c.scrollX + c.ancho / 2
    const cy = c.scrollY + c.alto / 2
    return {
      x: ((n % 6) * lado - cx) * c.zoom + c.ancho / 2,
      y: (Math.floor(n / 6) * lado - cy) * c.zoom + c.alto / 2,
      w: lado * c.zoom,
      h: lado * c.zoom,
    }
  }, i)
}

async function cajas(page: Page, sel: string): Promise<Caja[]> {
  return page.evaluate((s) => {
    return [...document.querySelectorAll(s)].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
  }, sel)
}

const area = (a: Caja) => Math.max(0, a.w) * Math.max(0, a.h)
function inter(a: Caja, b: Caja): Caja {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y }
}

/** Espera a que la cámara deje de moverse. */
async function reposo(page: Page): Promise<void> {
  let previa = ''
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(150)
    const c = JSON.stringify(await page.evaluate(() => window.__raices?.camara()))
    if (c === previa) return
    previa = c
  }
}

/** Fracción de la parcela que se ve de verdad: dentro de la pantalla y sin panel ni HUD encima. */
async function fraccionVisible(page: Page, i: number): Promise<number> {
  const vp = page.viewportSize() ?? { width: 0, height: 0 }
  const r = await rectParcela(page, i)
  const pantalla = inter(r, { x: 0, y: 0, w: vp.width, h: vp.height })
  if (area(pantalla) <= 0) return 0
  const tapas = [
    ...(await cajas(page, '.panel-parcela')),
    ...(await cajas(page, '.hud-arriba')),
    ...(await cajas(page, '.boton-modo')),
  ]
  // Muestreo en rejilla (los tapes pueden solaparse entre sí).
  let libres = 0
  let total = 0
  const N = 24
  for (let a = 0; a < N; a++)
    for (let b = 0; b < N; b++) {
      const px = pantalla.x + ((a + 0.5) / N) * pantalla.w
      const py = pantalla.y + ((b + 0.5) / N) * pantalla.h
      total++
      const tapado = tapas.some((t) => px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h)
      if (!tapado) libres++
    }
  return (libres / total) * (area(pantalla) / area(r))
}

test('cada parcela seleccionada queda al menos medio visible, sin panel ni HUD encima', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await abrir(page)
  const malas: string[] = []
  for (let i = 0; i < 36; i++) {
    await page.evaluate((n) => window.__raices?.seleccionar(n), i)
    await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBe(i)
    await reposo(page)
    const f = await fraccionVisible(page, i)
    if (f < 0.5) malas.push(`${i}: ${(f * 100).toFixed(0)}%`)
  }
  expect(malas, `parcelas casi tapadas: ${malas.join(', ')}`).toEqual([])
})

test('el panel se actualiza al comprar otra parcela (sube el precio) y al comprar la propia («Tuya»)', async ({
  page,
}) => {
  await abrir(page, '?semilla=42&debug&modo=plano&seleccion=20')
  const caja = page.getByRole('region', { name: /^Parcela / })
  await expect(caja).toBeVisible()
  const antes = await page.evaluate(() => window.__raices?.parcelaInfo(20))
  // 14 y 20 son vecinas verticales; se compra una parcela del borde de la zona inicial.
  const comprable = await page.evaluate(() => {
    for (let i = 0; i < 36; i++)
      if (i !== 20 && window.__raices?.parcelaInfo(i)?.comprable) return i
    return undefined
  })
  expect(comprable).toBeDefined()
  await page.evaluate(
    (i) => window.__raices?.emitir({ tipo: 'ComprarParcela', indice: i }),
    comprable,
  )
  const despues = await page.evaluate(() => window.__raices?.parcelaInfo(20))
  expect(despues?.precio).not.toBe(antes?.precio)
  await expect(caja).toContainText(String(despues?.precio))
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'ComprarParcela', indice: 20 }))
  const ahora = await page.evaluate(() => window.__raices?.parcelaInfo(20))
  if (ahora?.estado === 'propia') await expect(caja).toContainText('Tuya')
})

test('Esc con el foco en un botón del HUD deselecciona', async ({ page }) => {
  await abrir(page)
  await page.evaluate(() => window.__raices?.seleccionar(14))
  await page.locator('.hud button').first().focus()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
})

test('rotar con el panel abierto deja la parcela visible', async ({ page }) => {
  await abrir(page)
  await page.evaluate(() => window.__raices?.seleccionar(14))
  await reposo(page)
  const vp = page.viewportSize() ?? { width: 900, height: 400 }
  await page.setViewportSize({ width: vp.height, height: vp.width })
  await page.waitForTimeout(500)
  await reposo(page)
  expect(
    await fraccionVisible(page, 14),
    `tras rotar a ${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
  ).toBeGreaterThanOrEqual(0.5)
  await page.setViewportSize(vp)
  await page.waitForTimeout(500)
  await reposo(page)
  expect(
    await fraccionVisible(page, 14),
    `tras rotar a ${page.viewportSize()?.width}x${page.viewportSize()?.height}`,
  ).toBeGreaterThanOrEqual(0.5)
})

test('con ?propias=14,15 la parcela 15 figura como propia y el panel dice «Tuya»', async ({
  page,
}) => {
  await abrir(page, '?semilla=42&debug&modo=plano&propias=14,15&seleccion=15')
  const info = await page.evaluate(() => window.__raices?.parcelaInfo(15))
  expect(info?.estado).toBe('propia')
  const caja = page.getByRole('region', { name: /^Parcela / })
  await expect(caja).toContainText('Tuya')
  await expect(caja).not.toContainText('Se puede comprar')
})

/** Gestos táctiles reales por CDP (solo en el proyecto móvil). */
async function tactil(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const enviar = (type: 'touchStart' | 'touchEnd', pts: { x: number; y: number; id: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    })
  return enviar
}

test.describe('táctil', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')

  test('un toque largo (500 ms) quieto no selecciona', async ({ page }) => {
    await abrir(page)
    const p = await page.evaluate(() => window.__raices?.puntoClicParcela(14))
    if (!p) throw new Error('sin punto')
    const enviar = await tactil(page)
    await enviar('touchStart', [{ ...p, id: 1 }])
    await page.waitForTimeout(500)
    await enviar('touchEnd', [])
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
  })

  test('un pellizco que termina levantando un dedo y luego el otro no selecciona', async ({
    page,
  }) => {
    await abrir(page)
    const p = await page.evaluate(() => window.__raices?.puntoClicParcela(14))
    if (!p) throw new Error('sin punto')
    const enviar = await tactil(page)
    const a = { x: p.x, y: p.y, id: 1 }
    const b = { x: p.x + 30, y: p.y + 30, id: 2 }
    await enviar('touchStart', [a])
    await enviar('touchStart', [a, b])
    await page.waitForTimeout(50)
    await enviar('touchEnd', [a])
    await page.waitForTimeout(50)
    await enviar('touchEnd', [])
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
  })

  test('tras un pellizco el siguiente toque corto sí selecciona', async ({ page }) => {
    await abrir(page)
    const p = await page.evaluate(() => window.__raices?.puntoClicParcela(14))
    if (!p) throw new Error('sin punto')
    const enviar = await tactil(page)
    const a = { x: p.x, y: p.y, id: 1 }
    const b = { x: p.x + 30, y: p.y + 30, id: 2 }
    await enviar('touchStart', [a])
    await enviar('touchStart', [a, b])
    await enviar('touchEnd', [b])
    await enviar('touchEnd', [])
    await page.waitForTimeout(200)
    const q = await page.evaluate(() => window.__raices?.puntoClicParcela(14))
    if (!q) throw new Error('sin punto')
    await page.touchscreen.tap(q.x, q.y)
    await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBe(14)
  })
})

test('reabrir el valle varias veces no deja gráficos, objetos ni selección colgados', async ({
  page,
}) => {
  const errores = await abrir(page)
  const base = await page.evaluate(() => ({
    o: window.__raices?.objetosValle(),
    g: window.__raices?.graficosValle().length,
  }))
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => window.__raices?.seleccionar(14))
    await page.evaluate(() => window.__raices?.reiniciarValle())
    await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
    await page.waitForTimeout(250)
  }
  const fin = await page.evaluate(() => ({
    o: window.__raices?.objetosValle(),
    g: window.__raices?.graficosValle().length,
  }))
  expect(fin).toEqual(base)
  // Un clic en una parcela tras reabrir selecciona una vez y Esc la suelta.
  await page.evaluate(() => window.__raices?.seleccionar(14))
  await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBe(14)
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
  expect(errores).toEqual([])
})
