import { expect, test, type CDPSession, type Page } from '@playwright/test'

interface Camara {
  zoom: number
  scrollX: number
  scrollY: number
  ancho: number
  alto: number
}

async function abrir(page: Page): Promise<void> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto('./?semilla=42&modo=plano')
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
}

async function camara(page: Page): Promise<Camara> {
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('Sin cámara')
  return c
}

/** Punto del mundo bajo un punto de pantalla (la cámara de Phaser hace zoom sobre el centro). */
function mundoBajo(c: Camara, x: number, y: number): { x: number; y: number } {
  return {
    x: c.scrollX + c.ancho / 2 + (x - c.ancho / 2) / c.zoom,
    y: c.scrollY + c.alto / 2 + (y - c.alto / 2) / c.zoom,
  }
}

/** La vista completa está dentro del valle (o centrada si el valle cabe en ese eje). */
async function dentroDelValle(page: Page, c: Camara): Promise<void> {
  const mundo = (await page.evaluate(() => window.__raices?.mundoPx())) ?? 0
  const visibleX = c.ancho / c.zoom
  const visibleY = c.alto / c.zoom
  const izq = c.scrollX + c.ancho / 2 - visibleX / 2
  const arriba = c.scrollY + c.alto / 2 - visibleY / 2
  if (visibleX < mundo) {
    expect(izq).toBeGreaterThanOrEqual(-0.5)
    expect(izq + visibleX).toBeLessThanOrEqual(mundo + 0.5)
  } else expect(izq + visibleX / 2).toBeCloseTo(mundo / 2, 0)
  if (visibleY < mundo) {
    expect(arriba).toBeGreaterThanOrEqual(-0.5)
    expect(arriba + visibleY).toBeLessThanOrEqual(mundo + 0.5)
  } else expect(arriba + visibleY / 2).toBeCloseTo(mundo / 2, 0)
}

test.describe('ratón', () => {
  test.skip(({ isMobile }) => isMobile, 'solo escritorio')

  test.beforeEach(async ({ page }) => {
    await abrir(page)
  })

  test('arrastrar desplaza la cámara en sentido contrario', async ({ page }) => {
    const antes = await camara(page)
    await page.mouse.move(600, 400)
    await page.mouse.down()
    await page.mouse.move(500, 350, { steps: 5 })
    await page.mouse.up()
    const despues = await camara(page)
    expect(despues.zoom).toBeCloseTo(antes.zoom, 6)
    // Arrastre de (-100, -50) px de pantalla → la cámara se mueve (+100, +50) / zoom.
    expect(despues.scrollX - antes.scrollX).toBeCloseTo(100 / antes.zoom, 0)
    expect(despues.scrollY - antes.scrollY).toBeCloseTo(50 / antes.zoom, 0)
  })

  test('la rueda acerca y aleja manteniendo el punto bajo el cursor', async ({ page }) => {
    const inicial = await camara(page)
    await page.mouse.move(900, 200)
    const mundoAntes = mundoBajo(inicial, 900, 200)
    await page.mouse.wheel(0, -300)
    await expect.poll(async () => (await camara(page)).zoom).toBeGreaterThan(inicial.zoom)
    const cerca = await camara(page)
    const m1 = mundoBajo(cerca, 900, 200)
    expect(Math.abs(m1.x - mundoAntes.x) * cerca.zoom).toBeLessThan(3)
    expect(Math.abs(m1.y - mundoAntes.y) * cerca.zoom).toBeLessThan(3)

    await page.mouse.wheel(0, 200)
    await expect.poll(async () => (await camara(page)).zoom).toBeLessThan(cerca.zoom)
    const lejos = await camara(page)
    const m2 = mundoBajo(lejos, 900, 200)
    expect(Math.abs(m2.x - mundoAntes.x) * lejos.zoom).toBeLessThan(3)
    expect(Math.abs(m2.y - mundoAntes.y) * lejos.zoom).toBeLessThan(3)
  })

  test('el zoom tiene mínimo y máximo', async ({ page }) => {
    await page.mouse.move(640, 360)
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -3000)
    await expect.poll(async () => (await camara(page)).zoom).toBeCloseTo(2.5, 5)
    await page.waitForTimeout(100)
    expect((await camara(page)).zoom).toBeLessThanOrEqual(2.5 + 1e-9)
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 3000)
    await expect.poll(async () => (await camara(page)).zoom).toBeCloseTo(720 / 3072, 4)
    const c = await camara(page)
    // Mínimo: el valle entero cabe (ancho 1280, alto 720 → 720 / 3072).
    expect(c.zoom).toBeCloseTo(720 / 3072, 4)
    await dentroDelValle(page, c)
  })

  test('arrastrar mucho no saca la cámara del valle', async ({ page }) => {
    for (const [dx, dy] of [
      [1200, 700],
      [-1200, -700],
    ] as const) {
      for (let i = 0; i < 4; i++) {
        await page.mouse.move(640 - dx / 2, 360 - dy / 2)
        await page.mouse.down()
        await page.mouse.move(640 + dx / 2, 360 + dy / 2, { steps: 4 })
        await page.mouse.up()
      }
      await dentroDelValle(page, await camara(page))
    }
  })
})

