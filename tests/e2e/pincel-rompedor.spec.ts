import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { target } from './apoyo/rendimiento.ts'
import sharp from 'sharp'

/** Rompedor · M4-04. Gestos cruzados, teclado en los bordes, estado de la capa de zonas y capturas. */

const SEMILLA = 42
const PROPIAS = '14,15,20,21'
const QUERY = `?semilla=${SEMILLA}&debug&modo=plano&propias=${PROPIAS}`
type Punto = { x: number; y: number }

async function abrir(page: Page, query = QUERY): Promise<string[]> {
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

const esMovil = () => test.info().project.name === 'movil'
const barra = (page: Page) => page.getByRole('group', { name: 'Pincel de zonas' })
const herramienta = (page: Page, nombre: string) =>
  barra(page).getByRole('button', { name: nombre })
const pincel = (page: Page) => page.evaluate(() => window.__raices?.pincel())

async function abrirBarra(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Zonas', exact: true }).click()
  await expect(barra(page)).toBeVisible()
}

async function puntoCasilla(page: Page, cx: number, cy: number): Promise<Punto> {
  const p = await page.evaluate((c) => window.__raices?.puntoClicCasilla(c.x, c.y), {
    x: cx,
    y: cy,
  })
  if (!p) throw new Error(`La casilla ${cx},${cy} no es visible`)
  return p
}

const zona = (page: Page, cx: number, cy: number) =>
  page.evaluate((c) => window.__raices?.zonaDe(c.x, c.y), { x: cx, y: cy })

async function contar(
  page: Page,
  r: { x0: number; y0: number; x1: number; y1: number },
  esperada: string | undefined,
): Promise<number> {
  return page.evaluate(
    ([r, e]) => {
      let n = 0
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) if (window.__raices?.zonaDe(x, y) === e) n++
      return n
    },
    [r, esperada] as const,
  )
}

let cdp: CDPSession | undefined
test.beforeEach(() => {
  cdp = undefined
})
type Toque = [number, number][]
async function tocar(
  page: Page,
  tipo: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  p: Toque,
): Promise<void> {
  const c = (cdp ??= await page.context().newCDPSession(page))
  await c.send('Input.dispatchTouchEvent', {
    type: tipo,
    touchPoints: p.map(([x, y], id) => ({ x, y, id })),
  })
}

