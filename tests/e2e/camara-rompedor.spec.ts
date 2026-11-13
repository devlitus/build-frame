/** Rompedor · M1-03 Cámara. Cada test que falle documenta un defecto (ver informe). */
import { expect, test, type CDPSession, type Page } from '@playwright/test'

interface Camara {
  zoom: number
  scrollX: number
  scrollY: number
  ancho: number
  alto: number
}

async function abrir(page: Page): Promise<void> {
  await page.goto('./?semilla=42&modo=plano')
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
}

async function camara(page: Page): Promise<Camara> {
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('Sin cámara')
  return c
}

/** Los campos numéricos esperados existen y son finitos (`guiando` y otros no numéricos se ignoran). */
function finitosNumericos(c: Camara): void {
  for (const k of ['zoom', 'scrollX', 'scrollY', 'ancho', 'alto'] as const) {
    expect(typeof c[k], k).toBe('number')
  }
  for (const v of Object.values(c)) {
    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
  }
}

const centro = (c: Camara) => ({ x: c.scrollX + c.ancho / 2, y: c.scrollY + c.alto / 2 })

function dentro(c: Camara): void {
  const visX = c.ancho / c.zoom
  const visY = c.alto / c.zoom
  const m = centro(c)
  if (visX < 3072) {
    expect(m.x - visX / 2).toBeGreaterThanOrEqual(-0.5)
    expect(m.x + visX / 2).toBeLessThanOrEqual(3072.5)
  }
  if (visY < 3072) {
    expect(m.y - visY / 2).toBeGreaterThanOrEqual(-0.5)
    expect(m.y + visY / 2).toBeLessThanOrEqual(3072.5)
  }
}

