/**
 * Rompedor · M5-00 Integración del arte. Ver docs/informes/M5-00-rompedor.md.
 * - Orden de profundidad de árboles y rocas horneados frente al protagonista y a las zonas.
 * - Puntero y táctil con DPR 1, 2 y 3 (clic, toque, pincel, colocación, joystick), giro y cambio de tamaño.
 * - Texturas @1x frente a @2x, volver de la portada, errores de consola.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import sharp from 'sharp'

const T = 32
const SEMILLA = 42

function espiar(p: Page): string[] {
  const errores: string[] = []
  p.on('pageerror', (e) => errores.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
  return errores
}

async function abrir(page: Page, ruta: string): Promise<void> {
  await page.goto(ruta)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.waitForTimeout(600)
}

const emitir = (p: Page, c: { tipo: string; [k: string]: unknown }) =>
  p.evaluate((x) => window.__raices?.emitir(x), c)
const personaje = async (p: Page) => {
  const r = await p.evaluate(() => window.__raices?.personaje())
  if (!r) throw new Error('sin personaje')
  return r
}

/**
 * Árboles de la semilla 42 con 2 casillas libres al norte (y una a cada lado) dentro de su parcela,
 * ordenados por distancia a la aparición. Generado con `crearEstadoInicial({ semilla: 42 })`
 * (Playwright no puede importar el núcleo: `data/*.json` necesita un atributo de importación).
 */
const ARBOLES = [
  { x: 44, y: 90, parcela: 32, variante: 0.10440140427090228 },
  { x: 44, y: 95, parcela: 32, variante: 0.835195173509419 },
  { x: 51, y: 86, parcela: 33, variante: 0.5777981211431324 },
  { x: 35, y: 86, parcela: 32, variante: 0.3822733308188617 },
]
function arbolesCandidatos() {
  return ARBOLES
}

/**
 * Región del mundo (px) que de verdad ocupa la copa opaca del árbol (máscara de alfa de
 * `arbol@1x.webp`, 64×96, pivote en la base centrada, escala de la variante como `rectDecoracion`):
 * las filas donde las columnas `cx ± semiancho` son opacas (alfa >= 250) y que caen entre
 * `yMin` e `yMax` (mundo).
 */
async function regionCopaOpaca(
  a: { x: number; y: number; variante: number },
  semiancho: number,
  yMin: number,
  yMax: number,
  xc?: number,
) {
  const { data, info } = await sharp('public/assets/objetos/arbol@1x.webp')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const k = 0.9 + 0.2 * a.variante
  const base = (a.y + 1) * T
  const cx = a.x * T + T / 2
  const centro = xc ?? cx
  const filas: number[] = []
  for (let py = 0; py < info.height; py++) {
    const wy0 = base - info.height * k + py * k
    if (wy0 < yMin || wy0 + k > yMax) continue
    let ok = true
    for (let wx = centro - semiancho; wx <= centro + semiancho && ok; wx += 0.5) {
      const px = Math.floor((wx - (cx - (info.width * k) / 2)) / k)
      if (px < 0 || px >= info.width || (data[(py * info.width + px) * 4 + 3] ?? 0) < 250)
        ok = false
    }
    if (ok) filas.push(py)
  }
  if (filas.length === 0) throw new Error('la copa no tiene filas opacas en ese rango')
  const py0 = Math.min(...filas)
  const py1 = Math.max(...filas) + 1
  return {
    x0: centro - semiancho,
    x1: centro + semiancho,
    y0: base - info.height * k + py0 * k,
    y1: base - info.height * k + py1 * k,
  }
}

/** Camina (Vida) hacia (x, y) en casillas con pasos pequeños; devuelve si llegó a menos de 0,2. */
async function irA(page: Page, x: number, y: number): Promise<boolean> {
  for (let i = 0; i < 500; i++) {
    const p = await personaje(page)
    const dx = x - p.x
    const dy = y - p.y
    if (Math.hypot(dx, dy) < 0.15) return true
    const n = Math.hypot(dx, dy)
    await emitir(page, {
      tipo: 'MoverPersonaje',
      dx: dx / n,
      dy: dy / n,
      ms: Math.min(80, n * 150),
    })
  }
  return false
}

/** Recorte (PNG) del rectángulo del mundo (px) con la vista actual, como píxeles crudos. */
async function recorteMundo(page: Page, r: { x0: number; y0: number; x1: number; y1: number }) {
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('sin cámara')
  const aP = (wx: number, wy: number) => ({
    x: (wx - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: (wy - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  })
  const a = aP(r.x0, r.y0)
  const b = aP(r.x1, r.y1)
  const clip = {
    x: Math.round(a.x),
    y: Math.round(a.y),
    width: Math.max(2, Math.round(b.x - a.x)),
    height: Math.max(2, Math.round(b.y - a.y)),
  }
  const png = await page.screenshot({ clip })
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height, ch: info.channels }
}

/** Guarda la captura entera con la región marcada en rojo (depuración). */
async function guardarRegion(
  page: Page,
  r: { x0: number; y0: number; x1: number; y1: number },
  nombre: string,
) {
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) return
  const aP = (wx: number, wy: number) => ({
    x: (wx - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: (wy - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  })
  const a = aP(r.x0, r.y0)
  const b = aP(r.x1, r.y1)
  const png = await page.screenshot()
  const caja = await sharp({
    create: {
      width: Math.max(1, Math.round(b.x - a.x)),
      height: Math.max(1, Math.round(b.y - a.y)),
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
  await sharp(png)
    .composite([{ input: caja, left: Math.round(a.x), top: Math.round(a.y) }])
    .toFile(`capturas/${nombre}.png`)
}

function fraccionDistinta(
  a: { data: Buffer; w: number; h: number; ch: number },
  b: { data: Buffer; w: number; h: number; ch: number },
  umbral = 24,
): number {
  const n = Math.min(a.data.length, b.data.length)
  let d = 0
  let tot = 0
  for (let i = 0; i < n; i += a.ch) {
    tot++
    const m = Math.max(
      Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)),
      Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)),
      Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0)),
    )
    if (m > umbral) d++
  }
  return d / tot
}

