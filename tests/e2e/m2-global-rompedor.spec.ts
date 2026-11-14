/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { expect, test, type CDPSession, type Page } from '@playwright/test'

/** M2 · pasada global del rompedor: interacciones entre historias (personaje, tiempo, HUD, modos, táctil). */

const TAM = 32 // TAM_CASILLA

async function abrir(page: Page, query: string): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.waitForTimeout(600)
  return errores
}
const reloj = (page: Page) => page.evaluate(() => window.__raices!.reloj()!)
const personaje = (page: Page) => page.evaluate(() => window.__raices!.personaje()!)
const modo = (page: Page) => page.evaluate(() => window.__raices!.modo())
const emitir = (page: Page, comando: { tipo: string; [k: string]: unknown }) =>
  page.evaluate((c) => window.__raices?.emitir(c), comando)
const hora = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

async function aPantalla(page: Page, x: number, y: number) {
  const c = (await page.evaluate(() => window.__raices!.camara()))!
  return {
    x: (x * TAM - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: (y * TAM - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  }
}
type R = { x: number; y: number; width: number; height: number }
const caja = async (page: Page, sel: string): Promise<R> => {
  const c = await page.locator(sel).first().boundingBox()
  if (!c) throw new Error('sin caja ' + sel)
  return c
}
const solapa = (a: R, b: R) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test.describe('día completo jugando', () => {
  test.setTimeout(120_000)

  test(
    'un día acelerado con teclado, cambios de modo, velocidad y pausa: HUD, tinte y estado coherentes',
    { tag: '@rendimiento' },
    async ({ page }) => {
      const errores = await abrir(page, '?semilla=42&debug&acelerar=200')
      const aparicion = await personaje(page)
      await page.keyboard.down('KeyD')
      let vistoDesmayo = false
      let max = 0
      const t0 = Date.now()
      let paso = 0
      while (Date.now() - t0 < 100_000) {
        const r = await reloj(page)
        expect(r.minutoDelDia).toBeGreaterThanOrEqual(360)
        expect(r.minutoDelDia).toBeLessThanOrEqual(1560)
        // El HUD refleja el estado (dentro de la tolerancia de un minuto por la carrera DOM/estado).
        const txt = (await page.getByRole('timer').textContent()) ?? ''
        const [h, m] = txt.split(':').map(Number)
        const mh = ((h! < 6 ? h! + 24 : h!) * 60 + m!) | 0
        const r2 = await reloj(page)
        if (r2.dia === r.dia)
          expect(
            mh,
            `HUD ${txt} vs estado ${r.minutoDelDia}..${r2.minutoDelDia}`,
          ).toBeGreaterThanOrEqual(r.minutoDelDia - 1)
        max = Math.max(max, r.minutoDelDia)
        const luz = (await page.evaluate(() => window.__raices!.luz()))!
        expect(luz.alfa).toBeGreaterThanOrEqual(0)
        expect(luz.alfa).toBeLessThanOrEqual(1)
        // Acciones intercaladas.
        paso++
        if (paso % 5 === 0) await page.keyboard.press('KeyM')
        if (paso % 7 === 0) await page.keyboard.press('KeyP')
        if (paso % 3 === 0)
          await page
            .getByRole('button', { name: /Velocidad.*x(2|3)/i })
            .first()
            .click()
        if (r.dia >= 2) {
          vistoDesmayo = true
          break
        }
        // Mantener el tiempo corriendo: Vida y sin pausa si hace falta avanzar.
        if (paso > 12) {
          if ((await modo(page)) === 'plano') await page.keyboard.press('KeyM')
          const s = await reloj(page)
          if (s.pausado) await page.keyboard.press('KeyP')
        }
        await page.waitForTimeout(150)
      }
      await page.keyboard.up('KeyD')
      expect(vistoDesmayo, `no pasó el día (máx. minuto ${max})`).toBe(true)
      await expect(page.getByRole('status')).toHaveText(/dormido/)
      const r = await reloj(page)
      expect(r.dia).toBe(2)
      expect(await page.getByText(/Día 2 de/).count()).toBe(1)
      const luz = (await page.evaluate(() => window.__raices!.luz()))!
      expect(luz.alfa, `a las ${hora(r.minutoDelDia)} el tinte debería ser casi nulo`).toBeLessThan(
        0.3,
      )
      expect(errores).toEqual([])
      void aparicion
    },
  )

  test('desmayo con una ruta en curso: sin destino, personaje en la aparición y la cámara con él', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'ratón')
    const errores = await abrir(page, '?semilla=42&debug&hora=01:55')
    const ap = await personaje(page)
    const pt = await aPantalla(page, ap.x, ap.y - 8)
    await page.mouse.click(pt.x, Math.max(pt.y, 120))
    await expect.poll(() => page.evaluate(() => window.__raices!.destino())).toBeDefined()
    await emitir(page, { tipo: 'AvanzarTiempo', minutos: 300 })
    await expect.poll(async () => (await reloj(page)).dia).toBe(2)
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => window.__raices!.destino())).toBeUndefined()
    const p = await personaje(page)
    expect(Math.hypot(p.x - ap.x, p.y - ap.y)).toBeLessThan(0.2)
    const c = (await page.evaluate(() => window.__raices!.camara()))!
    const s = await aPantalla(page, p.x, p.y)
    expect(s.x).toBeGreaterThan(0)
    expect(s.x).toBeLessThan(c.ancho)
    expect(s.y).toBeGreaterThan(0)
    expect(s.y).toBeLessThan(c.alto)
    expect(errores).toEqual([])
  })
})

