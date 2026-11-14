/** Rompedor · pasada global de M1 (integración y flujos completos). Ver docs/informes/M1-global-rompedor.md. */
import { expect, test, type CDPSession, type Page } from '@playwright/test'

interface Camara {
  zoom: number
  scrollX: number
  scrollY: number
  ancho: number
  alto: number
}

const MUNDO = 3072
const ZOOM_MAX = 2.5

function espiar(p: Page): string[] {
  const errores: string[] = []
  p.on('pageerror', (e) => errores.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
  return errores
}

const escena = (p: Page) => p.evaluate(() => window.__raices?.escenaActiva())

async function camara(page: Page): Promise<Camara> {
  const c = await page.evaluate(() => window.__raices?.camara())
  if (!c) throw new Error('Sin cámara')
  return c
}

/** Rectángulo del mundo visible. */
function visible(c: Camara) {
  const cx = c.scrollX + c.ancho / 2
  const cy = c.scrollY + c.alto / 2
  const w = c.ancho / c.zoom
  const h = c.alto / c.zoom
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, w, h }
}

async function abrir(page: Page, ruta: string): Promise<void> {
  await page.goto(ruta)
  await expect.poll(() => escena(page)).toBe('valle')
  await expect
    .poll(async () => (await page.evaluate(() => window.__raices?.camara()))?.zoom ?? 0)
    .toBeGreaterThan(0)
}

/** Gestos independientes del dispositivo: ratón en escritorio, CDP táctil en móvil. */
class Gestos {
  private cdp?: CDPSession
  constructor(
    private readonly page: Page,
    private readonly tactil: boolean,
  ) {}

  private async tocar(tipo: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) {
    this.cdp ??= await this.page.context().newCDPSession(this.page)
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
    })
  }

  private get tam() {
    return this.page.viewportSize() ?? { width: 1280, height: 720 }
  }

  /** Arrastra desde el centro un vector (dx, dy) de pantalla. */
  async arrastrar(dx: number, dy: number): Promise<void> {
    const { width, height } = this.tam
    const x = width / 2 - dx / 2
    const y = height / 2 - dy / 2
    if (this.tactil) {
      await this.tocar('touchStart', [[x, y]])
      for (let i = 1; i <= 2; i++)
        await this.tocar('touchMove', [[x + (dx * i) / 2, y + (dy * i) / 2]])
      await this.tocar('touchEnd', [])
    } else {
      await this.page.mouse.move(x, y)
      await this.page.mouse.down()
      await this.page.mouse.move(x + dx, y + dy, { steps: 2 })
      await this.page.mouse.up()
    }
  }

  /** Zoom alrededor del centro: factor > 1 acerca. */
  async zoom(acercar: boolean): Promise<void> {
    const { width, height } = this.tam
    const cx = width / 2
    const cy = height / 2
    if (this.tactil) {
      const [a, b] = acercar ? [30, 150] : [150, 30]
      await this.tocar('touchStart', [
        [cx - a, cy],
        [cx + a, cy],
      ])
      for (let i = 1; i <= 8; i++) {
        const d = a + ((b - a) * i) / 8
        await this.tocar('touchMove', [
          [cx - d, cy],
          [cx + d, cy],
        ])
      }
      await this.tocar('touchEnd', [])
    } else {
      await this.page.mouse.move(cx, cy)
      await this.page.mouse.wheel(0, acercar ? -800 : 800)
      await this.page.waitForTimeout(30)
    }
  }

  async zoomExtremo(acercar: boolean): Promise<void> {
    for (let i = 0; i < 25; i++) await this.zoom(acercar)
  }
}