test.describe('profundidad del arte horneado', () => {
  test.skip(({ isMobile }) => isMobile, 'basta en escritorio')

  /** Lleva al personaje a la casilla norte del primer árbol alcanzable y devuelve el árbol. */
  async function ponerseAlNorteDeUnArbol(page: Page) {
    for (const a of arbolesCandidatos().slice(0, 8)) {
      await abrir(page, `./?semilla=${SEMILLA}&debug&propias=${a.parcela}`)
      if (await irA(page, a.x + 0.5, a.y - 0.5)) return a
    }
    throw new Error('ningún árbol alcanzable')
  }

  test('[S2] el protagonista que pasa por detrás (al norte) de un árbol queda tapado por la copa', async ({
    page,
  }) => {
    const a = await ponerseAlNorteDeUnArbol(page)
    // Lo más pegado al árbol que deja la colisión, para que el cuerpo solape de verdad la copa.
    for (let i = 0; i < 12; i++) {
      await emitir(page, { tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 60 })
    }
    const pies = (await personaje(page)).y * T
    expect(pies, 'el personaje debe quedar al norte del árbol').toBeLessThan((a.y + 0.5) * T)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await page.evaluate(([x, y]) => window.__raices?.centrarCamara(x ?? 0, y ?? 0), [a.x, a.y - 1])
    await page.waitForTimeout(900)
    // Copa opaca (máscara de alfa) que el cuerpo del personaje (pies en `pies`, ~40 px de alto) cubriría.
    const region = await regionCopaOpaca(a, 6, pies - 40, pies - 1)
    expect(region.y1 - region.y0, 'la región de la copa debe tener altura útil').toBeGreaterThan(10)
    await guardarRegion(page, region, 'm5-00-region-s2')
    const con = await recorteMundo(page, region)
    await page.screenshot({ path: 'capturas/m5-00-prof-con.png' })
    // Mismo recorte con el personaje lejos: en Vida, 4 casillas al norte (hay hueco) y de vuelta a Plano.
    await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
    expect(await irA(page, a.x + 0.5, a.y - 2.5)).toBe(true)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await page.evaluate(([x, y]) => window.__raices?.centrarCamara(x ?? 0, y ?? 0), [a.x, a.y - 1])
    await page.waitForTimeout(900)
    // Con los pies en y-2,5 el cuerpo (hasta y-4,3) llega a la copa de un árbol que está 2 casillas más al sur
    // solo por la parte baja; usamos la comparación opuesta: tampoco debe cambiar la parte baja del tronco.
    const sin = await recorteMundo(page, region)
    await page.screenshot({ path: 'capturas/m5-00-prof-sin.png' })
    const f = fraccionDistinta(con, sin)
    expect(
      f,
      `fracción de píxeles distintos en la copa con y sin personaje detrás: ${f.toFixed(3)} (árbol ${a.x},${a.y})`,
    ).toBeLessThan(0.05)
  })

  test('[S2] el protagonista que pasa por detrás (en la fila del árbol, a su lado) queda tapado por la copa', async ({
    page,
  }) => {
    const a = await ponerseAlNorteDeUnArbol(page)
    // A la casilla de al lado en la misma fila (pies más al norte que la base del árbol) y pegado a él.
    expect(await irA(page, a.x - 0.5, a.y + 0.5)).toBe(true)
    for (let i = 0; i < 12; i++) {
      await emitir(page, { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 60 })
    }
    const p = await personaje(page)
    const pies = { x: p.x * T, y: p.y * T }
    expect(pies.y, 'los pies deben quedar al norte de la base del árbol').toBeLessThan(
      (a.y + 1) * T,
    )
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await page.evaluate(([x, y]) => window.__raices?.centrarCamara(x ?? 0, y ?? 0), [a.x, a.y - 1])
    await page.waitForTimeout(900)
    const region = await regionCopaOpaca(a, 3, pies.y - 40, pies.y - 1, pies.x + 5)
    await guardarRegion(page, region, 'm5-00-region-s2-lado')
    const con = await recorteMundo(page, region)
    await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
    expect(await irA(page, a.x - 3.5, a.y + 0.5)).toBe(true)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await page.evaluate(([x, y]) => window.__raices?.centrarCamara(x ?? 0, y ?? 0), [a.x, a.y - 1])
    await page.waitForTimeout(900)
    const sin = await recorteMundo(page, region)
    await page.screenshot({ path: 'capturas/m5-00-prof-lado-sin.png' })
    const f = fraccionDistinta(con, sin)
    expect(
      f,
      `fracción de píxeles distintos en la copa con y sin personaje al lado: ${f.toFixed(3)} (árbol ${a.x},${a.y}, pies ${pies.x.toFixed(1)},${pies.y.toFixed(1)})`,
    ).toBeLessThan(0.05)
  })

  test('[S3] el relleno de una zona justo al norte de un árbol no tiñe su copa', async ({
    page,
  }) => {
    const a = await ponerseAlNorteDeUnArbol(page)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await page.evaluate(([x, y]) => window.__raices?.centrarCamara(x ?? 0, y ?? 0), [a.x, a.y - 1])
    await page.waitForTimeout(900)
    // Copa opaca de todo el ancho central; la zona (2 casillas al norte del árbol) llega hasta y*32.
    const region = await regionCopaOpaca(a, 10, a.y * T - 64, a.y * T + 20)
    await guardarRegion(page, region, 'm5-00-region-s3')
    const antes = await recorteMundo(page, region)
    // Control: el suelo despejado entre la copa y el borde norte de la zona sí debe teñirse.
    const aire = { x0: a.x * T - 40, x1: a.x * T - 8, y0: a.y * T - 60, y1: a.y * T - 40 }
    const aireAntes = await recorteMundo(page, aire)
    await emitir(page, {
      tipo: 'PintarZona',
      x0: a.x - 1,
      y0: a.y - 2,
      x1: a.x + 1,
      y1: a.y - 1,
      zona: 'cultivo',
    })
    await page.waitForTimeout(600)
    expect(
      await page.evaluate(([x, y]) => window.__raices?.zonaDe(x ?? 0, y ?? 0), [a.x, a.y - 1]),
    ).toBe('cultivo')
    const despues = await recorteMundo(page, region)
    await page.screenshot({ path: 'capturas/m5-00-zona-copa.png' })
    const fAire = fraccionDistinta(aireAntes, await recorteMundo(page, aire), 8)
    expect(fAire, 'control: la zona debe teñir el suelo despejado').toBeGreaterThan(0.5)
    const f = fraccionDistinta(antes, despues, 8)
    expect(
      f,
      `la copa cambia en ${(f * 100).toFixed(1)} % de sus píxeles al pintar la zona al norte`,
    ).toBeLessThan(0.02)
  })
})