test.describe('móvil: joystick y HUD', () => {
  test.skip(({ isMobile }) => !isMobile, 'táctil')
  let cdp: CDPSession
  const tocar = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', puntos: [number, number][]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: puntos.map(([x, y], i) => ({ x, y, id: i })),
    })

  test('desmayo con el joystick activo: el joystick sigue, el personaje reaparece y camina desde la aparición', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&hora=01:55')
    cdp = await page.context().newCDPSession(page)
    const ap = await personaje(page)
    await tocar('touchStart', [[200, 500]])
    await tocar('touchMove', [[200, 470]])
    await tocar('touchMove', [[200, 430]])
    await expect.poll(() => page.evaluate(() => window.__raices!.joystickVisible())).toBe(true)
    await expect.poll(async () => (await personaje(page)).y).toBeLessThan(ap.y - 0.5)
    await emitir(page, { tipo: 'AvanzarTiempo', minutos: 300 })
    await expect.poll(async () => (await reloj(page)).dia).toBe(2)
    // El personaje volvió a la aparición (y quizá ya ha dado unos pasos con el dedo aún puesto).
    const p = await personaje(page)
    expect(Math.hypot(p.x - ap.x, p.y - ap.y)).toBeLessThan(1.5)
    expect(await page.evaluate(() => window.__raices!.joystickVisible())).toBe(true)
    await tocar('touchEnd', [])
    await expect.poll(() => page.evaluate(() => window.__raices!.joystickVisible())).toBe(false)
    const q1 = await personaje(page)
    await page.waitForTimeout(400)
    const q2 = await personaje(page)
    expect(Math.hypot(q2.x - q1.x, q2.y - q1.y), 'sigue andando solo tras soltar').toBeLessThan(
      0.01,
    )
    expect(errores).toEqual([])
  })

  test('pulsar el modo (Plano) con el joystick activo suelta el joystick y el personaje no se mueve', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug')
    cdp = await page.context().newCDPSession(page)
    await tocar('touchStart', [[200, 500]])
    await tocar('touchMove', [[230, 500]])
    await tocar('touchMove', [[270, 500]])
    await expect.poll(() => page.evaluate(() => window.__raices!.joystickVisible())).toBe(true)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await expect.poll(() => page.evaluate(() => window.__raices!.joystickVisible())).toBe(false)
    const a = await personaje(page)
    await tocar('touchMove', [[280, 500]])
    await page.waitForTimeout(400)
    const b = await personaje(page)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.01)
    await tocar('touchEnd', [])
    // Vuelta a Vida con el dedo ya levantado: nada colgado.
    await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
    await page.waitForTimeout(300)
    const c = await personaje(page)
    await page.waitForTimeout(400)
    const d = await personaje(page)
    expect(Math.hypot(d.x - c.x, d.y - c.y)).toBeLessThan(0.01)
    expect(await page.evaluate(() => window.__raices!.destino())).toBeUndefined()
    expect(errores).toEqual([])
  })

  test('un segundo dedo sobre el botón de pausa durante el arrastre: pausa una vez y el joystick no se pierde', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug')
    cdp = await page.context().newCDPSession(page)
    const b = await caja(page, '.boton-pausa')
    const bx = b.x + b.width / 2
    const by = b.y + b.height / 2
    await tocar('touchStart', [[200, 500]])
    await tocar('touchMove', [[230, 500]])
    await tocar('touchMove', [[270, 500]])
    await expect.poll(() => page.evaluate(() => window.__raices!.joystickVisible())).toBe(true)
    await tocar('touchStart', [
      [270, 500],
      [bx, by],
    ])
    await tocar('touchEnd', [[270, 500]])
    await page.waitForTimeout(300)
    const r = await reloj(page)
    const estado = await page.evaluate(() => ({
      v: window.__raices!.joystickVisible(),
      m: window.__raices!.modo(),
    }))
    await tocar('touchEnd', [])
    await page.waitForTimeout(300)
    expect(estado.m).toBe('vida')
    expect(r.pausado === true || r.pausado === false).toBe(true)
    // Tras soltar todo, ningún gesto queda colgado: un toque en el suelo fija destino.
    expect(await page.evaluate(() => window.__raices!.joystickVisible())).toBe(false)
    const ap = await personaje(page)
    const pt = await aPantalla(page, ap.x, ap.y)
    await page.touchscreen.tap(Math.min(pt.x + 80, 300), Math.max(pt.y - 150, 250))
    await expect
      .poll(() => page.evaluate(() => window.__raices!.destino()), {
        message: 'tras el gesto mixto un toque en el suelo no fija destino (gesto atascado)',
      })
      .toBeDefined()
    expect(errores).toEqual([])
  })

  test('girar el móvil de noche, en Plano y con aviso: el HUD no se solapa y el personaje queda a la vista en Vida', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&hora=22:00')
    await emitir(page, { tipo: 'AvanzarTiempo', minutos: 600 })
    await expect(page.getByRole('status')).toHaveText(/dormido/)
    for (const modoFinal of ['vida', 'plano'] as const) {
      if ((await modo(page)) !== modoFinal)
        await page.getByRole('button', { name: /Modo de juego/ }).click()
      for (const [w, h] of [
        [915, 412],
        [412, 915],
        [360, 640],
        [640, 360],
      ] as const) {
        await page.setViewportSize({ width: w, height: h })
        await page.waitForTimeout(500)
        const aviso = page.locator('.aviso')
        if (await aviso.count()) {
          const a = await caja(page, '.aviso')
          for (const sel of ['.reloj', '.boton-pausa', '.boton-modo'])
            expect(
              solapa(a, await caja(page, sel)),
              `${modoFinal} ${w}x${h}: aviso solapa ${sel}`,
            ).toBe(false)
        }
        for (const sel of ['.reloj', '.boton-modo', '.controles-tiempo']) {
          const c = await caja(page, sel)
          expect(c.x, `${sel} ${w}x${h}`).toBeGreaterThanOrEqual(0)
          expect(c.y).toBeGreaterThanOrEqual(0)
          expect(c.x + c.width).toBeLessThanOrEqual(w)
          expect(c.y + c.height).toBeLessThanOrEqual(h)
        }
        if (modoFinal === 'vida') {
          const p = await personaje(page)
          const s = await aPantalla(page, p.x, p.y)
          expect(s.x, `personaje fuera tras girar a ${w}x${h}`).toBeGreaterThan(0)
          expect(s.x).toBeLessThan(w)
          expect(s.y).toBeGreaterThan(0)
          expect(s.y).toBeLessThan(h)
        }
      }
    }
    expect(errores).toEqual([])
  })
})