test.describe('flujo completo', () => {
  test('portada → Nueva partida → gestos → girar → recarga → Nueva partida, sin errores', async ({
    page,
    isMobile,
  }) => {
    const errores = espiar(page)
    const g = new Gestos(page, isMobile)
    await page.goto('./?modo=plano')
    await expect.poll(() => escena(page)).toBe('portada')
    await page.getByRole('button', { name: 'Nueva partida' }).click()
    await expect.poll(() => escena(page)).toBe('valle')
    const semilla1 = await page.evaluate(() => window.__raices?.semilla())
    const inicial = await camara(page)

    await g.zoom(true)
    await g.arrastrar(-200, -120)
    const movida = await camara(page)
    expect(movida.zoom).toBeGreaterThan(inicial.zoom)

    // Girar: intercambiar ancho y alto (y volver).
    const v = page.viewportSize() ?? { width: 1280, height: 720 }
    await page.setViewportSize({ width: v.height, height: v.width })
    await expect.poll(async () => (await camara(page)).ancho).toBe(v.height)
    let c = await camara(page)
    let r = visible(c)
    if (r.w < MUNDO) expect(r.x0).toBeGreaterThanOrEqual(-0.5)
    if (r.h < MUNDO) expect(r.y1).toBeLessThanOrEqual(MUNDO + 0.5)
    await g.arrastrar(80, 80)
    await page.setViewportSize(v)
    await expect.poll(async () => (await camara(page)).ancho).toBe(v.width)
    c = await camara(page)
    r = visible(c)
    expect(Number.isFinite(c.zoom)).toBe(true)
    if (r.w < MUNDO) expect(r.x1).toBeLessThanOrEqual(MUNDO + 0.5)
    if (r.h < MUNDO) expect(r.y0).toBeGreaterThanOrEqual(-0.5)

    // Recarga: sin guardado (M7) se vuelve a la portada.
    await page.reload()
    await expect.poll(() => escena(page)).toBe('portada')
    await expect(page.getByRole('button', { name: 'Nueva partida' })).toBeVisible()
    await page.getByRole('button', { name: 'Nueva partida' }).click()
    await expect.poll(() => escena(page)).toBe('valle')
    const semilla2 = await page.evaluate(() => window.__raices?.semilla())
    expect(semilla2).not.toBe(semilla1)
    const nueva = await camara(page)
    expect(nueva.zoom).toBeCloseTo(inicial.zoom, 6)
    const rn = visible(nueva)
    expect((rn.x0 + rn.x1) / 2).toBeCloseTo(MUNDO / 2, 0)
    expect((rn.y0 + rn.y1) / 2).toBeCloseTo(MUNDO / 2, 0)

    // Girar después de pasar por la portada (su escena ya está parada).
    await page.setViewportSize({ width: v.height, height: v.width })
    await expect.poll(async () => (await camara(page)).ancho).toBe(v.height)
    await page.waitForTimeout(200)
    expect(errores).toEqual([])
  })

  test('?semilla inválida abre la portada y «Nueva partida» genera una semilla nueva', async ({
    page,
  }) => {
    const errores = espiar(page)
    await page.goto('./?semilla=abc')
    await expect.poll(() => escena(page)).toBe('portada')
    await page.getByRole('button', { name: 'Nueva partida' }).click()
    await expect.poll(() => escena(page)).toBe('valle')
    const s = await page.evaluate(() => window.__raices?.semilla())
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(0xffffffff)
    // La misma semilla en la URL reproduce el mismo valle con la misma cámara inicial.
    const c1 = await camara(page)
    await abrir(page, `./?semilla=${s}`)
    expect(await page.evaluate(() => window.__raices?.semilla())).toBe(s)
    const c2 = await camara(page)
    expect(c2).toEqual(c1)
    expect(errores).toEqual([])
  })
})