/** Contexto con un DPR dado. */
async function contextoDpr(
  browser: Browser,
  baseURL: string,
  dpr: number,
  ancho = 412,
  alto = 915,
) {
  return browser.newContext({
    baseURL,
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
  })
}

for (const dpr of [1, 2, 3]) {
  test.describe(`DPR ${dpr}`, () => {
    test.skip(({ isMobile }) => isMobile, 'el contexto se crea aquí')

    test(`el lienzo mide CSS×min(DPR,2), zoom de pantalla coherente y arte @${dpr >= 1.5 ? 2 : 1}x`, async ({
      browser,
    }) => {
      const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
      const page = await ctx.newPage()
      const errores = espiar(page)
      const peticiones: string[] = []
      page.on('request', (r) => r.url().includes('/assets/') && peticiones.push(r.url()))
      await abrir(page, `./?semilla=${SEMILLA}&debug`)
      const r = await page.evaluate(() => {
        const cv = document.querySelector('canvas') as HTMLCanvasElement
        return { w: cv.width, h: cv.height, cw: cv.clientWidth, ch: cv.clientHeight }
      })
      const f = Math.min(dpr, 2)
      expect(r.w).toBe(Math.round(r.cw * f))
      expect(r.h).toBe(Math.round(r.ch * f))
      const arte = peticiones.filter((u) => /(protagonista|tile-|arbol|casa|zona-)/.test(u))
      expect(arte.length).toBeGreaterThan(0)
      const sufijo = dpr >= 1.5 ? '@2x' : '@1x'
      const otro = dpr >= 1.5 ? '@1x' : '@2x'
      expect(
        arte.filter((u) => u.includes(otro)),
        arte.join('\n'),
      ).toEqual([])
      expect(arte.some((u) => u.includes(sufijo))).toBe(true)
      expect(errores).toEqual([])
      await ctx.close()
    })

    test(`toque, clic de colocación y pincel caen en la casilla bajo el dedo`, async ({
      browser,
    }) => {
      const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
      const page = await ctx.newPage()
      const errores = espiar(page)
      await abrir(page, `./?semilla=${SEMILLA}&debug`)
      // Toque en Vida: el destino del personaje cae en la casilla tocada.
      const p = await personaje(page)
      const objetivo = { x: Math.floor(p.x) + 3, y: Math.floor(p.y) - 2 }
      const pt = await page.evaluate(
        ([x, y]) => window.__raices?.puntoClicCasilla(x ?? 0, y ?? 0),
        [objetivo.x, objetivo.y],
      )
      expect(pt).toBeTruthy()
      await page.touchscreen.tap(pt?.x ?? 0, pt?.y ?? 0)
      await page.waitForTimeout(300)
      const d = await page.evaluate(() => window.__raices?.destino())
      expect(d, 'sin destino tras el toque').toBeTruthy()
      expect([Math.floor(d?.x ?? -9), Math.floor(d?.y ?? -9)]).toEqual([objetivo.x, objetivo.y])
      expect(errores).toEqual([])
      await ctx.close()
    })

    test(`Plano: el toque elige la parcela que está bajo el dedo`, async ({ browser }) => {
      const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
      const page = await ctx.newPage()
      const errores = espiar(page)
      await abrir(page, `./?semilla=${SEMILLA}&debug&modo=plano&propias=32`)
      await page.waitForTimeout(500)
      await page.evaluate(() => window.__raices?.centrarCamara(40, 88))
      await page.waitForTimeout(800)
      const pt = await page.evaluate(() => window.__raices?.puntoClicParcela(32))
      expect(pt).toBeTruthy()
      await page.touchscreen.tap(pt?.x ?? 0, pt?.y ?? 0)
      await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBe(32)
      expect(errores).toEqual([])
      await ctx.close()
    })
  })
}