test.describe('táctil', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')

  let cdp: CDPSession

  test.beforeEach(async ({ page }) => {
    await abrir(page)
    cdp = await page.context().newCDPSession(page)
  })

  const tocar = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', puntos: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: puntos.map(([x, y], id) => ({ x, y, id })),
    })

  test('un dedo arrastra la cámara en sentido contrario', async ({ page }) => {
    const antes = await camara(page)
    await tocar('touchStart', [[200, 500]])
    for (let i = 1; i <= 5; i++) await tocar('touchMove', [[200 - 20 * i, 500 - 10 * i]])
    await tocar('touchEnd', [])
    const despues = await camara(page)
    expect(despues.zoom).toBeCloseTo(antes.zoom, 6)
    expect(despues.scrollX - antes.scrollX).toBeCloseTo(100 / antes.zoom, 0)
    expect(despues.scrollY - antes.scrollY).toBeCloseTo(50 / antes.zoom, 0)
  })

  test('pellizcar acerca y mantiene el punto medio de los dedos', async ({ page }) => {
    const antes = await camara(page)
    const medio = { x: 206, y: 450 }
    const mundoAntes = mundoBajo(antes, medio.x, medio.y)
    await tocar('touchStart', [
      [medio.x - 40, medio.y],
      [medio.x + 40, medio.y],
    ])
    for (let i = 1; i <= 6; i++) {
      await tocar('touchMove', [
        [medio.x - 40 - 10 * i, medio.y],
        [medio.x + 40 + 10 * i, medio.y],
      ])
    }
    await tocar('touchEnd', [])
    const despues = await camara(page)
    expect(despues.zoom).toBeGreaterThan(antes.zoom * 1.5)
    expect(despues.zoom).toBeLessThanOrEqual(2.5 + 1e-9)
    const m = mundoBajo(despues, medio.x, medio.y)
    expect(Math.abs(m.x - mundoAntes.x) * despues.zoom).toBeLessThan(3)
    expect(Math.abs(m.y - mundoAntes.y) * despues.zoom).toBeLessThan(3)
  })

  test('juntar los dedos aleja y el zoom no baja del mínimo', async ({ page }) => {
    const antes = await camara(page)
    for (let ronda = 0; ronda < 4; ronda++) {
      await tocar('touchStart', [
        [20, 450],
        [392, 450],
      ])
      for (let i = 1; i <= 6; i++) {
        await tocar('touchMove', [
          [20 + 30 * i, 450],
          [392 - 30 * i, 450],
        ])
      }
      await tocar('touchEnd', [])
    }
    const c = await camara(page)
    expect(c.zoom).toBeLessThan(antes.zoom)
    expect(c.zoom).toBeCloseTo(c.ancho / 3072, 4)
    await dentroDelValle(page, c)
  })

  test('pasar de uno a dos dedos no da saltos', async ({ page }) => {
    await tocar('touchStart', [[200, 500]])
    await tocar('touchMove', [[190, 500]])
    const antes = await camara(page)
    await tocar('touchStart', [
      [190, 500],
      [300, 500],
    ])
    const tras = await camara(page)
    expect(tras.zoom).toBeCloseTo(antes.zoom, 6)
    expect(tras.scrollX).toBeCloseTo(antes.scrollX, 3)
    expect(tras.scrollY).toBeCloseTo(antes.scrollY, 3)
    await tocar('touchMove', [
      [189, 500],
      [301, 500],
    ])
    const mov = await camara(page)
    expect(Math.abs(mov.zoom / tras.zoom - 1)).toBeLessThan(0.05)
    expect(Math.abs(mov.scrollX - tras.scrollX) * tras.zoom).toBeLessThan(5)
    expect(Math.abs(mov.scrollY - tras.scrollY) * tras.zoom).toBeLessThan(5)
    await tocar('touchEnd', [])
  })
})