async function todasPropias(page: Page): Promise<void> {
  const todas = Array.from({ length: 36 }, (_, i) => i).join(',')
  await page.goto(`./?semilla=${SEMILLA}&debug&modo=plano&propias=${todas}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await page.waitForTimeout(400)
}

test.describe('móvil: dedos cruzados', () => {
  test.skip(() => !esMovil(), 'solo móvil')

  test('un segundo dedo a mitad de un pintado anula el gesto y no pinta; luego un dedo vuelve a pintar', async ({
    page,
  }) => {
    const errores = await abrir(page)
    await abrirBarra(page)
    await herramienta(page, 'Cultivo').click()
    const a = await puntoCasilla(page, 44, 44)
    const b = await puntoCasilla(page, 50, 48)
    await tocar(page, 'touchStart', [[a.x, a.y]])
    await tocar(page, 'touchMove', [[b.x, b.y]])
    await tocar(page, 'touchStart', [
      [b.x, b.y],
      [a.x + 10, a.y + 90],
    ])
    await tocar(page, 'touchEnd', [[b.x, b.y]]) // levanta el segundo, queda el primero
    await tocar(page, 'touchMove', [[b.x + 5, b.y + 5]])
    await tocar(page, 'touchEnd', [])
    expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'cultivo')).toBe(0)
    expect((await pincel(page))?.rectangulo).toBeUndefined()
    // Gesto nuevo con un dedo: pinta.
    await tocar(page, 'touchStart', [[a.x, a.y]])
    await tocar(page, 'touchMove', [[b.x, b.y]])
    await tocar(page, 'touchEnd', [])
    expect(await contar(page, { x0: 44, y0: 44, x1: 50, y1: 48 }, 'cultivo')).toBe(7 * 5)
    expect(errores).toEqual([])
  })

  test('un toque cancelado por el sistema no pinta', async ({ page }) => {
    await abrir(page)
    await abrirBarra(page)
    await herramienta(page, 'Huerto').click()
    const a = await puntoCasilla(page, 44, 44)
    const b = await puntoCasilla(page, 50, 48)
    await tocar(page, 'touchStart', [[a.x, a.y]])
    await tocar(page, 'touchMove', [[b.x, b.y]])
    await tocar(page, 'touchCancel', [])
    expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'huerto')).toBe(0)
    expect((await pincel(page))?.rectangulo).toBeUndefined()
  })
})

test('cambiar de modo a mitad de un arrastre no pinta y el pincel sigue usable al volver', async ({
  page,
}) => {
  test.skip(esMovil(), 'ratón')
  const errores = await abrir(
    page,
    `?semilla=${SEMILLA}&debug&modo=plano&propias=${Array.from({ length: 36 }, (_, i) => i).join(',')}`,
  )
  await abrirBarra(page)
  await herramienta(page, 'Cultivo').click()
  const a = await puntoCasilla(page, 44, 44)
  const b = await puntoCasilla(page, 50, 48)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
  await page.waitForTimeout(200)
  await page.mouse.up()
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'plano' }))
  await page.waitForTimeout(300)
  expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'cultivo')).toBe(0)
  await abrirBarra(page)
  await herramienta(page, 'Cultivo').click()
  // Al volver a Plano la vista puede ser otra: se pinta entre dos puntos del centro de la pantalla.
  const v = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.mouse.move(v.width / 2 - 60, v.height / 3)
  await page.mouse.down()
  await page.mouse.move(v.width / 2 + 60, v.height / 3 + 60, { steps: 4 })
  await page.mouse.up()
  expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'cultivo')).toBeGreaterThan(0)
  expect(errores).toEqual([])
})

test('cerrar la barra con un arrastre en curso no pinta y al reabrir no queda una vista previa fantasma', async ({
  page,
}) => {
  test.skip(esMovil(), 'ratón')
  await abrir(page)
  await abrirBarra(page)
  await herramienta(page, 'Cultivo').click()
  const a = await puntoCasilla(page, 44, 44)
  const b = await puntoCasilla(page, 50, 48)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.evaluate(() => (document.querySelector('.boton-listo') as HTMLElement).click())
  await page.mouse.up()
  expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'cultivo')).toBe(0)
  await abrirBarra(page)
  await herramienta(page, 'Borrar').click()
  expect((await pincel(page))?.rectangulo).toBeUndefined()
  // Un movimiento suelto del ratón (sin botón) no debe pintar ni arrastrar.
  await page.mouse.move(a.x + 20, a.y + 20)
  await page.mouse.move(b.x, b.y)
  expect((await pincel(page))?.rectangulo).toBeUndefined()
})

test('arrastrar y soltar fuera de la pantalla pinta hasta el borde sin errores', async ({
  page,
}) => {
  test.skip(esMovil(), 'ratón')
  const errores = await abrir(page)
  await abrirBarra(page)
  await herramienta(page, 'Almacén').click()
  const a = await puntoCasilla(page, 44, 44)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(-300, -300, { steps: 6 })
  await page.mouse.up()
  expect((await pincel(page))?.rectangulo).toBeUndefined()
  expect(await zona(page, 44, 44)).toBe('almacen')
  expect(errores).toEqual([])
})

test('un rectángulo sobre parcelas propias y ajenas solo pinta las propias', async ({ page }) => {
  test.skip(esMovil(), 'ratón')
  await abrir(page, `?semilla=${SEMILLA}&debug&modo=plano&propias=14`)
  await abrirBarra(page)
  await herramienta(page, 'Vivienda').click()
  const a = await puntoCasilla(page, 40, 40)
  const b = await puntoCasilla(page, 55, 55)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  // La parcela 14 ocupa las casillas 32..47 en x e y.
  // (el río no se puede pintar, por eso no son las 64 casillas)
  const dentro = await contar(page, { x0: 40, y0: 40, x1: 47, y1: 47 }, 'vivienda')
  expect(dentro).toBeGreaterThan(40)
  expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'vivienda')).toBe(dentro)
})

test(
  'teclado: el cursor se queda en el borde del valle y se puede pintar la esquina 0,0',
  { tag: '@rendimiento' },
  async ({ page }) => {
    test.skip(esMovil(), 'teclado')
    const errores = await abrir(page, `?semilla=${SEMILLA}&debug&modo=plano&propias=0`)
    await abrirBarra(page)
    await herramienta(page, 'Cultivo').click()
    await page.keyboard.press('Enter') // cursor al centro
    for (let i = 0; i < 55; i++) await page.keyboard.press('ArrowLeft')
    for (let i = 0; i < 55; i++) await page.keyboard.press('ArrowUp')
    expect((await pincel(page))?.cursor).toEqual({ x: 0, y: 0 })
    await page.keyboard.press('Enter') // marca
    await page.keyboard.press('Enter') // aplica
    expect(await zona(page, 0, 0)).toBe('cultivo')
    for (let i = 0; i < 55; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 55; i++) await page.keyboard.press('ArrowDown')
    expect((await pincel(page))?.cursor).toEqual({ x: 55, y: 55 })
    expect(errores).toEqual([])
  },
)

test('teclado: Enter mantenido (repetición) solo marca una vez', async ({ page }) => {
  test.skip(esMovil(), 'teclado')
  await abrir(page)
  await abrirBarra(page)
  await herramienta(page, 'Cultivo').click()
  await page.keyboard.press('Enter')
  await page.keyboard.down('Enter')
  await page.keyboard.down('Enter') // repeat = true
  await page.keyboard.down('Enter')
  await page.keyboard.up('Enter')
  const p = await pincel(page)
  expect(p?.ancla).toBeDefined()
  expect(await contar(page, { x0: 0, y0: 0, x1: 95, y1: 95 }, 'cultivo')).toBe(0)
})

test('teclado: Enter y flechas sin herramienta elegida no hacen nada raro', async ({ page }) => {
  test.skip(esMovil(), 'teclado')
  const errores = await abrir(page)
  await abrirBarra(page)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowLeft')
  const p = await pincel(page)
  expect(p?.cursor).toBeUndefined()
  expect(p?.ancla).toBeUndefined()
  expect(await page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
  expect(errores).toEqual([])
})

test('teclado: cerrar la barra con Listo (teclado) devuelve el foco al lienzo', async ({
  page,
}) => {
  test.skip(esMovil(), 'teclado')
  await abrir(page)
  await abrirBarra(page)
  await herramienta(page, 'Listo').focus()
  await page.keyboard.press('Enter')
  await expect(barra(page)).toHaveCount(0)
  const foco = await page.evaluate(() => {
    const a = document.activeElement
    return a?.tagName === 'CANVAS' || a?.id === 'juego'
  })
  expect(foco).toBe(true)
})

for (const previo of [false, true]) {
  test(`teclado: el cursor que baja con flechas nunca queda bajo la barra (tras panel de parcela: ${previo})`, async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado')
    await abrir(page)
    if (previo) {
      await page.evaluate(() => window.__raices?.seleccionar(14))
      await page.waitForTimeout(500)
    }
    await abrirBarra(page)
    await herramienta(page, 'Cultivo').click()
    await page.keyboard.press('Enter')
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(1200)
    const c = (await pincel(page))?.cursor
    const p = await puntoCasilla(page, c?.x ?? 0, c?.y ?? 0)
    const caja = await barra(page).boundingBox()
    expect(p.y).toBeLessThan(caja?.y ?? 0)
  })
}

test('pintar y borrar muchas veces no acumula texturas ni objetos', async ({ page }) => {
  test.skip(esMovil(), 'núcleo, una vez basta')
  const errores = await abrir(page)
  await todasPropias(page)
  const base = await page.evaluate(() => ({
    t: window.__raices?.texturas(),
    o: window.__raices?.objetosValle(),
  }))
  for (let ronda = 0; ronda < 15; ronda++) {
    await page.evaluate((r) => {
      const zs = ['cultivo', 'huerto', 'vivienda', 'almacen']
      for (let k = 0; k < 6; k++) {
        const x0 = (r * 7 + k * 13) % 80
        const y0 = (r * 11 + k * 5) % 80
        window.__raices?.emitir({
          tipo: 'PintarZona',
          x0,
          y0,
          x1: x0 + 15,
          y1: y0 + 15,
          zona: zs[(r + k) % 4],
        })
      }
    }, ronda)
    await page.waitForTimeout(60)
  }
  await page.evaluate(() =>
    window.__raices?.emitir({ tipo: 'BorrarZona', x0: 0, y0: 0, x1: 95, y1: 95 }),
  )
  await page.waitForTimeout(300)
  const fin = await page.evaluate(() => ({
    t: window.__raices?.texturas(),
    o: window.__raices?.objetosValle(),
  }))
  expect(fin).toEqual(base)
  expect(errores).toEqual([])
})

test(
  'pintar todo el valle repetidamente no hunde los fps',
  { tag: '@rendimiento' },
  async ({ page }) => {
    test.skip(esMovil(), 'rendimiento en escritorio')
    await todasPropias(page)
    const ms = await page.evaluate(async () => {
      const zs = ['cultivo', 'huerto', 'vivienda', 'almacen']
      const t0 = performance.now()
      for (let i = 0; i < 24; i++) {
        window.__raices?.emitir({
          tipo: 'PintarZona',
          x0: 0,
          y0: 0,
          x1: 95,
          y1: 95,
          zona: zs[i % 4],
        })
        await new Promise((r) => requestAnimationFrame(() => r(0)))
      }
      return performance.now() - t0
    })
    // Un hitch medio de más de 200 ms por pincelada (dependiente de la máquina, ver informe).
    // Targets (noted only): mean stroke < 200 ms and > 20 fps afterwards.
    // Floors (hard): 60 % of each target (333 ms; 12 fps).
    target(ms / 24 < 200, `stroke ${(ms / 24).toFixed(0)} ms >= 200`)
    expect(ms / 24, 'floor ms per stroke').toBeLessThan(333)
    await page.waitForTimeout(1500)
    const fps = await page.evaluate(() => window.__raices?.fps())
    target((fps ?? 0) > 20, `fps ${fps} <= 20`)
    expect(fps, 'floor fps').toBeGreaterThan(12)
  },
)

test('tras perder el contexto WebGL las zonas pintadas se vuelven a dibujar', async ({ page }) => {
  test.skip(esMovil(), 'escritorio')
  await abrir(page)
  await page.evaluate(() => {
    window.__raices?.emitir({
      tipo: 'PintarZona',
      x0: 36,
      y0: 36,
      x1: 60,
      y1: 60,
      zona: 'vivienda',
    })
  })
  await page.waitForTimeout(500)
  const foto = async () =>
    sharp(await page.screenshot())
      .removeAlpha()
      .raw()
      .toBuffer()
  const a = await foto()
  const b = await foto()
  const dif = (x: Buffer, y: Buffer) => {
    let s = 0
    for (let i = 0; i < x.length; i++) s += Math.abs((x[i] ?? 0) - (y[i] ?? 0))
    return s / x.length
  }
  const ruido = dif(a, b)
  const res = await page.evaluate(async () => {
    const cv = document.querySelector('canvas') as HTMLCanvasElement
    let restaurado = false
    cv.addEventListener('webglcontextrestored', () => (restaurado = true))
    const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGL2RenderingContext | null
    const ext = gl?.getExtension('WEBGL_lose_context')
    if (!ext) return 'sin-extension'
    ext.loseContext()
    await new Promise((r) => setTimeout(r, 300))
    ext.restoreContext()
    await new Promise((r) => setTimeout(r, 1500))
    return restaurado ? 'restaurado' : 'no-restaurado'
  })
  expect(res).toBe('restaurado')
  const c = await foto()
  expect(dif(a, c)).toBeLessThan(ruido + 2)
})

/** Verificación visual: deja capturas de zonas pintadas, vista previa y barra en las tres vistas. */
test('capturas de zonas y barra', { tag: '@capturas' }, async ({ page }) => {
  test.skip(esMovil(), 'fija sus propios tamaños')
  const vistas = [
    ['escritorio', { width: 1280, height: 720 }],
    ['movil-horizontal', { width: 915, height: 412 }],
    ['movil-vertical', { width: 412, height: 915 }],
  ] as const
  for (const [nombre, vp] of vistas) {
    await page.setViewportSize(vp)
    await abrir(page, QUERY)
    await page.evaluate(() => {
      const e = window.__raices?.emitir
      e?.({ tipo: 'PintarZona', x0: 36, y0: 36, x1: 43, y1: 43, zona: 'cultivo' })
      e?.({ tipo: 'PintarZona', x0: 44, y0: 36, x1: 51, y1: 43, zona: 'huerto' })
      e?.({ tipo: 'PintarZona', x0: 36, y0: 44, x1: 43, y1: 51, zona: 'vivienda' })
      e?.({ tipo: 'PintarZona', x0: 44, y0: 44, x1: 51, y1: 51, zona: 'almacen' })
    })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `capturas/zonas-plano--${nombre}.png` })
    await page.getByRole('button', { name: 'Zonas', exact: true }).click()
    await herramienta(page, 'Cultivo').click()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `capturas/zonas-barra--${nombre}.png` })
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    await page.waitForTimeout(500)
    await page.screenshot({ path: `capturas/zonas-vida--${nombre}.png` })
  }
})