test.describe('giro y cambio de tamaño con DPR 2', () => {
  test.skip(({ isMobile }) => isMobile, 'el contexto se crea aquí')

  test('al girar el móvil el lienzo sigue a CSS×2 y el toque sigue cayendo en su casilla', async ({
    browser,
  }) => {
    const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', 2)
    const page = await ctx.newPage()
    const errores = espiar(page)
    await abrir(page, `./?semilla=${SEMILLA}&debug`)
    for (const [w, h] of [
      [915, 412],
      [412, 915],
      [640, 320],
      [412, 915],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(500)
      const r = await page.evaluate(() => {
        const cv = document.querySelector('canvas') as HTMLCanvasElement
        const c = window.__raices?.camara()
        return { w: cv.width, h: cv.height, cw: cv.clientWidth, ch: cv.clientHeight, c }
      })
      expect(r.w, `${w}x${h}`).toBe(r.cw * 2)
      expect(r.h, `${w}x${h}`).toBe(r.ch * 2)
      expect(r.cw).toBe(w)
      expect(r.c?.ancho).toBeCloseTo(w, 0)
      expect(r.c?.alto).toBeCloseTo(h, 0)
      // Orquestador (M5-01): desde M5-01 un toque al alcance (≤ 1 casilla) usa la herramienta. Hay
      // que esperar a que el personaje termine la vuelta anterior antes de medir a 2 casillas.
      await expect.poll(() => page.evaluate(() => window.__raices?.destino() ?? null)).toBeNull()
      const p = await personaje(page)
      const objetivo = { x: Math.floor(p.x) + 2, y: Math.floor(p.y) - 1 }
      const pt = await page.evaluate(
        ([x, y]) => window.__raices?.puntoClicCasilla(x ?? 0, y ?? 0),
        [objetivo.x, objetivo.y],
      )
      await page.touchscreen.tap(pt?.x ?? 0, pt?.y ?? 0)
      await page.waitForTimeout(250)
      const d = await page.evaluate(() => window.__raices?.destino())
      expect([Math.floor(d?.x ?? -9), Math.floor(d?.y ?? -9)], `${w}x${h}`).toEqual([
        objetivo.x,
        objetivo.y,
      ])
    }
    expect(errores).toEqual([])
    await ctx.close()
  })
})

test.describe('portada y texturas', () => {
  test('volver de la portada al valle no pierde texturas ni da errores', async ({ page }) => {
    const errores = espiar(page)
    await page.goto('./')
    await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('portada')
    const antes = await page.evaluate(() => window.__raices?.texturas())
    await page.keyboard.press('Enter')
    const boton = page.getByRole('button', { name: /jugar|empezar|nueva|comenzar/i }).first()
    if (await boton.count()) await boton.click()
    await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
    await page.waitForTimeout(800)
    const despues = await page.evaluate(() => window.__raices?.texturas())
    expect(despues).toBeGreaterThan(antes ?? 0)
    // Todas las texturas del arte están (el personaje tiene cuadro real).
    const p = await page.evaluate(() => window.__raices?.personaje())
    expect(p).toBeTruthy()
    expect(errores).toEqual([])
  })
})

/** fps medias (rAF) durante `ms` milisegundos. */
const fpsMedias = (page: Page, ms = 2500) =>
  page.evaluate(
    (t) =>
      new Promise<number>((res) => {
        let n = 0
        const t0 = performance.now()
        const f = () => {
          n++
          if (performance.now() - t0 < t) requestAnimationFrame(f)
          else res((n * 1000) / (performance.now() - t0))
        }
        requestAnimationFrame(f)
      }),
    ms,
  )

test.describe('rendimiento por DPR', () => {
  test.skip(({ isMobile }) => isMobile, 'el contexto se crea aquí')

  for (const modo of ['vida', 'plano'] as const) {
    test(`${modo}: a DPR 2 las fps no caen por debajo del 60 % de las de DPR 1 (solo con GPU)`, async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const medidas: Record<number, number> = {}
      for (const dpr of [1, 2]) {
        const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
        const page = await ctx.newPage()
        await abrir(page, `./?semilla=${SEMILLA}&debug${modo === 'plano' ? '&modo=plano' : ''}`)
        await fpsMedias(page, 800)
        medidas[dpr] = await fpsMedias(page)
        await ctx.close()
      }
      test.info().annotations.push({ type: 'fps', description: JSON.stringify(medidas) })
      // Decisión del orquestador (M5-00): con renderizado por software, 4× píxeles hunden las fps
      // por fuerza y la medida no dice nada de un móvil real. Solo se exige con GPU.
      const ctxGpu = await browser.newContext()
      const renderer = await (
        await ctxGpu.newPage()
      ).evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl')
        const ext = gl?.getExtension('WEBGL_debug_renderer_info')
        return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'desconocido'
      })
      await ctxGpu.close()
      test.skip(
        /swiftshader|llvmpipe|software|desconocido/i.test(renderer),
        `renderizado por software (${renderer}): solo se anota la medida`,
      )
      expect(medidas[2] ?? 0, JSON.stringify(medidas)).toBeGreaterThanOrEqual(
        0.6 * (medidas[1] ?? 0),
      )
    })
  }
})

