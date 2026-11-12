import { expect, test, type Page } from '@playwright/test'

/** M2-05 · Rompedor de los modos Vida y Plano. */

async function abrir(page: Page, query = '?semilla=42&debug'): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBeDefined()
  return errores
}

const boton = (page: Page) => page.getByRole('button', { name: /Modo de juego/ })
const modo = (page: Page) => page.evaluate(() => window.__raices?.modo())
const personaje = (page: Page) => page.evaluate(() => window.__raices?.personaje())
const camara = (page: Page) => page.evaluate(() => window.__raices?.camara())
type Cam = NonNullable<Awaited<ReturnType<typeof camara>>>

/** Distancia (px del mundo) del personaje al rectángulo visible; 0 si está dentro. */
function fuera(c: Cam, p: { x: number; y: number }): number {
  const mx = c.ancho / c.zoom / 2
  const my = c.alto / c.zoom / 2
  const cx = c.scrollX + c.ancho / 2
  const cy = c.scrollY + c.alto / 2
  return Math.max(0, Math.abs(p.x * 32 - cx) - mx, Math.abs(p.y * 32 - cy) - my)
}

const enfocarLienzo = (page: Page) => page.locator('canvas').click({ position: { x: 5, y: 5 } })

test.describe('teclado y botón', () => {
  test.skip(({ isMobile }) => isMobile, 'teclado: solo escritorio')

  test('Ctrl+M, Alt+M y Meta+M no cambian de modo (son atajos del navegador o del sistema)', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42')
    await enfocarLienzo(page)
    for (const combo of ['Control+m', 'Alt+m', 'Meta+m']) {
      await page.keyboard.press(combo)
      await page.waitForTimeout(150)
      expect(await modo(page), combo).toBe('vida')
      await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    }
  })

  test('Enter sobre el botón enfocado cambia una sola vez aunque se mantenga (auto-repetición)', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42')
    await boton(page).focus()
    await page.keyboard.down('Enter')
    for (let i = 0; i < 4; i++) await page.keyboard.down('Enter') // repeat = true
    await page.keyboard.up('Enter')
    await page.waitForTimeout(200)
    expect(await modo(page)).toBe('plano')
  })

  test('Espacio y Enter sobre el botón enfocado: un cambio por pulsación', async ({ page }) => {
    await abrir(page, '?semilla=42')
    await boton(page).focus()
    await page.keyboard.press('Space')
    await expect.poll(() => modo(page)).toBe('plano')
    await page.keyboard.press('Enter')
    await expect.poll(() => modo(page)).toBe('vida')
  })

  test('M con el foco en el botón cambia una sola vez (no doble cambio)', async ({ page }) => {
    await abrir(page, '?semilla=42')
    await boton(page).focus()
    await page.keyboard.press('m')
    await page.waitForTimeout(200)
    expect(await modo(page)).toBe('plano')
  })

  test('mantener M pulsado (auto-repetición) cambia una sola vez', async ({ page }) => {
    await abrir(page, '?semilla=42')
    await enfocarLienzo(page)
    await page.keyboard.down('m')
    for (let i = 0; i < 5; i++) await page.keyboard.down('m')
    await page.keyboard.up('m')
    await page.waitForTimeout(200)
    expect(await modo(page)).toBe('plano')
  })

  test('tecla de movimiento mantenida al cambiar a Plano y soltada allí: al volver a Vida no anda sola', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42')
    await enfocarLienzo(page)
    for (const t of ['d', 's', 'a', 'w']) {
      await page.keyboard.down(t)
      await page.keyboard.press('m')
      await expect.poll(() => modo(page)).toBe('plano')
      await page.keyboard.up(t)
      await page.waitForTimeout(100)
      await page.keyboard.press('m')
      await expect.poll(() => modo(page)).toBe('vida')
      await page.waitForTimeout(100)
      const p0 = await personaje(page)
      await page.waitForTimeout(500)
      expect(await personaje(page), `tecla ${t}`).toEqual(p0)
    }
  })

  test('en Plano la cámara no se mueve sola tras soltar las teclas', async ({ page }) => {
    await abrir(page, '?semilla=42')
    await enfocarLienzo(page)
    await page.keyboard.press('m')
    await expect.poll(() => modo(page)).toBe('plano')
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(300)
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(150)
    const c0 = await camara(page)
    await page.waitForTimeout(700)
    expect(await camara(page)).toEqual(c0)
  })

  test('zoom del teclado en Plano no sale de los límites ni da errores (mantenido varios segundos)', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42')
    await enfocarLienzo(page)
    await page.keyboard.press('m')
    await expect.poll(() => modo(page)).toBe('plano')
    const z0 = (await camara(page))?.zoom ?? 0
    await page.keyboard.down('+')
    await page.waitForTimeout(2000)
    const zMax = (await camara(page))?.zoom ?? 0
    await page.keyboard.up('+')
    await page.keyboard.down('-')
    await page.waitForTimeout(2500)
    const zMin = (await camara(page))?.zoom ?? 0
    await page.keyboard.up('-')
    expect(zMax).toBeGreaterThan(z0)
    expect(zMin).toBeLessThan(zMax)
    expect(zMin).toBeGreaterThan(0)
    expect(errores).toEqual([])
  })

  test('desplazar con el teclado en Plano con zoom alto: la cámara no sale del valle', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42')
    await enfocarLienzo(page)
    await page.keyboard.press('m')
    await expect.poll(() => modo(page)).toBe('plano')
    await page.keyboard.down('+')
    await page.waitForTimeout(1500)
    await page.keyboard.up('+')
    const mundo = (await page.evaluate(() => window.__raices?.mundoPx())) ?? 0
    for (const t of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.down(t)
      await page.waitForTimeout(2500)
      await page.keyboard.up(t)
      const c = await camara(page)
      if (!c) throw new Error('sin cámara')
      const w = c.ancho / c.zoom
      const h = c.alto / c.zoom
      expect(c.scrollX + c.ancho / 2 - w / 2, t).toBeGreaterThanOrEqual(-1)
      expect(c.scrollY + c.alto / 2 - h / 2, t).toBeGreaterThanOrEqual(-1)
      expect(c.scrollX + c.ancho / 2 + w / 2, t).toBeLessThanOrEqual(mundo + 1)
      expect(c.scrollY + c.alto / 2 + h / 2, t).toBeLessThanOrEqual(mundo + 1)
    }
  })
})