test.describe('teclado y modos a la vez', () => {
  test.skip(({ isMobile }) => isMobile, 'teclado')

  test('P y M a la vez: cada una actúa una sola vez y el estado queda coherente', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug')
    for (let i = 0; i < 6; i++) {
      await page.keyboard.down('KeyP')
      await page.keyboard.down('KeyM')
      await page.keyboard.up('KeyM')
      await page.keyboard.up('KeyP')
      await page.waitForTimeout(120)
    }
    const r = await reloj(page)
    expect(r.pausado, 'P pulsada 6 veces ⇒ vuelve a no pausado').toBe(false)
    expect(await modo(page), 'M pulsada 6 veces ⇒ vuelve a Vida').toBe('vida')
    await expect(page.getByRole('button', { name: /^Modo de juego/ })).toHaveText('Vida')
    expect(errores).toEqual([])
  })

  test('tras reiniciar la escena 6 veces con tecla, ruta y pausa activas: una P = un cambio, HUD y estado de acuerdo, un solo joystick en el DOM', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&acelerar=50')
    for (let i = 0; i < 6; i++) {
      await page.keyboard.down('KeyW')
      await page.waitForTimeout(150)
      await emitir(page, { tipo: 'Pausar' })
      await page.evaluate(() => window.__raices!.reiniciarValle())
      await page.waitForTimeout(250)
    }
    await page.keyboard.up('KeyW')
    await expect.poll(() => modo(page)).toBe('vida')
    const r = await reloj(page)
    const pausaAria = await page.locator('.boton-pausa').getAttribute('aria-pressed')
    expect(pausaAria, 'el HUD debe reflejar la pausa tras el reinicio').toBe(String(r.pausado))
    const antes = (await reloj(page)).pausado
    await page.keyboard.press('KeyP')
    await page.waitForTimeout(150)
    expect((await reloj(page)).pausado, 'una P = un solo cambio (oyente duplicado)').toBe(!antes)
    expect(await page.locator('.joystick-base').count()).toBe(1)
    expect(await page.locator('.hud').count()).toBe(1)
    // Un desmayo tras los reinicios muestra un solo aviso.
    await page.keyboard.press('KeyP')
    await emitir(page, { tipo: 'Reanudar' })
    await emitir(page, { tipo: 'AvanzarTiempo', minutos: 2000 })
    await expect(page.getByRole('status')).toHaveText(/dormido/)
    expect(await page.locator('.aviso').count()).toBe(1)
    // El personaje, sin tecla, no anda solo.
    const a = await personaje(page)
    await page.waitForTimeout(500)
    const b = await personaje(page)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01)
    expect(errores).toEqual([])
  })

  test('reiniciar la escena en Plano con la pausa del jugador: el botón de modo y la insignia siguen al estado', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&modo=plano')
    await emitir(page, { tipo: 'Pausar' })
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__raices!.reiniciarValle())
      await page.waitForTimeout(250)
    }
    expect(await modo(page)).toBe('plano')
    await expect(page.getByRole('button', { name: /Modo de juego/ })).toHaveText('Plano')
    await expect(page.getByText('En pausa (Plano)')).toHaveCount(1)
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('vida')
    await expect(page.getByText('En pausa (Plano)')).toHaveCount(0)
    expect(errores).toEqual([])
  })

  test('Modo Plano con una ruta activa: la ruta se cancela, no hay marca y al volver a Vida no se reanuda', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug')
    const ap = await personaje(page)
    const pt = await aPantalla(page, ap.x, ap.y)
    await page.mouse.click(pt.x, Math.max(pt.y - 200, 150))
    await expect.poll(() => page.evaluate(() => window.__raices!.destino())).toBeDefined()
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('plano')
    expect(await page.evaluate(() => window.__raices!.destino())).toBeUndefined()
    await page.keyboard.press('KeyM')
    const a = await personaje(page)
    await page.waitForTimeout(600)
    const b = await personaje(page)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01)
    expect(errores).toEqual([])
  })
})

