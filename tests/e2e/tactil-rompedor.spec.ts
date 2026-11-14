/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { expect, test, type CDPSession, type Page } from '@playwright/test'

/** M2-04 · Rompedor: gestos táctiles y de ratón, estados cruzados y accesibilidad. */

const TAM = 32 // TAM_CASILLA

async function abrir(page: Page, query = '?semilla=42&debug'): Promise<void> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.waitForTimeout(800)
  ;(page as unknown as { __errores: string[] }).__errores = errores
}
const errores = (page: Page) => (page as unknown as { __errores: string[] }).__errores

const personaje = async (page: Page) => {
  const p = await page.evaluate(() => window.__raices?.personaje())
  if (!p) throw new Error('sin personaje')
  return p
}
const destino = (page: Page) => page.evaluate(() => window.__raices?.destino())
const joystick = (page: Page) => page.evaluate(() => window.__raices?.joystickVisible())
const modo = (page: Page) => page.evaluate(() => window.__raices?.modo())
const emitir = (page: Page, comando: { tipo: string; [k: string]: unknown }) =>
  page.evaluate((c) => window.__raices?.emitir(c), comando)

async function aPantalla(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('sin cámara')
  return {
    x: (x * TAM - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: (y * TAM - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  }
}

/** Punto de pantalla a `dx` casillas al este del personaje. */
async function junto(page: Page, dx = 2, dy = 0): Promise<{ x: number; y: number }> {
  const p = await personaje(page)
  return aPantalla(page, p.x + dx, p.y + dy)
}

/** Destino a casilla (no continuo) elegido por el A*: indica a qué casilla se fue. */
const casilla = (d: { x: number; y: number }) => ({ cx: Math.floor(d.x), cy: Math.floor(d.y) })

test.describe('escritorio: ratón', () => {
  test.skip(({ isMobile }) => isMobile, 'solo escritorio')

  test('el clic derecho no fija destino', async ({ page }) => {
    await abrir(page)
    const pt = await junto(page)
    await page.mouse.click(pt.x, pt.y, { button: 'right' })
    await page.waitForTimeout(150)
    expect(
      await destino(page),
      'el clic derecho abre el menú contextual, no es una orden',
    ).toBeUndefined()
  })

  test('el clic central no fija destino', async ({ page }) => {
    await abrir(page)
    const pt = await junto(page)
    await page.mouse.click(pt.x, pt.y, { button: 'middle' })
    await page.waitForTimeout(150)
    expect(await destino(page), 'el clic central (autoscroll) no es una orden').toBeUndefined()
  })

  test('un clic mantenido más de 300 ms sin mover también fija destino (clic = destino)', async ({
    page,
  }) => {
    await abrir(page)
    const pt = await junto(page)
    await page.mouse.move(pt.x, pt.y)
    await page.mouse.down()
    await page.waitForTimeout(450)
    await page.mouse.up()
    await expect.poll(() => destino(page), { timeout: 1500 }).toBeDefined()
  })

  test('arrastrar con el ratón en Vida no mueve la cámara ni al personaje', async ({ page }) => {
    await abrir(page)
    const c0 = await page.evaluate(() => window.__raices?.camara())
    await page.mouse.move(500, 300)
    await page.mouse.down()
    await page.mouse.move(800, 500, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const c1 = await page.evaluate(() => window.__raices?.camara())
    expect(Math.abs(c1!.scrollX - c0!.scrollX)).toBeLessThan(1)
    expect(Math.abs(c1!.scrollY - c0!.scrollY)).toBeLessThan(1)
    expect(await destino(page)).toBeUndefined()
  })

  test('clic sobre el botón de modo no deja un destino pendiente al volver a Vida', async ({
    page,
  }) => {
    await abrir(page)
    await page.getByRole('button', { name: /modo/i }).click()
    expect(await modo(page)).toBe('plano')
    await page.getByRole('button', { name: /modo/i }).click()
    expect(await modo(page)).toBe('vida')
    await page.waitForTimeout(200)
    expect(await destino(page)).toBeUndefined()
  })

  test('clic en el agua (casilla bloqueada) va a la casilla libre más cercana', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42&debug&en=vado')
    const agua = await page.evaluate(
      ({ tam }) => {
        const r = window.__raices!
        const c = r.camara()!
        const p = r.personaje()!
        // Desde la distancia de Chebyshev 2: desde M5-01 un clic en la casilla del personaje o en
        // una de sus 8 vecinas usa la herramienta en lugar de caminar.
        for (let radio = 2; radio < 12; radio++) {
          for (let dy = -radio; dy <= radio; dy++) {
            for (let dx = -radio; dx <= radio; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue
              const cx = Math.floor(p.x) + dx
              const cy = Math.floor(p.y) + dy
              if (!r.bloqueada(cx, cy)) continue
              const sx = ((cx + 0.5) * tam - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2
              const sy = ((cy + 0.5) * tam - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2
              if (sx > 20 && sx < c.ancho - 20 && sy > 20 && sy < c.alto - 20)
                return { cx, cy, sx, sy }
            }
          }
        }
        return undefined
      },
      { tam: TAM },
    )
    test.skip(!agua, 'sin casilla bloqueada a la vista')
    await page.mouse.click(agua!.sx, agua!.sy)
    await expect.poll(() => destino(page)).toBeDefined()
    const d = (await destino(page))!
    const { cx, cy } = casilla(d)
    expect(await page.evaluate(([x, y]) => window.__raices?.bloqueada(x!, y!), [cx, cy])).toBe(
      false,
    )
    expect(Math.hypot(cx - agua!.cx, cy - agua!.cy)).toBeLessThanOrEqual(2.5)
  })

  test('clic fuera del valle lleva a una casilla dentro del valle', async ({ page }) => {
    await abrir(page)
    const lado = (await page.evaluate(() => window.__raices?.vados()))!.lado
    const candidatos: [number, number][] = [
      [-3, lado / 2],
      [lado + 3, lado / 2],
      [lado / 2, -3],
      [lado / 2, lado + 3],
    ]
    const vp = page.viewportSize()!
    let usado = false
    for (const [x, y] of candidatos) {
      const pt = await aPantalla(page, x, y)
      if (pt.x < 10 || pt.x > vp.width - 10 || pt.y < 10 || pt.y > vp.height - 10) continue
      usado = true
      await page.mouse.click(pt.x, pt.y)
      await page.waitForTimeout(200)
      const d = await destino(page)
      if (d) {
        expect(d.x).toBeGreaterThan(0)
        expect(d.x).toBeLessThan(lado)
        expect(d.y).toBeGreaterThan(0)
        expect(d.y).toBeLessThan(lado)
      }
      break
    }
    test.skip(!usado, 'el borde del valle no queda a la vista')
  })

  test('clic en la propia casilla: llega y se cancela sin quedarse oscilando', async ({ page }) => {
    await abrir(page)
    const p = await personaje(page)
    const pt = await aPantalla(page, p.x, p.y)
    await page.mouse.click(pt.x, pt.y)
    await expect.poll(() => destino(page), { timeout: 4000 }).toBeUndefined()
    const q = await personaje(page)
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(0.8)
  })

  test('pausar con destino lo cancela y un clic en pausa no deja destino al reanudar', async ({
    page,
  }) => {
    await abrir(page)
    const pt = await junto(page, 5)
    await page.mouse.click(pt.x, pt.y)
    await expect.poll(() => destino(page)).toBeDefined()
    await emitir(page, { tipo: 'Pausar' })
    await page.waitForTimeout(200)
    expect(await destino(page)).toBeUndefined()
    await page.mouse.click(pt.x, pt.y)
    await page.waitForTimeout(200)
    await emitir(page, { tipo: 'Reanudar' })
    await page.waitForTimeout(300)
    expect(
      await destino(page),
      'un clic hecho en pausa no debe reaparecer al reanudar',
    ).toBeUndefined()
  })

  // Latente (S3): la ruta solo se cancela con el desmayo que ve `update()`; un desmayo emitido por
  // otra vía (p. ej. un futuro «dormir» de la UI) deja al seguidor con la ruta vieja y el personaje
  // reaparecido lejos. Se espera que acabe cancelada por el detector de atasco o por llegar.
  test('desmayo emitido fuera del bucle: la ruta vieja no se sigue desde la aparición', async ({
    page,
  }) => {
    await abrir(page)
    const pt = await junto(page, 6)
    await page.mouse.click(pt.x, pt.y)
    await expect.poll(() => destino(page)).toBeDefined()
    await emitir(page, { tipo: 'AvanzarTiempo', minutos: 1439 })
    await page.waitForTimeout(400)
    expect(await destino(page)).toBeUndefined()
    expect(errores(page)).toEqual([])
  })

  test('cambiar a Plano y volver a Vida a mitad de ruta no retoma el destino', async ({ page }) => {
    await abrir(page)
    const pt = await junto(page, 6)
    await page.mouse.click(pt.x, pt.y)
    await expect.poll(() => destino(page)).toBeDefined()
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await page.waitForTimeout(150)
    await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
    await page.waitForTimeout(300)
    expect(await destino(page)).toBeUndefined()
  })
})

test.describe('móvil: gestos', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')
  let cdp: CDPSession

  const tocar = (
    tipo: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    puntos: [number, number][],
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: puntos.map(([x, y], i) => ({ x, y, id: i })),
    })

  test.beforeEach(async ({ page }) => {
    await abrir(page)
    cdp = await page.context().newCDPSession(page)
  })

  async function hayDestinoTrasToque(page: Page): Promise<boolean> {
    const pt = await junto(page, 3)
    await tocar('touchStart', [[pt.x, pt.y]])
    await tocar('touchEnd', [])
    await page.waitForTimeout(150)
    return (await destino(page)) !== undefined
  }

  test('umbral de distancia: 10 px es toque, 11 px es joystick', async ({ page }) => {
    const p3 = await junto(page, 3)
    const pt = { x: Math.round(p3.x), y: Math.round(p3.y) }
    await tocar('touchStart', [[pt.x, pt.y]])
    await tocar('touchMove', [[pt.x + 10, pt.y]])
    await page.waitForTimeout(80)
    expect(await joystick(page)).toBe(false)
    await tocar('touchEnd', [])
    await expect.poll(() => destino(page)).toBeDefined()
    await emitir(page, { tipo: 'Pausar' })
    await emitir(page, { tipo: 'Reanudar' })
    await tocar('touchStart', [[pt.x, pt.y]])
    await tocar('touchMove', [[pt.x + 11, pt.y]])
    await page.waitForTimeout(80)
    expect(await joystick(page)).toBe(true)
    await tocar('touchEnd', [])
  })

  test('umbral de tiempo: 600 ms quieto no es un toque; 150 ms sí', async ({ page }) => {
    const pt = await junto(page, 3)
    await tocar('touchStart', [[pt.x, pt.y]])
    await page.waitForTimeout(600)
    await tocar('touchEnd', [])
    await page.waitForTimeout(150)
    expect(await destino(page)).toBeUndefined()
    await tocar('touchStart', [[pt.x, pt.y]])
    await page.waitForTimeout(150)
    await tocar('touchEnd', [])
    await expect.poll(() => destino(page)).toBeDefined()
  })

  test('toque sobre el botón de modo: cambia de modo y no fija destino', async ({ page }) => {
    const caja = (await page.getByRole('button', { name: /modo/i }).boundingBox())!
    const x = caja.x + caja.width / 2
    const y = caja.y + caja.height / 2
    await tocar('touchStart', [[x, y]])
    await tocar('touchEnd', [])
    await page.waitForTimeout(200)
    expect(await modo(page)).toBe('plano')
    await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
    await page.waitForTimeout(200)
    expect(await destino(page)).toBeUndefined()
  })

  test('arrastre que empieza en el botón no crea joystick ni mueve al personaje', async ({
    page,
  }) => {
    const caja = (await page.getByRole('button', { name: /modo/i }).boundingBox())!
    const x = caja.x + caja.width / 2
    const y = caja.y + caja.height / 2
    const p0 = await personaje(page)
    await tocar('touchStart', [[x, y]])
    await tocar('touchMove', [[x - 30, y - 20]])
    await tocar('touchMove', [[x - 80, y - 60]])
    await page.waitForTimeout(400)
    expect(await joystick(page)).toBe(false)
    await tocar('touchEnd', [])
    const p1 = await personaje(page)
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeLessThan(0.05)
    expect(await modo(page)).toBe('vida')
  })

  test('touchcancel con el joystick activo lo quita y el personaje se para', async ({ page }) => {
    await tocar('touchStart', [[206, 500]])
    await tocar('touchMove', [[206, 520]])
    await tocar('touchMove', [[206, 560]])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(true)
    await tocar('touchCancel', [])
    await page.waitForTimeout(150)
    expect(await joystick(page), 'el joystick sigue en pantalla tras pointercancel').toBe(false)
    const a = await personaje(page)
    await page.waitForTimeout(400)
    const b = await personaje(page)
    expect(Math.hypot(b.x - a.x, b.y - a.y), 'sigue andando solo').toBeLessThan(0.01)
    expect(await hayDestinoTrasToque(page), 'tras cancelar, un toque debe volver a funcionar').toBe(
      true,
    )
  })

  test('pestaña oculta con el joystick activo: se suelta y no sigue andando', async ({ page }) => {
    await tocar('touchStart', [[206, 500]])
    await tocar('touchMove', [[206, 520]])
    await tocar('touchMove', [[206, 560]])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(true)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(200)
    expect(await joystick(page)).toBe(false)
    const a = await personaje(page)
    await page.waitForTimeout(300)
    const b = await personaje(page)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.01)
  })

  test('levantar el primer dedo dejando el segundo no deja el gesto atascado', async ({ page }) => {
    await tocar('touchStart', [[206, 500]])
    await tocar('touchMove', [[206, 540]])
    await page.waitForTimeout(80)
    expect(await joystick(page)).toBe(true)
    await tocar('touchStart', [
      [206, 540],
      [300, 400],
    ])
    await page.waitForTimeout(80)
    expect(await joystick(page)).toBe(false)
    // Se levanta el primero; el segundo sigue apoyado y se mueve.
    await tocar('touchEnd', [[300, 400]])
    await tocar('touchMove', [[300, 460]])
    await tocar('touchMove', [[300, 520]])
    await page.waitForTimeout(150)
    expect(await joystick(page), 'el dedo que queda no debe convertirse en joystick').toBe(false)
    expect(await destino(page)).toBeUndefined()
    await tocar('touchEnd', [])
    await page.waitForTimeout(100)
    expect(await hayDestinoTrasToque(page), 'un toque posterior debe volver a funcionar').toBe(true)
  })

  test('tres dedos: sin errores, sin joystick y sin destino; luego todo vuelve a funcionar', async ({
    page,
  }) => {
    await tocar('touchStart', [[100, 500]])
    await tocar('touchStart', [
      [100, 500],
      [200, 500],
    ])
    await tocar('touchStart', [
      [100, 500],
      [200, 500],
      [300, 500],
    ])
    await tocar('touchMove', [
      [100, 560],
      [200, 560],
      [300, 560],
    ])
    await page.waitForTimeout(150)
    expect(await joystick(page)).toBe(false)
    await tocar('touchEnd', [])
    await page.waitForTimeout(150)
    expect(await destino(page)).toBeUndefined()
    expect(errores(page)).toEqual([])
    expect(await hayDestinoTrasToque(page)).toBe(true)
  })

  test('girar el móvil con el joystick activo: la base sigue dentro de la pantalla o se suelta', async ({
    page,
  }) => {
    await tocar('touchStart', [[206, 800]])
    await tocar('touchMove', [[206, 820]])
    await tocar('touchMove', [[206, 860]])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(true)
    await page.setViewportSize({ width: 915, height: 412 })
    await page.waitForTimeout(500)
    const visible = await joystick(page)
    if (visible) {
      const caja = (await page.locator('.joystick-base').boundingBox())!
      expect(
        caja.y + caja.height / 2,
        'el centro del joystick queda fuera de la pantalla',
      ).toBeLessThan(412)
    }
    await tocar('touchEnd', [])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(false)
  })

  test('el joystick cerca del borde de la pantalla no sale de ella', async ({ page }) => {
    const vp = page.viewportSize()!
    await tocar('touchStart', [[8, vp.height - 8]])
    await tocar('touchMove', [[20, vp.height - 8]])
    await tocar('touchMove', [[40, vp.height - 8]])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(true)
    const caja = (await page.locator('.joystick-base').boundingBox())!
    expect(caja.x, 'base cortada por la izquierda').toBeGreaterThanOrEqual(0)
    expect(caja.y + caja.height, 'base cortada por abajo').toBeLessThanOrEqual(vp.height)
    await tocar('touchEnd', [])
  })

  test('la base del joystick se centra donde se apoyó el dedo y el mando no pasa del radio', async ({
    page,
  }) => {
    await tocar('touchStart', [[200, 500]])
    await tocar('touchMove', [[215, 500]])
    await tocar('touchMove', [[380, 640]])
    await page.waitForTimeout(100)
    const base = (await page.locator('.joystick-base').boundingBox())!
    const mando = (await page.locator('.joystick-mando').boundingBox())!
    expect(Math.abs(base.x + base.width / 2 - 200)).toBeLessThan(2)
    expect(Math.abs(base.y + base.height / 2 - 500)).toBeLessThan(2)
    const d = Math.hypot(
      mando.x + mando.width / 2 - (base.x + base.width / 2),
      mando.y + mando.height / 2 - (base.y + base.height / 2),
    )
    expect(d).toBeLessThanOrEqual(56 + 1)
    await tocar('touchEnd', [])
  })

  test('arrastre táctil en Vida no desplaza la cámara por su cuenta (solo sigue al personaje)', async ({
    page,
  }) => {
    await tocar('touchStart', [[206, 500]])
    await tocar('touchMove', [[220, 500]])
    await tocar('touchMove', [[206 + 56, 500]])
    await page.waitForTimeout(100)
    expect(await joystick(page)).toBe(true)
    await tocar('touchEnd', [])
  })

  test(
    'el joystick no depende de hover y la marca de destino se ve (captura)',
    { tag: '@capturas' },
    async ({ page }) => {
      const pt = await junto(page, 4, 1)
      await tocar('touchStart', [[pt.x, pt.y]])
      await tocar('touchEnd', [])
      await expect.poll(() => destino(page)).toBeDefined()
      await page.waitForTimeout(150)
      await page.screenshot({ path: 'capturas/tactil-rompedor-marca.png' })
      const css = await page.evaluate(() =>
        [...document.styleSheets]
          .flatMap((h) => [...h.cssRules])
          .map((r) => r.cssText)
          .filter((t) => t.includes(':hover'))
          .join('\n'),
      )
      expect(css).not.toMatch(/joystick/)
    },
  )
})