test('el botón tiene nombre accesible que contiene su texto visible y contraste AA', async ({
  page,
}) => {
  await abrir(page, '?semilla=42')
  const b = boton(page)
  for (let i = 0; i < 2; i++) {
    const r = await b.evaluate((el) => {
      const cs = getComputedStyle(el)
      const lum = (rgb: string) => {
        const n = (rgb.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
        const f = (v: number) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(n[0] ?? 0) + 0.7152 * f(n[1] ?? 0) + 0.0722 * f(n[2] ?? 0)
      }
      const a = lum(cs.color)
      const c = lum(cs.backgroundColor)
      return {
        nombre: el.getAttribute('aria-label') ?? '',
        texto: el.textContent ?? '',
        ratio: (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05),
      }
    })
    expect(r.nombre).toContain(r.texto)
    expect(r.ratio).toBeGreaterThanOrEqual(4.5)
    await b.click()
    await expect.poll(() => modo(page)).toBe(i === 0 ? 'plano' : 'vida')
  }
})

test('el botón no interfiere con el lienzo: pulsarlo no mueve ni acerca la cámara (ratón o toque)', async ({
  page,
  isMobile,
}) => {
  await abrir(page, '?semilla=42')
  await page.waitForTimeout(500)
  const c0 = await camara(page)
  const caja = await boton(page).boundingBox()
  if (!caja) throw new Error('sin botón')
  const x = caja.x + caja.width / 2
  const y = caja.y + caja.height / 2
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect.poll(() => modo(page)).toBe('plano')
  const c1 = await camara(page)
  expect(c1?.zoom).toBe(c0?.zoom)
  expect(c1?.scrollX).toBe(c0?.scrollX)
  expect(c1?.scrollY).toBe(c0?.scrollY)
  // Un segundo toque vuelve a Vida: un solo cambio por toque.
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect.poll(() => modo(page)).toBe('vida')
})

test('en Plano, arrastrar empezando sobre el botón y soltar fuera no cambia de modo', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'ratón')
  await abrir(page, '?semilla=42&modo=plano')
  const caja = await boton(page).boundingBox()
  if (!caja) throw new Error('sin botón')
  await page.mouse.move(caja.x + 10, caja.y + 10)
  await page.mouse.down()
  await page.mouse.move(caja.x - 200, caja.y - 100, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await modo(page)).toBe('plano')
})

test('cambiar de modo a mitad de un arrastre: en Vida el arrastre se ignora y la cámara acaba sobre el personaje', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'ratón + teclado')
  await abrir(page, '?semilla=42')
  await enfocarLienzo(page)
  await page.keyboard.press('m')
  await expect.poll(() => modo(page)).toBe('plano')
  await page.mouse.move(300, 300)
  await page.mouse.down()
  await page.mouse.move(200, 250, { steps: 4 })
  await page.keyboard.press('m')
  await expect.poll(() => modo(page)).toBe('vida')
  await page.mouse.move(100, 200, { steps: 4 })
  await page.mouse.move(600, 500, { steps: 4 })
  await page.mouse.up()
  const p = await personaje(page)
  if (!p) throw new Error('sin personaje')
  await expect
    .poll(async () => {
      const c = await camara(page)
      return c ? fuera(c, p) : Infinity
    })
    .toBeLessThan(1)
})

