/**
 * Rompedor · M5-00, ronda final. Ver docs/informes/M5-00-rompedor.md («Ronda final»).
 * - Cambio de DPR en caliente (CDP `Emulation.setDeviceMetricsOverride` sin tocar el tamaño CSS).
 * - Capturas finales (personaje tras un árbol y un edificio, zonas, barra de zonas) en las tres vistas.
 * - Barra de zonas en escala de grises: las muestras deben distinguirse sin color.
 */
import { devices, expect, test, type Browser, type Page } from '@playwright/test'
import sharp from 'sharp'

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

async function irA(page: Page, x: number, y: number): Promise<boolean> {
  for (let i = 0; i < 600; i++) {
    const p = await personaje(page)
    const dx = x - p.x
    const dy = y - p.y
    const n = Math.hypot(dx, dy)
    if (n < 0.2) return true
    await emitir(page, {
      tipo: 'MoverPersonaje',
      dx: dx / n,
      dy: dy / n,
      ms: Math.min(80, n * 150),
    })
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// DPR en caliente
// ---------------------------------------------------------------------------------------------

test.describe('cambio de DPR en caliente', () => {
  test.skip(({ isMobile }) => isMobile, 'el contexto se crea aquí')

  for (const [ancho, alto] of [
    [412, 915],
    [1280, 720],
  ] as const) {
    test(`DPR 1→2→1→3→1,25→2 sin cambiar el tamaño CSS (${ancho}x${alto}): lienzo, cámara y toque coherentes`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext({
        baseURL: test.info().project.use.baseURL ?? '',
        viewport: { width: ancho, height: alto },
        deviceScaleFactor: 1,
        hasTouch: true,
      })
      const page = await ctx.newPage()
      const errores = espiar(page)
      // Chromium con CDP cambia `devicePixelRatio` pero NO dispara `change` en las MediaQueryList (ni
      // en las nuestras): se guardan las que crea el juego y se les envía el evento a mano, que es
      // lo que haría el navegador al mover la ventana a otro monitor.
      await page.addInitScript(() => {
        const w = window as unknown as { __mql: MediaQueryList[] }
        w.__mql = []
        const original = window.matchMedia.bind(window)
        window.matchMedia = (q: string) => {
          const m = original(q)
          w.__mql.push(m)
          return m
        }
      })
      await abrir(page, `./?semilla=${SEMILLA}&debug`)
      const cdp = await ctx.newCDPSession(page)
      let anterior = 1
      for (const dpr of [2, 1, 3, 1.25, 2, 1]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: ancho,
          height: alto,
          deviceScaleFactor: dpr,
          mobile: false,
        })
        // El navegador avisa a quien escucha el valor que dejó de cumplirse.
        const avisadas = await page.evaluate((previo) => {
          const w = window as unknown as { __mql: MediaQueryList[] }
          const lista = w.__mql.filter((m) => m.media.includes(`(resolution: ${previo}dppx)`))
          for (const m of lista) m.dispatchEvent(new Event('change'))
          return lista.length
        }, anterior)
        expect(avisadas, `el juego escucha (resolution: ${anterior}dppx)`).toBeGreaterThan(0)
        anterior = dpr
        const f = Math.min(dpr, 2)
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const cv = document.querySelector('canvas') as HTMLCanvasElement
                return cv.width
              }),
            { message: `lienzo tras DPR ${dpr}`, timeout: 4000 },
          )
          .toBe(Math.round(ancho * f))
        const r = await page.evaluate(() => {
          const cv = document.querySelector('canvas') as HTMLCanvasElement
          return {
            dpr: window.devicePixelRatio,
            w: cv.width,
            h: cv.height,
            cw: cv.clientWidth,
            ch: cv.clientHeight,
            c: window.__raices?.camara(),
          }
        })
        expect(r.dpr).toBeCloseTo(dpr, 2)
        expect([r.cw, r.ch], `tamaño CSS con DPR ${dpr}`).toEqual([ancho, alto])
        expect(r.h).toBe(Math.round(alto * f))
        expect(r.c?.ancho).toBeCloseTo(ancho, 0)
        expect(r.c?.alto).toBeCloseTo(alto, 0)
        await page.waitForTimeout(300)
        // El toque cae en su casilla.
        const p = await personaje(page)
        const objetivo = { x: Math.floor(p.x) + 2, y: Math.floor(p.y) - 1 }
        const pt = await page.evaluate(
          ([x, y]) => window.__raices?.puntoClicCasilla(x ?? 0, y ?? 0),
          [objetivo.x, objetivo.y],
        )
        expect(pt).toBeTruthy()
        await page.touchscreen.tap(pt?.x ?? 0, pt?.y ?? 0)
        await page.waitForTimeout(250)
        const d = await page.evaluate(() => window.__raices?.destino())
        expect([Math.floor(d?.x ?? -9), Math.floor(d?.y ?? -9)], `toque con DPR ${dpr}`).toEqual([
          objetivo.x,
          objetivo.y,
        ])
        // Pasos de zoom en Plano y vuelta a Vida no rompen nada.
        await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
        await page.waitForTimeout(150)
        await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
      }
      expect(errores).toEqual([])
      await page.screenshot({ path: 'capturas/m5-00-final-dpr-caliente.png' })
      await ctx.close()
    })
  }
})

