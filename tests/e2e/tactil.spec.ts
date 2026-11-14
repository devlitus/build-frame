/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { expect, test, type CDPSession, type Page } from '@playwright/test'

/** M2-04 · Controles táctiles (móvil emulado) y clic para ir al destino (escritorio). */

const TAM = 32 // TAM_CASILLA

async function abrir(page: Page, query = '?semilla=42&debug'): Promise<void> {
  page.on('pageerror', (e) => {
    throw e
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  // La cámara se asienta sobre el personaje.
  await page.waitForTimeout(800)
}

const personaje = async (page: Page) => {
  const p = await page.evaluate(() => window.__raices?.personaje())
  if (!p) throw new Error('sin personaje')
  return p
}
const destino = (page: Page) => page.evaluate(() => window.__raices?.destino())
const joystick = (page: Page) => page.evaluate(() => window.__raices?.joystickVisible())

/** Punto de pantalla de un punto del mundo en casillas. */
async function aPantalla(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('sin cámara')
  return {
    x: (x * TAM - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: (y * TAM - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  }
}

/**
 * Busca una casilla libre a 4-9 casillas del personaje, visible en pantalla, cuyo trayecto recto
 * pase por una casilla bloqueada (hay que rodear un obstáculo o el río).
 */
async function destinoConRodeo(page: Page): Promise<{ cx: number; cy: number }> {
  const p = await personaje(page)
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('sin cámara')
  const candidato = await page.evaluate(
    ({ px, py, ancho, alto, scrollX, scrollY, zoom, tam }) => {
      const r = window.__raices
      if (!r) return undefined
      const visible = (x: number, y: number) => {
        const sx = (x * tam - (scrollX + ancho / 2)) * zoom + ancho / 2
        const sy = (y * tam - (scrollY + alto / 2)) * zoom + alto / 2
        return sx > 30 && sx < ancho - 30 && sy > 110 && sy < alto - 110
      }
      for (let radio = 4; radio <= 9; radio++) {
        for (let dy = -radio; dy <= radio; dy++) {
          for (let dx = -radio; dx <= radio; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radio) continue
            const cx = Math.floor(px) + dx
            const cy = Math.floor(py) + dy
            if (r.bloqueada(cx, cy) || !visible(cx + 0.5, cy + 0.5)) continue
            let cruza = false
            for (let t = 0.1; t < 0.95 && !cruza; t += 0.05) {
              cruza = r.bloqueada(
                Math.floor(px + (cx + 0.5 - px) * t),
                Math.floor(py + (cy + 0.5 - py) * t),
              )
            }
            if (cruza) return { cx, cy }
          }
        }
      }
      return undefined
    },
    { px: p.x, py: p.y, ...c, tam: TAM },
  )
  if (!candidato) throw new Error('sin destino con rodeo en la vista')
  return candidato
}

/** Sigue al personaje hasta que llegue (destino cancelado) y comprueba que nunca pisa lo bloqueado. */
async function esperarLlegada(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const p = await personaje(page)
        const bloqueada = await page.evaluate(
          ([x, y]) => window.__raices?.bloqueada(Math.floor(x!), Math.floor(y!)),
          [p.x, p.y],
        )
        expect(bloqueada).toBe(false)
        return destino(page)
      },
      { timeout: 15_000, intervals: [100] },
    )
    .toBeUndefined()
}

test.describe('escritorio: clic para ir al destino', () => {
  test.skip(({ isMobile }) => isMobile, 'solo escritorio')

  test('un clic en el suelo lleva al personaje rodeando los obstáculos', async ({ page }) => {
    await abrir(page)
    const { cx, cy } = await destinoConRodeo(page)
    const pt = await aPantalla(page, cx + 0.5, cy + 0.5)
    await page.mouse.click(pt.x, pt.y)
    await expect.poll(() => destino(page)).toBeDefined()
    await esperarLlegada(page)
    const p = await personaje(page)
    expect(Math.hypot(p.x - (cx + 0.5), p.y - (cy + 0.5))).toBeLessThan(0.1)
  })

  test('arrastrar con el ratón no mueve al personaje (no hay joystick)', async ({ page }) => {
    await abrir(page)
    const p0 = await personaje(page)
    await page.mouse.move(600, 400)
    await page.mouse.down()
    await page.mouse.move(700, 400, { steps: 6 })
    expect(await joystick(page)).toBe(false)
    await page.mouse.up()
    await page.waitForTimeout(300)
    const p1 = await personaje(page)
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(0.01)
  })

  test('una tecla de movimiento cancela el destino', async ({ page }) => {
    await abrir(page)
    const { cx, cy } = await destinoConRodeo(page)
    const pt = await aPantalla(page, cx + 0.5, cy + 0.5)
    await page.mouse.click(pt.x, pt.y)
    await expect.poll(() => destino(page)).toBeDefined()
    await page.keyboard.down('d')
    await page.waitForTimeout(150)
    await page.keyboard.up('d')
    expect(await destino(page)).toBeUndefined()
  })

  test('en el Modo Plano el clic no fija destino ni mueve al personaje', async ({ page }) => {
    await abrir(page, '?semilla=42&debug&modo=plano')
    const p0 = await personaje(page)
    await page.mouse.click(300, 300)
    await page.waitForTimeout(300)
    expect(await destino(page)).toBeUndefined()
    const p1 = await personaje(page)
    expect(p1).toEqual(p0)
  })
})

test.describe('móvil: joystick y tocar el destino', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')

  let cdp: CDPSession

  const tocar = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', puntos: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: puntos.map(([x, y], id) => ({ x, y, id })),
    })

  test.beforeEach(async ({ page }) => {
    await abrir(page)
    cdp = await page.context().newCDPSession(page)
  })

  test('tocar un punto lleva al personaje hasta allí rodeando obstáculos', async ({ page }) => {
    const { cx, cy } = await destinoConRodeo(page)
    const pt = await aPantalla(page, cx + 0.5, cy + 0.5)
    await tocar('touchStart', [[pt.x, pt.y]])
    await tocar('touchEnd', [])
    await expect.poll(() => destino(page)).toBeDefined()
    const d = await destino(page)
    expect(d).toEqual({ x: cx + 0.5, y: cy + 0.5 })
    await esperarLlegada(page)
    const p = await personaje(page)
    expect(Math.hypot(p.x - (cx + 0.5), p.y - (cy + 0.5))).toBeLessThan(0.1)
  })

  test('arrastrar muestra el joystick, mueve al personaje y al soltar se para', async ({
    page,
  }) => {
    // La aparición puede tener un obstáculo al lado: se prueba cada dirección hasta que alguna ande.
    let movido = false
    for (const [vx, vy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const p0 = await personaje(page)
      const x0 = 206
      const y0 = 500
      await tocar('touchStart', [[x0, y0]])
      await tocar('touchMove', [[x0 + 14 * vx, y0 + 14 * vy]])
      await tocar('touchMove', [[x0 + 50 * vx, y0 + 50 * vy]])
      await page.waitForTimeout(100)
      expect(await joystick(page)).toBe(true)
      await page.waitForTimeout(700)
      const p1 = await personaje(page)
      await tocar('touchEnd', [])
      expect(await joystick(page)).toBe(false)
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.8) continue
      movido = true
      // Al soltar, se para.
      await page.waitForTimeout(200)
      const p2 = await personaje(page)
      await page.waitForTimeout(300)
      const p3 = await personaje(page)
      expect(Math.hypot(p3.x - p2.x, p3.y - p2.y)).toBeLessThan(0.01)
      break
    }
    expect(movido).toBe(true)
  })

  test('el joystick cancela el destino y ambos conviven', async ({ page }) => {
    const { cx, cy } = await destinoConRodeo(page)
    const pt = await aPantalla(page, cx + 0.5, cy + 0.5)
    await tocar('touchStart', [[pt.x, pt.y]])
    await tocar('touchEnd', [])
    await expect.poll(() => destino(page)).toBeDefined()
    // Un arrastre posterior toma el control...
    await tocar('touchStart', [[206, 600]])
    await tocar('touchMove', [[206, 620]])
    await tocar('touchMove', [[206, 660]])
    await page.waitForTimeout(200)
    expect(await destino(page)).toBeUndefined()
    await tocar('touchEnd', [])
    // ...y tras soltar, un nuevo toque vuelve a fijar destino.
    const p = await personaje(page)
    const otro = await aPantalla(page, p.x + 2, p.y)
    await tocar('touchStart', [[otro.x, otro.y]])
    await tocar('touchEnd', [])
    await expect.poll(() => destino(page)).toBeDefined()
  })

  test('dos dedos cancelan el joystick y no fijan destino', async ({ page }) => {
    await tocar('touchStart', [[206, 500]])
    await tocar('touchMove', [[206, 540]])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(true)
    await tocar('touchStart', [
      [206, 540],
      [300, 400],
    ])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(false)
    await tocar('touchEnd', [])
    await page.waitForTimeout(100)
    expect(await destino(page)).toBeUndefined()
  })

  test('en el Modo Plano el toque no mueve al personaje ni fija destino', async ({ page }) => {
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'plano' }))
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
    const p0 = await personaje(page)
    await tocar('touchStart', [[300, 400]])
    await tocar('touchEnd', [])
    await page.waitForTimeout(300)
    expect(await destino(page)).toBeUndefined()
    expect(await personaje(page)).toEqual(p0)
  })

  test(
    'capturas con el joystick visible (vertical y horizontal)',
    { tag: '@capturas' },
    async ({ page }) => {
      for (const [nombre, ancho, alto] of [
        ['vertical', 412, 915],
        ['horizontal', 915, 412],
      ] as const) {
        await page.setViewportSize({ width: ancho, height: alto })
        await page.waitForTimeout(600)
        const x = Math.round(ancho / 2)
        const y = Math.round(alto * 0.7)
        await tocar('touchStart', [[x, y]])
        await tocar('touchMove', [[x + 15, y]])
        await tocar('touchMove', [[x + 40, y - 20]])
        await page.waitForTimeout(150)
        expect(await joystick(page)).toBe(true)
        await page.screenshot({ path: `capturas/tactil-${nombre}.png` })
        await tocar('touchEnd', [])
      }
    },
  )

  test('un toque cancelado por el sistema no fija destino', async ({ page }) => {
    const { cx, cy } = await destinoConRodeo(page)
    const pt = await aPantalla(page, cx + 0.5, cy + 0.5)
    await tocar('touchStart', [[pt.x, pt.y]])
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await page.waitForTimeout(300)
    expect(await destino(page)).toBeUndefined()
  })

  test('el joystick visible mide al menos 44 px', async ({ page }) => {
    await tocar('touchStart', [[206, 500]])
    await tocar('touchMove', [[206, 540]])
    await page.waitForTimeout(100)
    const caja = await page.locator('.joystick-mando').boundingBox()
    const base = await page.locator('.joystick-base').boundingBox()
    expect(caja?.width).toBeGreaterThanOrEqual(44)
    expect(base?.width).toBeGreaterThanOrEqual(44)
    await tocar('touchEnd', [])
  })
})