test('cambiar a Vida a mitad de un pellizco no deja el arrastre activo', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'táctil')
  await abrir(page, '?semilla=42&modo=plano&debug')
  const cdp = await page.context().newCDPSession(page)
  const t = (id: number, x: number, y: number) => ({ id, x, y })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [t(1, 150, 300), t(2, 250, 300)],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [t(1, 130, 300), t(2, 270, 300)],
  })
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
  await expect.poll(() => modo(page)).toBe('vida')
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [t(1, 100, 400), t(2, 300, 400)],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const p = await personaje(page)
  if (!p) throw new Error('sin personaje')
  await expect
    .poll(async () => {
      const c = await camara(page)
      return c ? fuera(c, p) : Infinity
    })
    .toBeLessThan(1)
})

test('reiniciar la escena en Plano: el estado y el botón siguen coherentes y la cámara responde', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'ratón')
  const errores = await abrir(page, '?semilla=42&debug')
  await boton(page).click()
  await expect.poll(() => modo(page)).toBe('plano')
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__raices?.reiniciarValle())
    await page.waitForTimeout(400)
    const m = await modo(page)
    await expect(boton(page)).toHaveAttribute('aria-pressed', m === 'plano' ? 'true' : 'false')
    await expect(boton(page)).toHaveText(m === 'plano' ? 'Plano' : 'Vida')
  }
  const m = await modo(page)
  await page.mouse.move(400, 300)
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(1500) // en Vida la cámara reencuadra al personaje tras el zoom
  const c0 = await camara(page)
  await page.mouse.move(400, 300)
  await page.mouse.down()
  await page.mouse.move(250, 200, { steps: 5 })
  await page.mouse.up()
  const c1 = await camara(page)
  const mov = Math.hypot(
    (c1?.scrollX ?? 0) - (c0?.scrollX ?? 0),
    (c1?.scrollY ?? 0) - (c0?.scrollY ?? 0),
  )
  if (m === 'plano') expect(mov).toBeGreaterThan(10)
  else expect(mov).toBeLessThan(1)
  expect(errores).toEqual([])
})

test('redimensionar y girar en Vida y en Plano: el personaje sigue en pantalla (Vida) y el botón dentro', async ({
  page,
}) => {
  await abrir(page, '?semilla=42')
  for (const objetivo of ['vida', 'plano'] as const) {
    if ((await modo(page)) !== objetivo) await boton(page).click()
    await expect.poll(() => modo(page)).toBe(objetivo)
    for (const tam of [
      { width: 360, height: 640 },
      { width: 640, height: 360 },
      { width: 320, height: 480 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(tam)
      await expect.poll(async () => (await camara(page))?.ancho).toBe(tam.width)
      await page.waitForTimeout(300)
      const caja = await boton(page).boundingBox()
      if (!caja) throw new Error('sin botón')
      expect(caja.x + caja.width).toBeLessThanOrEqual(tam.width)
      expect(caja.y + caja.height).toBeLessThanOrEqual(tam.height)
      expect(caja.height).toBeGreaterThanOrEqual(44)
      const c = await camara(page)
      const p = await personaje(page)
      if (!c || !p) throw new Error('sin datos')
      if (objetivo === 'vida') {
        // S2: la cámara conserva su centro al redimensionar y no vuelve a perseguir al
        // personaje quieto, así que puede quedar fuera de la vista nueva.
        await page.waitForTimeout(1500)
        const c2 = await camara(page)
        if (!c2) throw new Error('sin cámara')
        expect(fuera(c2, p), JSON.stringify(tam)).toBeLessThan(1)
      }
    }
  }
})

test('el personaje empieza en pantalla con varias semillas y tamaños', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(180_000)
  const tams = isMobile
    ? [{ width: 412, height: 915 }]
    : [
        { width: 1280, height: 720 },
        { width: 360, height: 640 },
        { width: 640, height: 360 },
      ]
  const semillas = [1, 2, 3, 7, 42, 99, 1234, 31337, 4294967295, 0]
  for (const tam of tams) {
    await page.setViewportSize(tam)
    for (const s of semillas) {
      await page.goto(`./?semilla=${s}`)
      await expect
        .poll(() => page.evaluate(() => window.__raices?.camara()?.zoom))
        .toBeGreaterThan(0)
      await expect.poll(() => personaje(page)).toBeDefined()
      await page.waitForTimeout(150)
      const c = await camara(page)
      const p = await personaje(page)
      if (!c || !p) throw new Error('sin datos')
      expect(fuera(c, p), `semilla ${s} ${tam.width}x${tam.height}`).toBeLessThan(1)
    }
  }
})

test('Pausar y Reanudar en Plano no alteran el modo y volver a Vida respeta la pausa', async ({
  page,
}) => {
  await abrir(page, '?semilla=42&debug')
  await boton(page).click()
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Pausar' }))
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'Reanudar' }))
  expect(await modo(page)).toBe('plano')
  await boton(page).click()
  await expect.poll(() => modo(page)).toBe('vida')
  const r = await page.evaluate(() => window.__raices?.reloj())
  expect(r?.pausado).toBe(false)
})