test.describe('se recorre todo el valle', () => {
  const casos: { nombre: string; tam: { width: number; height: number }; movil: boolean }[] = [
    { nombre: 'escritorio', tam: { width: 1280, height: 720 }, movil: false },
    { nombre: 'móvil vertical', tam: { width: 412, height: 915 }, movil: true },
    { nombre: 'móvil horizontal', tam: { width: 915, height: 412 }, movil: true },
  ]
  for (const caso of casos) {
    for (const extremo of ['máximo', 'mínimo'] as const) {
      test(`${caso.nombre}, zoom ${extremo}: se alcanzan las cuatro esquinas y los cuatro bordes`, async ({
        page,
        isMobile,
      }) => {
        test.skip(isMobile !== caso.movil, 'otro dispositivo')
        // Orquestador (M5-00): con el lienzo a DPR 2 el barrido móvil tarda ~2,9 min sin GPU; margen para carga.
        test.setTimeout(420_000)
        const errores = espiar(page)
        await page.setViewportSize(caso.tam)
        await abrir(page, './?semilla=42&modo=plano')
        const g = new Gestos(page, isMobile)
        await g.zoomExtremo(extremo === 'máximo')
        const z = (await camara(page)).zoom
        if (extremo === 'máximo') expect(z).toBeCloseTo(ZOOM_MAX, 5)
        else expect(z).toBeCloseTo(Math.min(caso.tam.width, caso.tam.height) / MUNDO, 5)

        // Direcciones de arrastre: arrastrar a la derecha muestra el borde izquierdo.
        const dirs: [number, number][] = [
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
          [-1, -1],
          [0, -1],
          [1, -1],
          [1, 0],
        ]
        const paso = Math.min(caso.tam.width, caso.tam.height) * 0.4
        for (const [dx, dy] of dirs) {
          // Desde el centro, para que cada borde exija recorrer el mundo.
          for (let i = 0; i < 40; i++) {
            const r = visible(await camara(page))
            const xOk = dx === 0 || r.w >= MUNDO || (dx > 0 ? r.x0 <= 0.5 : r.x1 >= MUNDO - 0.5)
            const yOk = dy === 0 || r.h >= MUNDO || (dy > 0 ? r.y0 <= 0.5 : r.y1 >= MUNDO - 0.5)
            if (xOk && yOk) break
            await g.arrastrar(dx * paso, dy * paso)
          }
          const r = visible(await camara(page))
          const etiqueta = `${caso.nombre} zoom ${extremo} dir ${dx},${dy}: ${JSON.stringify(r)}`
          // Dentro de límites siempre: en Plano el centro de la vista sigue dentro del valle (el borde puede pasarse
          // para centrar cualquier casilla y ver lo que tapa la interfaz).
          if (r.w < MUNDO) {
            expect(r.x0, etiqueta).toBeGreaterThanOrEqual(-0.5 - r.w / 2)
            expect(r.x1, etiqueta).toBeLessThanOrEqual(MUNDO + 0.5 + r.w / 2)
          } else {
            expect(r.x0, etiqueta).toBeLessThanOrEqual(0.5)
            expect(r.x1, etiqueta).toBeGreaterThanOrEqual(MUNDO - 0.5)
          }
          if (r.h < MUNDO) {
            expect(r.y0, etiqueta).toBeGreaterThanOrEqual(-0.5 - r.h / 2)
            expect(r.y1, etiqueta).toBeLessThanOrEqual(MUNDO + 0.5 + r.h / 2)
          } else {
            expect(r.y0, etiqueta).toBeLessThanOrEqual(0.5)
            expect(r.y1, etiqueta).toBeGreaterThanOrEqual(MUNDO - 0.5)
          }
          // Y el borde pedido se alcanza.
          if (dx > 0) expect(r.x0, etiqueta).toBeLessThanOrEqual(0.5)
          if (dx < 0) expect(r.x1, etiqueta).toBeGreaterThanOrEqual(MUNDO - 0.5)
          if (dy > 0) expect(r.y0, etiqueta).toBeLessThanOrEqual(0.5)
          if (dy < 0) expect(r.y1, etiqueta).toBeGreaterThanOrEqual(MUNDO - 0.5)
          // Volver al centro para la siguiente dirección.
          for (let i = 0; i < 40; i++) {
            const r2 = visible(await camara(page))
            const ex = (r2.x0 + r2.x1) / 2 - MUNDO / 2
            const ey = (r2.y0 + r2.y1) / 2 - MUNDO / 2
            if (Math.abs(ex) < 50 && Math.abs(ey) < 50) break
            const zz = (await camara(page)).zoom
            const k = (v: number) => Math.max(-paso, Math.min(paso, v * zz))
            await g.arrastrar(k(ex), k(ey))
          }
        }
        expect(errores).toEqual([])
      })
    }
  }
})