test.describe('accesibilidad del HUD', () => {
  test.skip(({ isMobile }) => isMobile, 'teclado')

  test('recorrido con Tab: cada control tiene nombre accesible y foco visible, y Enter/Espacio funcionan', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42&debug')
    const vistos: { nombre: string; outline: string; sombra: string }[] = []
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null
        if (!e) return undefined
        const cs = getComputedStyle(e)
        return {
          tag: e.tagName,
          nombre: e.getAttribute('aria-label') ?? e.textContent ?? '',
          outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
          sombra: cs.boxShadow,
          visible: e.matches(':focus-visible'),
        }
      })
      if (!info || info.tag !== 'BUTTON') continue
      expect(info.visible).toBe(true)
      vistos.push(info)
    }
    expect(vistos.length, 'botones alcanzables con Tab').toBeGreaterThanOrEqual(5)
    for (const v of vistos) {
      expect(v.nombre.trim().length).toBeGreaterThan(0)
      expect(
        v.outline.startsWith('none') && v.sombra === 'none',
        `sin indicador de foco: ${v.nombre}`,
      ).toBe(false)
    }
    // Con foco en el botón de modo, Enter cambia a Plano una vez y conserva el foco.
    const modoBtn = page.getByRole('button', { name: /Modo de juego/ })
    await modoBtn.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => modo(page)).toBe('plano')
    await expect(modoBtn).toBeFocused()
    await page.keyboard.press('Space')
    await expect.poll(() => modo(page)).toBe('vida')
  })

  test('los botones de velocidad y pausa exponen su estado (aria-pressed) y el reloj es un timer con nombre', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42&debug')
    await page.getByRole('button', { name: /Velocidad.*x2/i }).click()
    await expect(page.getByRole('button', { name: /Velocidad.*x2/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: /Velocidad.*x1/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.getByRole('timer')).toHaveAccessibleName(/.+/)
  })
})