/** Táctil por CDP (varios dedos) con un DPR dado. */
async function tactil(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  return (
    tipo: 'touchStart' | 'touchMove' | 'touchEnd',
    puntos: [number, number][] = [],
  ): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: puntos.map(([x, y], i) => ({ x, y, id: i })),
    })
}

for (const dpr of [1, 2, 3]) {
  test.describe(`gestos con DPR ${dpr}`, () => {
    test.skip(({ isMobile }) => isMobile, 'el contexto se crea aquí')

    test('joystick: 10 px es toque y 11 px es joystick; el joystick queda dentro de la pantalla', async ({
      browser,
    }) => {
      const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
      const page = await ctx.newPage()
      const errores = espiar(page)
      await abrir(page, `./?semilla=${SEMILLA}&debug`)
      const toca = await tactil(page)
      // Zona libre de botones; el joystick debe dibujarse en píxeles CSS con cualquier DPR (ver captura).
      await toca('touchStart', [[300, 700]])
      await toca('touchMove', [[310, 700]])
      await page.waitForTimeout(100)
      expect(await page.evaluate(() => window.__raices?.joystickVisible())).toBe(false)
      await toca('touchMove', [[311, 700]])
      await page.waitForTimeout(150)
      expect(await page.evaluate(() => window.__raices?.joystickVisible())).toBe(true)
      await page.screenshot({ path: `capturas/m5-00-joystick-dpr${dpr}.png` })
      const antes = await personaje(page)
      await toca('touchMove', [[380, 640]])
      await page.waitForTimeout(500)
      const despues = await personaje(page)
      expect(Math.hypot(despues.x - antes.x, despues.y - antes.y)).toBeGreaterThan(0.1)
      await toca('touchEnd')
      expect(errores).toEqual([])
      await ctx.close()
    })

    test('pellizco: acerca y mantiene el punto bajo los dedos', async ({ browser }) => {
      const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
      const page = await ctx.newPage()
      const errores = espiar(page)
      await abrir(page, `./?semilla=${SEMILLA}&debug&modo=plano`)
      const toca = await tactil(page)
      const cam = async () => {
        const c = await page.evaluate(() => window.__raices?.camara())
        if (!c) throw new Error('sin cámara')
        return c
      }
      const c0 = await cam()
      const mundoBajo = (c: Awaited<ReturnType<typeof cam>>, x: number, y: number) => ({
        x: c.scrollX + c.ancho / 2 + (x - c.ancho / 2) / c.zoom,
        y: c.scrollY + c.alto / 2 + (y - c.alto / 2) / c.zoom,
      })
      const cx = 206
      const cy = 457
      const m0 = mundoBajo(c0, cx, cy)
      await toca('touchStart', [
        [cx - 40, cy],
        [cx + 40, cy],
      ])
      for (let i = 1; i <= 8; i++)
        await toca('touchMove', [
          [cx - 40 - i * 12, cy],
          [cx + 40 + i * 12, cy],
        ])
      await toca('touchEnd')
      await page.waitForTimeout(300)
      const c1 = await cam()
      expect(c1.zoom).toBeGreaterThan(c0.zoom * 1.5)
      // El punto del mundo bajo el centro del pellizco no se aleja más de media casilla.
      const m1 = mundoBajo(c1, cx, cy)
      expect(Math.hypot(m1.x - m0.x, m1.y - m0.y), `dpr ${dpr}`).toBeLessThan(16)
      expect(errores).toEqual([])
      await ctx.close()
    })

    test('pincel: un arrastre de un dedo pinta exactamente las casillas bajo el dedo', async ({
      browser,
    }) => {
      const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
      const page = await ctx.newPage()
      const errores = espiar(page)
      await abrir(page, `./?semilla=${SEMILLA}&debug&modo=plano&propias=32`)
      await page.evaluate(() => window.__raices?.centrarCamara(40, 86))
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Zonas', exact: true }).click()
      const barra = page.getByRole('group', { name: 'Pincel de zonas' })
      await barra.getByRole('button', { name: 'Cultivo' }).click()
      await page.waitForTimeout(500)
      const p = async (x: number, y: number) => {
        const r = await page.evaluate(
          ([a, b]) => window.__raices?.puntoClicCasilla(a ?? 0, b ?? 0),
          [x, y],
        )
        if (!r) throw new Error(`casilla ${x},${y} no visible`)
        return r
      }
      const a = await p(36, 84)
      const b = await p(39, 86)
      const toca = await tactil(page)
      await toca('touchStart', [[a.x, a.y]])
      for (let i = 1; i <= 6; i++)
        await toca('touchMove', [[a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6]])
      await toca('touchEnd')
      await page.waitForTimeout(300)
      const r = await page.evaluate(() => {
        const dentro: string[] = []
        const fuera: string[] = []
        for (let y = 80; y <= 90; y++)
          for (let x = 32; x <= 44; x++) {
            const z = window.__raices?.zonaDe(x, y)
            const esta = x >= 36 && x <= 39 && y >= 84 && y <= 86
            if (esta && z !== 'cultivo') dentro.push(`${x},${y}`)
            if (!esta && z !== undefined) fuera.push(`${x},${y}`)
          }
        return { dentro, fuera }
      })
      expect(r, `dpr ${dpr}`).toEqual({ dentro: [], fuera: [] })
      expect(errores).toEqual([])
      await ctx.close()
    })

    test('construir: tocar una casilla coloca la silueta en esa casilla', async ({ browser }) => {
      const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
      const page = await ctx.newPage()
      const errores = espiar(page)
      await abrir(page, `./?semilla=${SEMILLA}&debug&modo=plano&propias=32`)
      await page.evaluate(() => window.__raices?.centrarCamara(40, 86))
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: 'Construir', exact: true }).click()
      await page
        .getByRole('region', { name: 'Construir' })
        .getByRole('button', { name: /^Caja de envío/ })
        .click()
      await page.waitForTimeout(600)
      const pt = await page.evaluate(() => window.__raices?.puntoClicCasilla(38, 85))
      expect(pt).toBeTruthy()
      const toca = await tactil(page)
      await toca('touchStart', [[pt?.x ?? 0, pt?.y ?? 0]])
      await toca('touchEnd')
      await page.waitForTimeout(400)
      const s = await page.evaluate(() => window.__raices?.construccion()?.silueta)
      // La caja ocupa 1×1 o 2×1: la casilla tocada cae dentro de su huella.
      expect(s, `dpr ${dpr}`).toBeTruthy()
      expect(38).toBeGreaterThanOrEqual(s?.x ?? 99)
      expect(38).toBeLessThan((s?.x ?? 0) + (s?.ancho ?? 0))
      expect(85).toBeGreaterThanOrEqual(s?.y ?? 99)
      expect(85).toBeLessThan((s?.y ?? 0) + (s?.alto ?? 0))
      expect(errores).toEqual([])
      await ctx.close()
    })
  })
}