test.describe('ratón', () => {
  test.skip(({ isMobile }) => isMobile, 'solo escritorio')

  test.beforeEach(async ({ page }) => {
    await abrir(page)
  })

  test('clic derecho o central arrastrando no debería desplazar la cámara', async ({ page }) => {
    const antes = await camara(page)
    for (const boton of ['right', 'middle'] as const) {
      await page.mouse.move(600, 400)
      await page.mouse.down({ button: boton })
      await page.mouse.move(400, 300, { steps: 4 })
      await page.mouse.up({ button: boton })
    }
    const despues = await camara(page)
    expect(despues.scrollX).toBeCloseTo(antes.scrollX, 3)
    expect(despues.scrollY).toBeCloseTo(antes.scrollY, 3)
  })

  test('rueda con deltaMode de líneas (Firefox): una muesca debe notarse (>5 %)', async ({
    page,
  }) => {
    await page.mouse.move(640, 360)
    const antes = await camara(page)
    await page.evaluate(() => {
      const lienzo = document.querySelector('canvas') as HTMLCanvasElement
      lienzo.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -3,
          deltaMode: 1,
          clientX: 640,
          clientY: 360,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    await page.waitForTimeout(100)
    const c1 = await camara(page)
    expect(c1.zoom / antes.zoom).toBeGreaterThan(1.05)
  })

  test('rueda con deltaY enorme, 0 y negativo deja la cámara finita y en rango', async ({
    page,
  }) => {
    await page.mouse.move(640, 360)
    for (const dy of [0, 1e9, -1e9, 1e300, -1e300, 0.0001]) {
      await page.evaluate((d) => {
        ;(document.querySelector('canvas') as HTMLCanvasElement).dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: d,
            clientX: 640,
            clientY: 360,
            bubbles: true,
            cancelable: true,
          }),
        )
      }, dy)
      const c = await camara(page)
      finitosNumericos(c)
      expect(c.zoom).toBeLessThanOrEqual(2.5 + 1e-9)
      expect(c.zoom).toBeGreaterThanOrEqual(720 / 3072 - 1e-9)
      dentro(c)
    }
  })

  test('la página no se desplaza ni hace zoom nativo (ctrl+rueda, teclas)', async ({ page }) => {
    await page.mouse.move(640, 360)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -300)
    await page.keyboard.up('Control')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('Space')
    const r = await page.evaluate(() => ({
      sx: window.scrollX,
      sy: window.scrollY,
      vv: window.visualViewport?.scale,
      resto: document.documentElement.scrollHeight - innerHeight,
    }))
    expect(r.sx).toBe(0)
    expect(r.sy).toBe(0)
    expect(r.vv).toBe(1)
    expect(r.resto).toBeLessThanOrEqual(0)
  })

  test('soltar el ratón fuera de la ventana y volver no deja un arrastre fantasma', async ({
    page,
  }) => {
    await page.mouse.move(600, 400)
    await page.mouse.down()
    await page.mouse.move(700, 400, { steps: 3 })
    await page.mouse.move(2000, 400, { steps: 3 })
    await page.mouse.up()
    const tras = await camara(page)
    await page.mouse.move(300, 300, { steps: 4 })
    await page.mouse.move(900, 500, { steps: 4 })
    const final = await camara(page)
    expect(final.scrollX).toBeCloseTo(tras.scrollX, 3)
    expect(final.scrollY).toBeCloseTo(tras.scrollY, 3)
  })

  test('redimensionar con zoom máximo y desplazado mantiene límites y el centro', async ({
    page,
  }) => {
    await page.mouse.move(1000, 150)
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -500)
    await expect.poll(async () => (await camara(page)).zoom).toBeCloseTo(2.5, 5)
    const ca = centro(await camara(page))
    await page.setViewportSize({ width: 900, height: 500 })
    await expect.poll(async () => (await camara(page)).ancho).toBe(900)
    const d = await camara(page)
    dentro(d)
    const cd = centro(d)
    expect(Math.abs(cd.x - ca.x)).toBeLessThan(2)
    expect(Math.abs(cd.y - ca.y)).toBeLessThan(2)
  })

  test('ventana diminuta (menor que una casilla) no produce NaN', async ({ page }) => {
    for (const [w, h] of [
      [20, 20],
      [1, 1],
      [300, 5],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(150)
      await page.mouse.move(Math.min(5, w - 1), Math.min(2, h - 1))
      await page.mouse.wheel(0, -300)
      await page.mouse.wheel(0, 300)
      const c = await camara(page)
      finitosNumericos(c)
      expect(c.zoom).toBeGreaterThan(0)
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.waitForTimeout(200)
    const c = await camara(page)
    expect(c.zoom).toBeGreaterThan(0)
    expect(Number.isFinite(c.scrollX)).toBe(true)
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

  async function acercar(): Promise<void> {
    await tocar('touchStart', [
      [150, 450],
      [260, 450],
    ])
    for (let i = 1; i <= 20; i++)
      await tocar('touchMove', [
        [150 - 5 * i, 450],
        [260 + 5 * i, 450],
      ])
    await tocar('touchEnd', [])
  }

  test('el zoom inicial en móvil vertical es legible (>= 0,6)', async ({ page }) => {
    expect((await camara(page)).zoom).toBeGreaterThanOrEqual(0.6)
  })

  test('dedos superpuestos (distancia 0) no hunden el zoom al mínimo', async ({ page }) => {
    await acercar()
    const antes = await camara(page)
    await tocar('touchStart', [
      [150, 450],
      [250, 450],
    ])
    await tocar('touchMove', [
      [200, 450],
      [200, 450],
    ])
    await tocar('touchMove', [
      [200, 450],
      [210, 450],
    ])
    await tocar('touchEnd', [])
    const despues = await camara(page)
    expect(despues.zoom).toBeGreaterThan(antes.zoom * 0.5)
  })

  test('levantar un dedo a mitad del pellizco y seguir arrastrando no salta', async ({ page }) => {
    await acercar()
    await tocar('touchStart', [
      [150, 450],
      [250, 450],
    ])
    await tocar('touchMove', [
      [140, 450],
      [260, 450],
    ])
    const antes = await camara(page)
    await tocar('touchEnd', [[260, 450]])
    const tras = await camara(page)
    expect(Math.abs(tras.scrollX - antes.scrollX)).toBeLessThan(0.5)
    expect(Math.abs(tras.zoom - antes.zoom)).toBeLessThan(1e-9)
    await tocar('touchMove', [[255, 450]])
    const mov = await camara(page)
    expect(Math.abs(mov.scrollX - tras.scrollX)).toBeLessThan(5 / tras.zoom + 1)
    await tocar('touchEnd', [])
  })

  test('tres dedos no producen NaN ni saltos de zoom', async ({ page }) => {
    await acercar()
    const antes = await camara(page)
    await tocar('touchStart', [
      [100, 400],
      [200, 400],
      [300, 400],
    ])
    await tocar('touchMove', [
      [100, 400],
      [200, 400],
      [350, 450],
    ])
    await tocar('touchEnd', [])
    const c = await camara(page)
    finitosNumericos(c)
    expect(Math.abs(c.zoom - antes.zoom)).toBeLessThan(antes.zoom * 0.2)
  })

  test('girar el móvil con zoom máximo y desplazado queda dentro de límites', async ({ page }) => {
    await acercar()
    await page.setViewportSize({ width: 915, height: 412 })
    await expect.poll(async () => (await camara(page)).ancho).toBe(915)
    dentro(await camara(page))
  })

  test('arrastrar con un dedo no desplaza la página', async ({ page }) => {
    await tocar('touchStart', [[200, 600]])
    for (let i = 1; i <= 10; i++) await tocar('touchMove', [[200, 600 - 40 * i]])
    await tocar('touchEnd', [])
    const r = await page.evaluate(() => ({ y: window.scrollY, s: window.visualViewport?.scale }))
    expect(r.y).toBe(0)
    expect(r.s).toBe(1)
  })
})