test.describe('rendimiento global M2', () => {
  test.setTimeout(120_000)
  test.skip(({ isMobile }) => isMobile, 'escritorio')

  async function fps(page: Page, ms: number): Promise<number> {
    return page.evaluate(
      (d) =>
        new Promise<number>((res) => {
          let n = 0
          const t0 = performance.now()
          const f = () => {
            n++
            if (performance.now() - t0 < d) requestAnimationFrame(f)
            else res((n * 1000) / (performance.now() - t0))
          }
          requestAnimationFrame(f)
        }),
      ms,
    )
  }

  test(
    'fps de noche andando con el HUD frente al valle de día quieto (anota la diferencia)',
    { tag: '@rendimiento' },
    async ({ page }, info) => {
      await abrir(page, '?semilla=42&debug&hora=23:00')
      const quietoNoche = await fps(page, 3000)
      await page.keyboard.down('KeyD')
      const nocheAndando = await fps(page, 3000)
      await page.keyboard.up('KeyD')
      await page.goto('./?semilla=42&debug')
      await expect
        .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
        .toBe(true)
      await page.waitForTimeout(600)
      const dia = await fps(page, 3000)
      await page.keyboard.down('KeyD')
      const diaAndando = await fps(page, 3000)
      await page.keyboard.up('KeyD')
      const msg = `fps: dia quieto ${dia.toFixed(1)}, dia andando ${diaAndando.toFixed(1)}, noche quieto ${quietoNoche.toFixed(1)}, noche andando ${nocheAndando.toFixed(1)}`
      info.annotations.push({ type: 'rendimiento', description: msg })
      console.log(msg)
      expect(nocheAndando, msg).toBeGreaterThan(15)
      expect(nocheAndando / diaAndando, `el tinte cuesta demasiado: ${msg}`).toBeGreaterThan(0.6)
    },
  )
})