/** Fracción de píxeles con el color de fondo del lienzo (#3f5d3a, puro o bajo el tinte de venta). */
async function fraccionFondo(page: Page): Promise<number> {
  const b64 = (await page.screenshot()).toString('base64')
  return page.evaluate(async (datos) => {
    const bmp = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${datos}`)).blob(),
    )
    const cv = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = cv.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    const cerca = (i: number, r: number, g: number, b: number) =>
      Math.abs((d[i] ?? 0) - r) < 6 &&
      Math.abs((d[i + 1] ?? 0) - g) < 6 &&
      Math.abs((d[i + 2] ?? 0) - b) < 6
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (cerca(i, 63, 93, 58) || cerca(i, 53, 78, 49)) n++
    return n / (bmp.width * bmp.height)
  }, b64)
}

test('horneado: con zoom máximo en las cuatro esquinas el terreno cubre la pantalla', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(180_000)
  await abrir(page, './?semilla=42&modo=plano')
  const g = new Gestos(page, isMobile)
  await g.zoomExtremo(true)
  for (const [dx, dy] of [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const) {
    for (let i = 0; i < 40; i++) {
      const r0 = visible(await camara(page))
      const xOk = dx > 0 ? r0.x0 <= 0.5 : r0.x1 >= MUNDO - 0.5
      const yOk = dy > 0 ? r0.y0 <= 0.5 : r0.y1 >= MUNDO - 0.5
      if (xOk && yOk) break
      await g.arrastrar(dx * 300, dy * 300)
    }
    await page.waitForTimeout(100)
    const cam = await camara(page)
    const r = visible(cam)
    // El fondo permitido es el de lo que la vista pasa del borde (reservas de la interfaz), más el margen de siempre.
    const paso =
      (Math.max(0, -r.x0, r.x1 - MUNDO) * cam.zoom) / cam.ancho +
      (Math.max(0, -r.y0, r.y1 - MUNDO) * cam.zoom) / cam.alto
    // El desbordamiento tiene cota: el centro de la vista sigue dentro del valle (a lo sumo media vista fuera).
    expect(cam.scrollX + cam.ancho / 2, JSON.stringify(r)).toBeGreaterThanOrEqual(-0.5)
    expect(cam.scrollX + cam.ancho / 2, JSON.stringify(r)).toBeLessThanOrEqual(MUNDO + 0.5)
    expect(cam.scrollY + cam.alto / 2, JSON.stringify(r)).toBeGreaterThanOrEqual(-0.5)
    expect(cam.scrollY + cam.alto / 2, JSON.stringify(r)).toBeLessThanOrEqual(MUNDO + 0.5)
    expect(Math.max(0, -r.x0, r.x1 - MUNDO)).toBeLessThanOrEqual(r.w / 2 + 0.5)
    expect(Math.max(0, -r.y0, r.y1 - MUNDO)).toBeLessThanOrEqual(r.h / 2 + 0.5)
    expect(await fraccionFondo(page), JSON.stringify(r)).toBeLessThan(0.02 + paso)
  }
})

/** En Vida la vista entera está dentro del valle (o centrada en el eje en que el valle cabe). */
async function vistaDentroDelValle(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.guiando)).toBe(false)
  const cam = await camara(page)
  const r = visible(cam)
  const eje = (a: number, b: number, w: number) => {
    if (w < MUNDO) {
      expect(a).toBeGreaterThanOrEqual(-0.5)
      expect(b).toBeLessThanOrEqual(MUNDO + 0.5)
    } else expect((a + b) / 2).toBeCloseTo(MUNDO / 2, 0)
  }
  eje(r.x0, r.x1, r.w)
  eje(r.y0, r.y1, r.h)
}

test.describe('Vida tras el Plano: la vista vuelve a quedar dentro del valle', () => {
  test('con un panel abierto en una esquina del Plano', async ({ page }) => {
    const errores = espiar(page)
    await abrir(page, './?semilla=42&debug&modo=plano')
    await page.evaluate(() => {
      window.__raices?.seleccionar(0)
      window.__raices?.centrarCamara(0, 0)
    })
    await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.guiando)).toBe(false)
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
    await vistaDentroDelValle(page)
    expect(errores).toEqual([])
  })

  test('con los márgenes que dejó el Plano (sin panel)', async ({ page }) => {
    const errores = espiar(page)
    await abrir(page, './?semilla=42&debug&modo=plano')
    await page.evaluate(() => {
      window.__raices?.seleccionar(0)
      window.__raices?.centrarCamara(0, 95)
    })
    await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.guiando)).toBe(false)
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
    await vistaDentroDelValle(page)
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'plano' }))
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    await vistaDentroDelValle(page)
    expect(errores).toEqual([])
  })
})

test('contador de fps: sigue en la esquina y legible tras zoom y giro', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000)
  const errores = espiar(page)
  await abrir(page, './?semilla=42&debug&modo=plano')
  const g = new Gestos(page, isMobile)
  await g.zoomExtremo(true)
  const v = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.setViewportSize({ width: v.height, height: v.width })
  await expect.poll(async () => (await camara(page)).ancho).toBe(v.height)
  await g.arrastrar(100, 50)
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => window.__raices?.contadorFps())).toMatch(/^\d+ fps$/)
  // El fondo del contador (negro al 67 %) debe estar en la esquina superior izquierda.
  const clip = { x: 10, y: 10, width: 4, height: 4 }
  const png = await page.screenshot({ clip })
  const media = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const cv = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = cv.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    let s = 0
    for (let i = 0; i < d.length; i += 4) s += ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0)) / 3
    return s / (d.length / 4)
  }, png.toString('base64'))
  expect(media).toBeLessThan(70)
  expect(errores).toEqual([])
})

test('reiniciarValle: la cámara vuelve al encuadre inicial y los gestos no se duplican', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000)
  const errores = espiar(page)
  await abrir(page, './?semilla=42&debug&modo=plano')
  const g = new Gestos(page, isMobile)
  const inicial = await camara(page)
  for (let k = 0; k < 3; k++) {
    await g.zoom(true)
    await g.arrastrar(150, 90)
    await page.evaluate(() => window.__raices?.reiniciarValle())
    await expect.poll(() => escena(page)).toBe('valle')
    await expect.poll(async () => (await camara(page)).zoom).toBeCloseTo(inicial.zoom, 6)
    const c = await camara(page)
    expect(c.scrollX).toBeCloseTo(inicial.scrollX, 3)
    expect(c.scrollY).toBeCloseTo(inicial.scrollY, 3)
  }
  // Un arrastre de 100 px desplaza 100/zoom en el mundo, no el doble (oyentes duplicados).
  const antes = await camara(page)
  await g.arrastrar(-100, 0)
  const despues = await camara(page)
  expect(despues.scrollX - antes.scrollX).toBeCloseTo(100 / antes.zoom, 0)
  // Y redimensionar tras el reinicio no deja la cámara fuera.
  await page.setViewportSize({ width: 700, height: 500 })
  await expect.poll(async () => (await camara(page)).ancho).toBe(700)
  const r = visible(await camara(page))
  expect(r.x0).toBeGreaterThanOrEqual(-0.5)
  expect(r.y0).toBeGreaterThanOrEqual(-0.5)
  expect(errores).toEqual([])
})

test('DPR alto: el lienzo se dibuja a la resolución del dispositivo (nitidez)', async ({
  browser,
}) => {
  // M5-00 (issue #11): el criterio aprobado es lienzo = CSS × min(DPR, 2); a DPR 3 el tope es 2.
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL ?? '',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await abrir(page, './?semilla=42&debug')
  const r = await page.evaluate(() => {
    const cv = document.querySelector('canvas') as HTMLCanvasElement
    return { w: cv.width, cssW: cv.clientWidth, dpr: window.devicePixelRatio }
  })
  await ctx.close()
  const factor = Math.min(r.dpr, 2)
  expect(r.w, JSON.stringify(r)).toBeGreaterThanOrEqual(Math.floor(r.cssW * factor * 0.99))
  expect(r.w, JSON.stringify(r)).toBeLessThanOrEqual(Math.ceil(r.cssW * factor * 1.01))
})

test('rendimiento: fps medias durante 5 s de arrastre y zoom continuos (solo registro)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'escritorio')
  await abrir(page, './?semilla=42&modo=plano')
  const reposo = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        let n = 0
        const t0 = performance.now()
        const f = () => {
          n++
          if (performance.now() - t0 < 2000) requestAnimationFrame(f)
          else res((n * 1000) / (performance.now() - t0))
        }
        requestAnimationFrame(f)
      }),
  )
  await page.evaluate(() => {
    const w = window as unknown as { __cuadros: number; __contar: boolean }
    w.__cuadros = 0
    w.__contar = true
    const bucle = () => {
      if (!w.__contar) return
      w.__cuadros++
      requestAnimationFrame(bucle)
    }
    requestAnimationFrame(bucle)
  })
  const t0 = Date.now()
  const muestras: number[] = []
  await page.mouse.move(640, 360)
  let i = 0
  while (Date.now() - t0 < 5000) {
    if (i % 10 < 7) {
      await page.mouse.down()
      await page.mouse.move(640 + (i % 2 ? 120 : -120), 360 + (i % 2 ? 60 : -60), { steps: 3 })
      await page.mouse.up()
    } else {
      await page.mouse.move(640, 360)
      await page.mouse.wheel(0, i % 3 ? -200 : 200)
    }
    if (i % 5 === 0) muestras.push((await page.evaluate(() => window.__raices?.fps())) ?? 0)
    i++
  }
  const ms = Date.now() - t0
  const cuadros = await page.evaluate(() => {
    const w = window as unknown as { __cuadros: number; __contar: boolean }
    w.__contar = false
    return w.__cuadros
  })
  const raf = (cuadros * 1000) / ms
  const phaser = muestras.reduce((a, b) => a + b, 0) / Math.max(1, muestras.length)
  const linea = `reposo rAF ${reposo.toFixed(1)} · gestos: fps rAF ${raf.toFixed(1)} · fps Phaser (media de ${muestras.length}) ${phaser.toFixed(1)} · ${i} gestos en ${ms} ms`
  console.log(linea)
  info.annotations.push({ type: 'fps', description: linea })
  expect(raf).toBeGreaterThan(0)
})