test.describe('edificios con arte', () => {
  test.skip(({ isMobile }) => isMobile, 'basta en escritorio')

  async function granja(page: Page) {
    await abrir(page, `./?semilla=${SEMILLA}&debug&propias=32&dinero=100000`)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await emitir(page, { tipo: 'PintarZona', x0: 33, y0: 80, x1: 39, y1: 91, zona: 'vivienda' })
    await emitir(page, { tipo: 'PintarZona', x0: 40, y0: 80, x1: 46, y1: 91, zona: 'almacen' })
    // Primer sitio válido para cada edificio, de dentro afuera (hay árboles y rocas por medio).
    for (const tipoEdificio of ['casa', 'cobertizo', 'caja-envio']) {
      const sitio = await page.evaluate((t) => {
        for (let r = 0; r < 12; r++)
          for (let y = 86 - r; y <= 86 + r; y++)
            for (let x = 39 - r; x <= 39 + r; x++)
              if (window.__raices?.colocacion(t, x, y)?.valida) return { x, y }
        return undefined
      }, tipoEdificio)
      expect(sitio, tipoEdificio).toBeTruthy()
      await emitir(page, { tipo: 'Construir', tipoEdificio, x: sitio?.x, y: sitio?.y })
    }
    await page.evaluate(() => window.__raices?.centrarCamara(40, 85))
    await page.waitForTimeout(800)
  }

  const vistas = (page: Page) => page.evaluate(() => window.__raices?.edificios() ?? [])

  test('los tres edificios pasan por cimientos, obra y terminado sin errores ni texturas que falten', async ({
    page,
  }) => {
    const errores = espiar(page)
    const avisos: string[] = []
    page.on('console', (m) => m.type() === 'warning' && avisos.push(m.text()))
    await granja(page)
    const e0 = await vistas(page)
    expect(e0.map((e) => e.tipo).sort()).toEqual(['caja-envio', 'casa', 'cobertizo'])
    const imagenes: Buffer[] = []
    for (let dia = 1; dia <= 4; dia++) {
      await page.waitForTimeout(500)
      imagenes.push(await page.screenshot({ path: `capturas/m5-00-edificios-dia${dia}.png` }))
      await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
      await emitir(page, { tipo: 'AvanzarTiempo', minutos: 1440 })
      await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
      await page.evaluate(() => window.__raices?.centrarCamara(40, 85))
    }
    const fin = await vistas(page)
    expect(
      fin.every((e) => !e.enObra),
      JSON.stringify(fin),
    ).toBe(true)
    // Cada día cambia lo que se ve (cimientos -> obra -> terminado).
    for (let i = 1; i < imagenes.length; i++)
      expect(
        imagenes[i]?.equals(imagenes[i - 1] ?? Buffer.alloc(0)),
        `día ${i} = día ${i + 1}`,
      ).toBe(false)
    expect(avisos.filter((a) => /texture|frame|not found/i.test(a))).toEqual([])
    expect(errores).toEqual([])
  })
})