// ---------------------------------------------------------------------------------------------
// Ganchos durante la carga del arte
// ---------------------------------------------------------------------------------------------

test('[S3] mientras el arte se carga (valle aún no activo), camara() y personaje() no devuelven datos de una cámara sin configurar', async ({
  page,
}) => {
  // Frena el arte para que la ventana entre `init` (la partida ya existe) y `create` (la cámara se
  // coloca) sea larga y no dependa de la carga de la máquina.
  await page.route('**/assets/**', async (ruta) => {
    await new Promise((r) => setTimeout(r, 700))
    await ruta.continue()
  })
  await page.goto('./?semilla=1')
  const mal: string[] = []
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate(() => ({
      esc: window.__raices?.escenaActiva(),
      c: window.__raices?.camara(),
      p: window.__raices?.personaje(),
    }))
    if (r.esc !== 'valle' && (r.c || r.p))
      mal.push(
        `escena ${String(r.esc)}: camara ${JSON.stringify(r.c)} personaje ${JSON.stringify(r.p)}`,
      )
    if (r.esc === 'valle') break
    await page.waitForTimeout(50)
  }
  expect(
    mal.slice(0, 2),
    `${mal.length} lecturas con datos antes de que el valle esté activo`,
  ).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// Capturas finales y escala de grises
// ---------------------------------------------------------------------------------------------

const VISTAS: [string, Parameters<Browser['newContext']>[0]][] = [
  ['escritorio', { viewport: { width: 1280, height: 720 } }],
  ['movil-horizontal', { ...devices['Pixel 7'], viewport: { width: 915, height: 412 } }],
  ['movil-vertical', { ...devices['Pixel 7'] }],
]

test.describe('capturas finales', () => {
  test.skip(({ isMobile }) => isMobile, 'una sola vez')
  test.setTimeout(300_000)

  test('árbol, edificio, zonas, barra de zonas y escala de grises en las tres vistas', async ({
    browser,
  }) => {
    for (const [nombre, opciones] of VISTAS) {
      const ctx = await browser.newContext({
        ...opciones,
        baseURL: test.info().project.use.baseURL ?? '',
      })
      const page = await ctx.newPage()
      const errores = espiar(page)
      await abrir(page, `./?semilla=${SEMILLA}&debug&propias=32&dinero=100000`)
      const foto = async (n: string) => {
        await page.waitForTimeout(n.startsWith('vida') ? 3000 : 900)
        await page.screenshot({ path: `capturas/m5-00-final--${n}--${nombre}.png` })
      }
      // Detrás (al norte) de un árbol, en Vida.
      const ok1 = await irA(page, 44.5, 89.2)
      expect(ok1, 'llegar al norte del árbol 44,90').toBe(true)
      for (let i = 0; i < 6; i++)
        await emitir(page, { tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 60 })
      await foto('vida-arbol')
      // Granja con zonas y edificios.
      await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
      await emitir(page, { tipo: 'PintarZona', x0: 33, y0: 80, x1: 39, y1: 91, zona: 'vivienda' })
      await emitir(page, { tipo: 'PintarZona', x0: 40, y0: 80, x1: 46, y1: 91, zona: 'almacen' })
      await emitir(page, { tipo: 'PintarZona', x0: 33, y0: 92, x1: 39, y1: 95, zona: 'cultivo' })
      await emitir(page, { tipo: 'PintarZona', x0: 40, y0: 92, x1: 46, y1: 95, zona: 'huerto' })
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
      await page.evaluate(() => window.__raices?.centrarCamara(40, 88))
      await foto('plano-zonas')
      // Terminar las obras y colocar al personaje detrás de un edificio.
      await emitir(page, { tipo: 'CambiarModo', modo: 'vida' })
      for (let i = 0; i < 3; i++) await emitir(page, { tipo: 'AvanzarTiempo', minutos: 100_000 })
      const eds = await page.evaluate(() => window.__raices?.edificios() ?? [])
      const objetivo = eds.find((e) => e.tipo === 'casa') ?? eds[0]
      expect(objetivo, 'hay un edificio').toBeTruthy()
      if (objetivo) {
        const cx = objetivo.x + objetivo.ancho / 2
        const norte = objetivo.y - 1
        const ruta = await page.evaluate(
          ([tx, ty]) => {
            const r = window.__raices
            const p = r?.personaje()
            if (!r || !p || tx === undefined || ty === undefined) return []
            const libre = (x: number, y: number) => !r.bloqueada(x, y)
            const inicio = [Math.floor(p.x), Math.floor(p.y)] as const
            const previo = new Map<string, string | null>([[inicio.join(), null]])
            const cola: (readonly [number, number])[] = [inicio]
            for (let k = 0; k < cola.length; k++) {
              const [x, y] = cola[k] as readonly [number, number]
              if (x === tx && y === ty) break
              for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ] as const) {
                const n = [x + dx, y + dy] as const
                if (previo.has(n.join()) || !libre(n[0], n[1])) continue
                previo.set(n.join(), [x, y].join())
                cola.push(n)
              }
            }
            const salida: [number, number][] = []
            for (let c: string | null | undefined = [tx, ty].join(); c; c = previo.get(c)) {
              if (!previo.has(c)) return []
              const [x, y] = c.split(',').map(Number) as [number, number]
              salida.unshift([x + 0.5, y + 0.5])
            }
            return salida
          },
          [Math.floor(cx), Math.floor(norte)],
        )
        let ok = ruta.length > 0
        for (const [x, y] of ruta) ok = ok && (await irA(page, x, y))
        expect(
          ok,
          `llegar al norte de ${JSON.stringify(objetivo)} desde ${JSON.stringify(await personaje(page))} ruta ${ruta.length}; edificios ${JSON.stringify(eds.map((e) => [e.tipo, e.x, e.y, e.ancho, e.alto]))}`,
        ).toBe(true)
        for (let i = 0; i < 6; i++)
          await emitir(page, { tipo: 'MoverPersonaje', dx: 0, dy: 1, ms: 60 })
        await foto('vida-edificio')
      }
      // Plano con la barra de zonas abierta.
      await emitir(page, { tipo: 'CambiarModo', modo: 'plano' })
      await page.evaluate(() => window.__raices?.centrarCamara(40, 88))
      await page.getByRole('button', { name: 'Zonas', exact: true }).click()
      await page
        .getByRole('group', { name: /zonas/i })
        .getByRole('button', { name: /Huerto/ })
        .click()
      await foto('barra-zonas')
      // Escala de grises de las muestras.
      const muestras = page.locator('.barra-zonas .muestra-zona')
      const n = await muestras.count()
      expect(n).toBeGreaterThanOrEqual(4)
      const lum: number[] = []
      for (let i = 0; i < n; i++) {
        const png = await muestras.nth(i).screenshot()
        const gris = await sharp(png).greyscale().png().toBuffer()
        await sharp(gris).toFile(`capturas/m5-00-final--gris-muestra${i}--${nombre}.png`)
        const { data } = await sharp(gris).raw().toBuffer({ resolveWithObject: true })
        let s = 0
        for (const v of data) s += v
        lum.push(s / data.length)
      }
      const barra = await page.locator('.barra-zonas-caja').screenshot()
      await sharp(barra).greyscale().toFile(`capturas/m5-00-final--barra-gris--${nombre}.png`)
      const cuatro = lum.slice(0, 4)
      let minDif = 255
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++)
          minDif = Math.min(minDif, Math.abs((cuatro[i] ?? 0) - (cuatro[j] ?? 0)))
      console.log(
        `GRIS ${nombre}: luminancias ${lum.map((v) => v.toFixed(1)).join(', ')}; mínima diferencia entre las 4 zonas ${minDif.toFixed(1)}/255`,
      )
      expect
        .soft(
          minDif,
          `las cuatro muestras de zona deben distinguirse en gris (${nombre}): ${lum.map((v) => v.toFixed(1)).join(', ')}`,
        )
        .toBeGreaterThan(18)
      expect(errores).toEqual([])
      await ctx.close()
    }
  })
})