for (const dpr of [1, 2, 3]) {
  test.describe(`costuras con DPR ${dpr}`, () => {
    test.skip(({ isMobile }) => isMobile, 'el contexto se crea aquí')

    test('sin hueco de fondo entre tiles ni entre trozos horneados a varios zooms', async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const ctx = await browser.newContext({
        baseURL: test.info().project.use.baseURL ?? '',
        viewport: { width: 800, height: 600 },
        deviceScaleFactor: dpr,
      })
      const page = await ctx.newPage()
      const errores = espiar(page)
      // Plano: sin parcelas propias ni tinte raro; el río y los trozos (cada 1024 px) están en el centro.
      await abrir(page, `./?semilla=${SEMILLA}&debug&modo=plano`)
      const huecos: string[] = []
      for (let paso = 0; paso < 6; paso++) {
        await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
        await page.waitForTimeout(400)
        const png = await page.screenshot({ clip: { x: 200, y: 150, width: 400, height: 300 } })
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
        let n = 0
        for (let i = 0; i < data.length; i += info.channels) {
          const r = data[i] ?? 0
          const g = data[i + 1] ?? 0
          const b = data[i + 2] ?? 0
          // Fondo del lienzo #3f5d3a (63,93,58), también bajo el tinte de venta.
          if (
            (Math.abs(r - 63) < 8 && Math.abs(g - 93) < 8 && Math.abs(b - 58) < 8) ||
            (Math.abs(r - 53) < 6 && Math.abs(g - 78) < 6 && Math.abs(b - 49) < 6)
          )
            n++
        }
        const z = (await page.evaluate(() => window.__raices?.camara()?.zoom)) ?? 0
        if (n > 0) huecos.push(`zoom ${z.toFixed(3)}: ${n} px de fondo`)
        await page.screenshot({
          path: `capturas/m5-00-costuras-dpr${dpr}-${paso}.png`,
          clip: { x: 200, y: 150, width: 400, height: 300 },
        })
        await page.mouse.move(400, 300)
        await page.mouse.wheel(0, -230 - paso * 37)
        await page.waitForTimeout(300)
      }
      expect(huecos).toEqual([])
      expect(errores).toEqual([])
      await ctx.close()
    })
  })
}

for (const dpr of [1.25, 1.49, 1.5, 1.75, 2.625]) {
  test(`DPR ${dpr}: el arte y el lienzo son los de su tramo y la partida arranca limpia`, async ({
    browser,
  }) => {
    test.skip(test.info().project.name !== 'escritorio', 'el contexto se crea aquí')
    const ctx = await contextoDpr(browser, test.info().project.use.baseURL ?? '', dpr)
    const page = await ctx.newPage()
    const errores = espiar(page)
    const urls: string[] = []
    page.on('request', (r) => r.url().includes('/assets/') && urls.push(r.url()))
    await abrir(page, `./?semilla=${SEMILLA}&debug`)
    const arte = urls.filter((u) => /(protagonista|tile-|arbol|roca|casa|zona-)/.test(u))
    const esperado = dpr >= 1.5 ? '@2x' : '@1x'
    const otro = dpr >= 1.5 ? '@1x' : '@2x'
    expect(arte.filter((u) => u.includes(otro))).toEqual([])
    expect(arte.some((u) => u.includes(esperado))).toBe(true)
    const r = await page.evaluate(() => {
      const cv = document.querySelector('canvas') as HTMLCanvasElement
      return { w: cv.width, cw: cv.clientWidth }
    })
    expect(r.w).toBe(Math.round(r.cw * Math.min(dpr, 2)))
    await ctx.close()
    expect(errores).toEqual([])
  })
}

test('reiniciar el valle varias veces no acumula texturas ni objetos y el arte sigue ahí', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'escritorio')
  const errores = espiar(page)
  await abrir(page, `./?semilla=${SEMILLA}&debug`)
  const medir = () =>
    page.evaluate(() => ({ t: window.__raices?.texturas(), o: window.__raices?.objetosValle() }))
  const base = await medir()
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__raices?.reiniciarValle())
    await page.waitForTimeout(700)
  }
  const fin = await medir()
  expect(fin.t).toBe(base.t)
  expect(fin.o).toBe(base.o)
  expect(await page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  expect(errores).toEqual([])
})

/** Ronda 2: la capa de árboles y rocas con pool (`capaObjetos.ts`) al mover, hacer zoom y perder el contexto. */
test.describe('capa de objetos con pool', () => {
  test.skip(({ isMobile }) => isMobile, 'basta en escritorio')
  test.setTimeout(120_000)

  const dosFotogramas = (p: Page) =>
    p.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )

  const foto = async (p: Page) =>
    (
      await sharp(await p.screenshot())
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    ).data

  const difMedia = (x: Buffer, y: Buffer) => {
    let s = 0
    let n = 0
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs((x[i] ?? 0) - (y[i] ?? 0))
      if (d > 24) n++
      s += d
    }
    return { media: s / x.length, fraccion: n / x.length }
  }

  test('tras saltos de cámara y zoom a ráfagas, la capa tiene justo lo visible y se ve igual que una capa rehecha', async ({
    page,
  }) => {
    const errores = espiar(page)
    await abrir(page, `./?semilla=${SEMILLA}&debug&modo=plano`)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    let sem = 7
    const rnd = () => {
      sem = (sem * 1103515245 + 12345) % 2147483648
      return sem / 2147483648
    }
    const mal: string[] = []
    const v = page.viewportSize() ?? { width: 1280, height: 720 }
    for (let i = 0; i < 40; i++) {
      const paso = i % 4
      if (paso === 0) {
        const m = await page.evaluate(() => window.__raices?.mundoPx())
        const c = (m ?? 3200) / T
        await page.evaluate(
          ([x, y]) => window.__raices?.centrarCamara(x ?? 0, y ?? 0),
          [Math.floor(rnd() * c), Math.floor(rnd() * c)],
        )
      } else if (paso === 1) {
        await page.mouse.move(rnd() * v.width, rnd() * v.height)
        for (let k = 0; k < 3; k++) await page.mouse.wheel(0, (rnd() - 0.5) * 900)
      } else {
        // arrastre rápido (sin esperar entre movimientos)
        const x0 = 100 + rnd() * (v.width - 200)
        const y0 = 100 + rnd() * (v.height - 200)
        await page.mouse.move(x0, y0)
        await page.mouse.down()
        await page.mouse.move(x0 + (rnd() - 0.5) * 600, y0 + (rnd() - 0.5) * 400, { steps: 3 })
        await page.mouse.up()
      }
      await dosFotogramas(page)
      await dosFotogramas(page)
      const c = await page.evaluate(() => window.__raices?.objetosCapa())
      if (!c || c.activos > c.enVista || c.activos === 0)
        mal.push(`paso ${i}: ${JSON.stringify(c)}`)
      if (i % 10 !== 9) continue
      // Punto de control: la vista con el pool, comparada con la misma vista con la capa rehecha desde
      // cero (la pérdida de contexto la invalida entera).
      await page.waitForTimeout(500)
      const antes = await foto(page)
      const capaAntes = await page.evaluate(() => window.__raices?.objetosCapa())
      await page.evaluate(async () => {
        const cv = document.querySelector('canvas') as HTMLCanvasElement
        const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGL2RenderingContext
        const ext = gl.getExtension('WEBGL_lose_context')
        ext?.loseContext()
        await new Promise((r) => setTimeout(r, 300))
        ext?.restoreContext()
        await new Promise((r) => setTimeout(r, 1500))
      })
      await page.waitForTimeout(500)
      const d = difMedia(antes, await foto(page))
      if (d.fraccion >= 0.005)
        mal.push(
          `paso ${i}: ${(d.fraccion * 100).toFixed(2)} % de píxeles distintos con la capa rehecha`,
        )
      const capaDespues = await page.evaluate(() => window.__raices?.objetosCapa())
      if (JSON.stringify(capaDespues) !== JSON.stringify(capaAntes))
        mal.push(`paso ${i}: capa ${JSON.stringify(capaAntes)} -> ${JSON.stringify(capaDespues)}`)
    }
    expect(mal, mal.join(' | ')).toEqual([])
    expect(errores).toEqual([])
  })

  test('perder el contexto, mover la cámara durante la pérdida y recuperarlo deja los árboles de la vista', async ({
    page,
  }) => {
    const errores = espiar(page)
    await abrir(page, `./?semilla=${SEMILLA}&debug&modo=plano`)
    await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
    await page.evaluate(() => window.__raices?.centrarCamara(44, 90))
    await page.waitForTimeout(900)
    const antes = await foto(page)
    const capaAntes = await page.evaluate(() => window.__raices?.objetosCapa())
    expect(capaAntes?.activos ?? 0).toBeGreaterThan(0)
    const res = await page.evaluate(async () => {
      const cv = document.querySelector('canvas') as HTMLCanvasElement
      let restaurado = false
      cv.addEventListener('webglcontextrestored', () => (restaurado = true))
      const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGL2RenderingContext
      const ext = gl.getExtension('WEBGL_lose_context')
      if (!ext) return 'sin-extension'
      ext.loseContext()
      await new Promise((r) => setTimeout(r, 200))
      // Se mueve la cámara con el contexto perdido y se vuelve al mismo sitio.
      window.__raices?.centrarCamara(10, 10)
      await new Promise((r) => setTimeout(r, 300))
      window.__raices?.centrarCamara(44, 90)
      await new Promise((r) => setTimeout(r, 300))
      ext.restoreContext()
      await new Promise((r) => setTimeout(r, 1500))
      return restaurado ? 'restaurado' : 'no-restaurado'
    })
    expect(res).toBe('restaurado')
    await page.waitForTimeout(900)
    expect(await page.evaluate(() => window.__raices?.objetosCapa())).toEqual(capaAntes)
    const d = difMedia(antes, await foto(page))
    await page.screenshot({ path: 'capturas/m5-00-contexto-pool.png' })
    expect(
      d.fraccion,
      `píxeles distintos tras perder el contexto moviendo la cámara: ${(d.fraccion * 100).toFixed(2)} %`,
    ).toBeLessThan(0.005)
    expect(errores).toEqual([])
  })
})
