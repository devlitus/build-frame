/**
 * Rompedor · pasada global de M4 (Zonas y construcción). Lo que se rompe ENTRE historias:
 * - partida completa por la interfaz (escritorio y móvil): comprar la primera parcela con la
 *   economía real, pintar zonas, construir casa, caja y cobertizo, pasar días con y sin desmayo,
 *   mover la casa y la caja, demoler la caja, cancelar una obra y repintar alrededor; en cada paso
 *   HUD, ganchos del núcleo y dibujo cuadran;
 * - el aviso del desmayo cuando ya hay casa;
 * - comprar parcelas con obras activas, borrar la zona de un edificio movido, Vida con cada panel
 *   abierto, exclusión mutua de los paneles;
 * - el mismo recorrido solo con teclado (escritorio);
 * - granja llena: fugas tras muchas acciones, fps y contexto WebGL con todo a la vez;
 * - capturas finales `capturas/m4-final--*.png` de la granja de ejemplo.
 */
import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test'
import { devices } from '@playwright/test'
import sharp from 'sharp'

type Punto = { x: number; y: number }
type Rect = { x0: number; y0: number; x1: number; y1: number }
type Vista = {
  id: number
  tipo: string
  x: number
  y: number
  ancho: number
  alto: number
  enObra: boolean
  diasCartel: number | undefined
}

/** Semilla 42: la parcela 32 (F3, prado) es la de la aparición y cuesta 540 con 1.100 de ahorros. */
const SEMILLA = 42
const PARCELA = 32
/** Casillas de la parcela 32: x 32..47, y 80..95; la aparición está en (47, 92). */
const VIVIENDA: Rect = { x0: 33, y0: 80, x1: 39, y1: 85 }
const ALMACEN: Rect = { x0: 40, y0: 80, x1: 46, y1: 85 }
const TAM: Record<string, [number, number]> = {
  casa: [4, 3],
  'caja-envio': [1, 1],
  cobertizo: [3, 2],
}
const ZONAS_DE: Record<string, string[]> = {
  casa: ['vivienda'],
  'caja-envio': ['vivienda', 'almacen'],
  cobertizo: ['almacen'],
}

const esMovil = () => test.info().project.name.startsWith('movil')
const region = (page: Page, nombre: string | RegExp) => page.getByRole('region', { name: nombre })
const boton = (l: Locator | Page, nombre: string | RegExp) =>
  l.getByRole('button', { name: nombre, exact: typeof nombre === 'string' })
const barra = (page: Page) => page.getByRole('group', { name: 'Pincel de zonas' })

async function abrir(page: Page, query: string): Promise<string[]> {
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

async function camaraQuieta(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__raices?.camara()?.guiando), { timeout: 15_000 })
    .toBe(false)
}

async function centrar(page: Page, cx: number, cy: number): Promise<void> {
  await camaraQuieta(page)
  await page.evaluate(({ cx, cy }) => window.__raices?.centrarCamara(cx, cy), { cx, cy })
  await page.waitForTimeout(250)
}

const edificios = (page: Page): Promise<Vista[]> =>
  page.evaluate(() => window.__raices?.edificios() ?? [])
const dinero = (page: Page) => page.evaluate(() => window.__raices?.dinero())
const materiales = (page: Page) => page.evaluate(() => window.__raices?.materiales())
const reloj = (page: Page) => page.evaluate(() => window.__raices?.reloj())
const personaje = (page: Page) => page.evaluate(() => window.__raices?.personaje())
const silueta = (page: Page) => page.evaluate(() => window.__raices?.construccion()?.silueta)
const zonaDe = (page: Page, x: number, y: number) =>
  page.evaluate(({ x, y }) => window.__raices?.zonaDe(x, y), { x, y })

/** Formato del HUD: punto de millar. */
const cifra = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Lo que el test espera del núcleo, contrastado con el HUD, los ganchos y el dibujo. */
interface Modelo {
  dinero: number
  madera: number
  piedra: number
  dia: number
  edificios: { id: number; tipo: string; x: number; y: number; diaFin: number | null }[]
}

async function cuadra(page: Page, m: Modelo, paso: string): Promise<void> {
  await expect.poll(() => dinero(page), { message: `${paso}: dinero` }).toBe(m.dinero)
  expect(await materiales(page), `${paso}: materiales`).toEqual({
    madera: m.madera,
    piedra: m.piedra,
  })
  const hudD = page.getByRole('group', { name: 'Dinero' })
  await expect(hudD, `${paso}: HUD dinero`).toHaveAttribute('data-dinero', String(m.dinero))
  await expect(hudD.locator('.dinero-cifra'), `${paso}: cifra`).toHaveText(cifra(m.dinero))
  const hudM = page.getByRole('group', { name: 'Materiales' })
  await expect(hudM, `${paso}: HUD madera`).toHaveAttribute('data-madera', String(m.madera))
  await expect(hudM, `${paso}: HUD piedra`).toHaveAttribute('data-piedra', String(m.piedra))
  expect((await reloj(page))?.dia, `${paso}: día`).toBe(m.dia)
  const esperado = m.edificios
    .map((e) => ({
      id: e.id,
      tipo: e.tipo,
      x: e.x,
      y: e.y,
      enObra: e.diaFin !== null,
      diasCartel: e.diaFin === null ? undefined : e.diaFin - m.dia,
    }))
    .sort((a, b) => a.id - b.id)
  await expect
    .poll(
      async () =>
        (await edificios(page))
          .map((v) => ({
            id: v.id,
            tipo: v.tipo,
            x: v.x,
            y: v.y,
            enObra: v.enObra,
            diasCartel: v.diasCartel,
          }))
          .sort((a, b) => a.id - b.id),
      { message: `${paso}: dibujo de edificios` },
    )
    .toEqual(esperado)
}

let cdp: CDPSession | undefined
test.beforeEach(() => {
  cdp = undefined
})

async function pulsar(page: Page, p: Punto): Promise<void> {
  if (esMovil()) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
}

async function apuntar(page: Page, p: Punto): Promise<void> {
  if (esMovil()) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.move(p.x, p.y)
}

async function arrastrar(page: Page, a: Punto, b: Punto): Promise<void> {
  const pasos = 6
  const en = (i: number): Punto => ({
    x: a.x + ((b.x - a.x) * i) / pasos,
    y: a.y + ((b.y - a.y) * i) / pasos,
  })
  if (esMovil()) {
    const sesion = (cdp ??= await page.context().newCDPSession(page))
    const toque = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', p?: Punto) =>
      sesion.send('Input.dispatchTouchEvent', {
        type: tipo,
        touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [],
      })
    await toque('touchStart', a)
    for (let i = 1; i <= pasos; i++) await toque('touchMove', en(i))
    await toque('touchEnd')
  } else {
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    for (let i = 1; i <= pasos; i++) await page.mouse.move(en(i).x, en(i).y)
    await page.mouse.up()
  }
}

/** Punto de pantalla de la casilla si cae sobre el lienzo (no tapado por la interfaz). */
async function puntoLibre(page: Page, cx: number, cy: number): Promise<Punto | undefined> {
  return page.evaluate(
    ({ cx, cy }) => {
      const p = window.__raices?.puntoClicCasilla(cx, cy)
      if (!p || p.x < 2 || p.y < 2 || p.x > innerWidth - 2 || p.y > innerHeight - 2)
        return undefined
      return document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS' ? p : undefined
    },
    { cx, cy },
  )
}

/** Pinta (o borra) el rectángulo con el pincel por la interfaz: elige herramienta y arrastra. */
async function pintar(page: Page, herramienta: string, r: Rect): Promise<void> {
  if (!(await barra(page).isVisible())) {
    await boton(page, 'Zonas').click()
    await expect(barra(page)).toBeVisible()
  }
  await boton(barra(page), herramienta).click()
  await centrar(page, Math.round((r.x0 + r.x1) / 2), Math.round((r.y0 + r.y1) / 2))
  const a = await puntoLibre(page, r.x0, r.y0)
  const b = await puntoLibre(page, r.x1, r.y1)
  if (!a || !b) {
    await page.screenshot({ path: 'test-results/dbg-pintar.png' })
    const info = await page.evaluate(
      (r) => ({
        a: window.__raices?.puntoClicCasilla(r.x0, r.y0),
        b: window.__raices?.puntoClicCasilla(r.x1, r.y1),
        cam: window.__raices?.camara(),
        w: innerWidth,
        h: innerHeight,
      }),
      r,
    )
    throw new Error(
      `No se ven las esquinas de ${JSON.stringify(r)} para pintar: ${JSON.stringify(info)}`,
    )
  }
  await arrastrar(page, a, b)
  await page.waitForTimeout(150)
}

/** Sitios válidos de `tipo` dentro de `area`, visibles, ordenados por cercanía a `cerca`. */
async function sitios(
  page: Page,
  tipo: string,
  area: Rect,
  cerca: Punto,
): Promise<{ x: number; y: number; punto: Punto }[]> {
  await camaraQuieta(page)
  const [w, h] = TAM[tipo] ?? [1, 1]
  return page.evaluate(
    ({ tipo, area, cerca, w, h }) => {
      const r = window.__raices
      const l: { x: number; y: number; punto: Punto; d: number }[] = []
      for (let y = area.y0; y <= area.y1; y++) {
        for (let x = area.x0; x <= area.x1; x++) {
          if (!r?.colocacion(tipo, x, y)?.valida) continue
          const p = r.puntoClicCasilla(x + Math.floor((w - 1) / 2), y + Math.floor((h - 1) / 2))
          if (!p || p.x < 2 || p.y < 2 || p.x > innerWidth - 2 || p.y > innerHeight - 2) continue
          if (document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS') continue
          l.push({ x, y, punto: p, d: Math.hypot(x - cerca.x, y - cerca.y) })
        }
      }
      return l.sort((a, b) => a.d - b.d)
    },
    { tipo, area, cerca, w, h },
  )
}

const NOMBRE: Record<string, string> = {
  casa: 'Casa',
  'caja-envio': 'Caja de envío',
  cobertizo: 'Cobertizo',
}

/** Construye por la interfaz (catálogo, silueta, «Construir aquí», confirmación). */
async function construir(
  page: Page,
  tipo: string,
  area: Rect,
  cerca: Punto,
): Promise<{ x: number; y: number }> {
  const panelC = region(page, 'Construir')
  if (!(await panelC.isVisible())) {
    await boton(page, 'Construir').click()
    await expect(panelC).toBeVisible()
  }
  await panelC.getByRole('button', { name: new RegExp(`^${NOMBRE[tipo]}`) }).click()
  await expect.poll(() => silueta(page)).toBeDefined()
  await centrar(page, Math.round((area.x0 + area.x1) / 2), Math.round((area.y0 + area.y1) / 2))
  const [s] = await sitios(page, tipo, area, cerca)
  if (!s) {
    await page.screenshot({ path: 'test-results/dbg-construir.png' })
    throw new Error(`Sin sitio visible para ${tipo}`)
  }
  await apuntar(page, s.punto)
  await expect.poll(() => silueta(page)).toMatchObject({ x: s.x, y: s.y, valida: true })
  await boton(panelC, 'Construir aquí').click()
  await expect(panelC.getByText(`¿Construir ${NOMBRE[tipo]}?`)).toBeVisible()
  await boton(panelC, 'Construir').click()
  await expect(panelC.getByText(`¿Construir ${NOMBRE[tipo]}?`)).toHaveCount(0)
  return { x: s.x, y: s.y }
}

async function tocarEdificio(page: Page, id: number): Promise<void> {
  await camaraQuieta(page)
  const v = (await edificios(page)).find((e) => e.id === id)
  if (!v) throw new Error(`No se ve el edificio ${id}`)
  await centrar(page, v.x + Math.floor(v.ancho / 2), v.y + Math.floor(v.alto / 2))
  let p: Punto | undefined
  for (let y = v.y; y < v.y + v.alto && !p; y++) {
    for (let x = v.x; x < v.x + v.ancho && !p; x++) p = await puntoLibre(page, x, y)
  }
  if (!p) throw new Error(`El edificio ${id} está tapado`)
  // Tras confirmar algo, el lienzo ignora 400 ms los toques cercanos (antidoble toque).
  await page.waitForTimeout(450)
  await pulsar(page, p)
  await expect.poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id)).toBe(id)
}

/** Esquinas candidatas para mover `id`: huella libre (o suya) y con la zona del edificio, visibles. */
async function destinosMover(page: Page, id: number, tipo: string, area: Rect, cerca: Punto) {
  const [w, h] = TAM[tipo] ?? [1, 1]
  const yo = (await edificios(page)).find((e) => e.id === id) as Vista
  const candidatos = await page.evaluate(
    ({ area, w, h, yo, zonas, cerca }) => {
      const r = window.__raices
      const propia = (x: number, y: number) =>
        x >= yo.x && x < yo.x + yo.ancho && y >= yo.y && y < yo.y + yo.alto
      const l: { x: number; y: number; punto: Punto; d: number }[] = []
      for (let y = area.y0; y <= area.y1 - h + 1; y++) {
        for (let x = area.x0; x <= area.x1 - w + 1; x++) {
          if (x === yo.x && y === yo.y) continue
          let ok = true
          for (let cy = y; cy < y + h && ok; cy++) {
            for (let cx = x; cx < x + w && ok; cx++) {
              const z = r?.zonaDe(cx, cy)
              if (!z || !zonas.includes(z)) ok = false
              else if (!propia(cx, cy)) {
                // Lo único que puede faltar es pagar la caja (mover es gratis).
                const v = r?.colocacion('caja-envio', cx, cy)
                if (!v?.valida && !/insuficientes$/.test(v?.motivo ?? '')) ok = false
              }
            }
          }
          if (!ok) continue
          const p = r?.puntoClicCasilla(x + Math.floor((w - 1) / 2), y + Math.floor((h - 1) / 2))
          if (!p || p.x < 2 || p.y < 2 || p.x > innerWidth - 2 || p.y > innerHeight - 2) continue
          if (document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS') continue
          l.push({ x, y, punto: p, d: Math.hypot(x - cerca.x, y - cerca.y) })
        }
      }
      return l.sort((a, b) => a.d - b.d)
    },
    { area, w, h, yo, zonas: ZONAS_DE[tipo] ?? [], cerca },
  )
  return candidatos
}

/**
 * Mueve un edificio por la interfaz (panel, Mover, silueta, «Mover aquí»). Los candidatos son
 * esquinas cuya huella está libre (cada casilla vale para una caja o es del propio edificio) y
 * con la zona del edificio; el veredicto final es el de la silueta.
 */
async function mover(page: Page, id: number, tipo: string, area: Rect, cerca: Punto) {
  await tocarEdificio(page, id)
  await boton(region(page, NOMBRE[tipo] as string), 'Mover').click()
  const pm = region(page, 'Mover edificio')
  await expect(pm).toBeVisible()
  await centrar(page, Math.round((area.x0 + area.x1) / 2), Math.round((area.y0 + area.y1) / 2))
  const candidatos = await destinosMover(page, id, tipo, area, cerca)
  for (const s of candidatos) {
    await apuntar(page, s.punto)
    await expect.poll(() => silueta(page)).toMatchObject({ x: s.x, y: s.y })
    if (!(await silueta(page))?.valida) continue
    await boton(pm, 'Mover aquí').click()
    await expect(pm).toHaveCount(0)
    return { x: s.x, y: s.y }
  }
  throw new Error(`Sin destino para mover ${tipo}`)
}

async function aVida(page: Page): Promise<void> {
  await boton(page, /Cambiar al Modo Vida/).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
}

async function aPlano(page: Page): Promise<void> {
  await boton(page, /Cambiar al Modo Plano/).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
}

/** Un desmayo: avance enorme en Vida (el reloj se corta en las 02:00 y pasa al día siguiente). */
async function desmayo(page: Page): Promise<void> {
  const d = (await reloj(page))?.dia ?? 0
  await page.evaluate(() => window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 }))
  await expect.poll(async () => (await reloj(page))?.dia).toBe(d + 1)
}

/** Todas las casillas de la huella tienen una zona compatible con el edificio. */
async function zonaCompatible(page: Page, e: { tipo: string; x: number; y: number }) {
  const [w, h] = TAM[e.tipo] ?? [1, 1]
  for (let y = e.y; y < e.y + h; y++) {
    for (let x = e.x; x < e.x + w; x++) {
      expect(ZONAS_DE[e.tipo], `zona bajo ${e.tipo} en ${x},${y}`).toContain(
        await zonaDe(page, x, y),
      )
    }
  }
}

test.describe('M4 global · partida completa por la interfaz', () => {
  test('primera parcela, zonas, casa + caja + cobertizo, días, mover, demoler, cancelar y repintar: todo cuadra', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const errores = await abrir(page, `?semilla=${SEMILLA}&debug`)
    const m: Modelo = { dinero: 1100, madera: 80, piedra: 20, dia: 1, edificios: [] }
    // En móvil vertical la parcela de la aparición (fila inferior) queda bajo el panel Construir
    // (fallo aparte, «[S3] móvil vertical…»): ahí se juega en la 24 (fila de encima, 700 monedas).
    const dy = esMovil() ? -16 : 0
    const dx = esMovil() ? -32 : 0
    const PARC = esMovil() ? 24 : PARCELA
    const PRECIO = esMovil() ? 700 : 540
    const mueve = (r: Rect): Rect => ({
      x0: r.x0 + dx,
      x1: r.x1 + dx,
      y0: r.y0 + dy,
      y1: r.y1 + dy,
    })
    const VIVIENDA_ = mueve(VIVIENDA)
    const ALMACEN_ = mueve(ALMACEN)
    const cerca = (x: number, y: number) => ({ x: x + dx, y: y + dy })
    await cuadra(page, m, 'inicio')

    // 1. Primera parcela, con la economía real.
    await aPlano(page)
    await centrar(page, 40 + dx, 88 + dy)
    const pp = await page.evaluate((i) => window.__raices?.puntoClicParcela(i), PARC)
    if (!pp) throw new Error('la parcela no se ve')
    await pulsar(page, pp)
    await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBe(PARC)
    const pParcela = region(page, /Parcela/)
    await boton(pParcela, `Comprar por ${PRECIO} monedas`).click()
    await boton(pParcela, 'Comprar').click()
    m.dinero = 1100 - PRECIO
    await cuadra(page, m, 'compra')
    expect(await page.evaluate((i) => window.__raices?.estadoVisual(i), PARC)).toBe('propia')
    await boton(pParcela, 'Cerrar el panel de la parcela').click()

    // 2. Zonas.
    await pintar(page, 'Vivienda', VIVIENDA_)
    await pintar(page, 'Almacén', ALMACEN_)
    await boton(barra(page), 'Listo').click()
    for (const [x, y, z] of [
      [VIVIENDA_.x0, VIVIENDA_.y0, 'vivienda'],
      [VIVIENDA_.x1, VIVIENDA_.y1, 'vivienda'],
      [ALMACEN_.x0, ALMACEN_.y0, 'almacen'],
      [ALMACEN_.x1, ALMACEN_.y1, 'almacen'],
    ] as const) {
      expect(await zonaDe(page, x, y), `zona en ${x},${y}`).toBe(z)
    }
    await cuadra(page, m, 'zonas')

    // 3. Casa, caja y cobertizo.
    const casa = await construir(page, 'casa', VIVIENDA_, cerca(34, 82))
    m.edificios.push({ id: 1, tipo: 'casa', ...casa, diaFin: 4 })
    await cuadra(page, m, 'casa')
    const caja = await construir(page, 'caja-envio', ALMACEN_, cerca(46, 87))
    m.edificios.push({ id: 2, tipo: 'caja-envio', ...caja, diaFin: 2 })
    m.dinero -= 50
    m.madera -= 20
    await cuadra(page, m, 'caja')
    const cob = await construir(page, 'cobertizo', ALMACEN_, cerca(41, 82))
    m.edificios.push({ id: 3, tipo: 'cobertizo', ...cob, diaFin: 3 })
    m.dinero -= 300
    m.madera -= 50
    m.piedra -= 10
    await cuadra(page, m, 'cobertizo')
    await boton(region(page, 'Construir'), 'Listo').click()
    expect(m.dinero).toBe(1100 - PRECIO - 350)

    // 4. Pasar el tiempo: sin desmayo (el día no cambia) y con desmayos.
    await aVida(page)
    const r0 = await reloj(page)
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 600 }))
    await expect
      .poll(async () => (await reloj(page))?.minutoDelDia)
      .toBe((r0?.minutoDelDia ?? 0) + 600)
    await cuadra(page, m, 'sin desmayo')
    for (const dia of [2, 3]) {
      await desmayo(page)
      m.dia = dia
      for (const e of m.edificios) if (e.diaFin !== null && e.diaFin <= dia) e.diaFin = null
      await cuadra(page, m, `desmayo día ${dia}`)
      // La casa sigue en obra: se despierta en la aparición.
      expect(await personaje(page)).toMatchObject({ x: 47.5, y: 92.5 })
    }
    await desmayo(page)
    m.dia = 4
    for (const e of m.edificios) e.diaFin = null
    await cuadra(page, m, 'desmayo día 4')
    expect(await personaje(page)).toMatchObject({ x: casa.x + 2.5, y: casa.y + 3.5 })

    // 5. Mover la casa y la caja (gratis).
    await aPlano(page)
    const casa2 = await mover(page, 1, 'casa', VIVIENDA_, cerca(36, 85))
    expect(casa2).not.toEqual(casa)
    Object.assign(m.edificios[0] as object, casa2)
    await cuadra(page, m, 'casa movida')
    // El desmayo con la casa movida despierta en la puerta nueva.
    await aVida(page)
    await desmayo(page)
    m.dia = 5
    await cuadra(page, m, 'desmayo con la casa movida')
    expect(await personaje(page)).toMatchObject({ x: casa2.x + 2.5, y: casa2.y + 3.5 })
    await aPlano(page)
    const caja2 = await mover(page, 2, 'caja-envio', VIVIENDA_, cerca(39, 81))
    Object.assign(m.edificios[1] as object, caja2)
    await cuadra(page, m, 'caja movida')

    // 6. Demoler la caja (reembolso de la mitad, hacia abajo).
    await tocarEdificio(page, 2)
    const pCaja = region(page, 'Caja de envío')
    await boton(pCaja, 'Demoler').click()
    await expect(pCaja.getByRole('alertdialog')).toContainText(
      'Recuperas: 25 monedas y 10 de madera',
    )
    await boton(pCaja, 'Sí, demoler').click()
    m.edificios = m.edificios.filter((e) => e.id !== 2)
    m.dinero += 25
    m.madera += 10
    await cuadra(page, m, 'caja demolida')

    // 7. Cancelar una obra (devuelve todo).
    const caja3 = await construir(page, 'caja-envio', ALMACEN_, cerca(46, 87))
    await boton(region(page, 'Construir'), 'Listo').click()
    m.edificios.push({ id: 4, tipo: 'caja-envio', ...caja3, diaFin: m.dia + 1 })
    m.dinero -= 50
    m.madera -= 20
    await cuadra(page, m, 'obra nueva')
    await tocarEdificio(page, 4)
    const pObra = region(page, 'Caja de envío')
    await boton(pObra, 'Cancelar obra').click()
    await boton(pObra, 'Sí, cancelar obra').click()
    m.edificios = m.edificios.filter((e) => e.id !== 4)
    m.dinero += 50
    m.madera += 20
    await cuadra(page, m, 'obra cancelada')

    // 8. Repintar alrededor de los edificios: borrar y pintar cultivo no toca lo que hay debajo.
    const todo: Rect = mueve({ x0: 33, y0: 80, x1: 46, y1: 85 })
    await pintar(page, 'Borrar', todo)
    await pintar(page, 'Cultivo', todo)
    await boton(barra(page), 'Listo').click()
    for (const e of m.edificios) await zonaCompatible(page, e)
    // Fuera de los edificios, cultivo.
    const ocupada = (x: number, y: number) =>
      m.edificios.some((e) => {
        const [w, h] = TAM[e.tipo] ?? [1, 1]
        return x >= e.x && x < e.x + w && y >= e.y && y < e.y + h
      })
    for (const [x, y] of [
      [todo.x0, todo.y0],
      [todo.x1, todo.y1],
      [todo.x0, todo.y1],
      [todo.x1, todo.y0],
    ] as const) {
      if (!ocupada(x, y)) expect(await zonaDe(page, x, y), `${x},${y}`).toBe('cultivo')
    }
    await cuadra(page, m, 'final')
    // El patrimonio no creció: dinero + materiales + lo pagado por lo que sigue en pie ≤ inicio − parcela.
    expect(m.dinero + m.madera + m.piedra + 0 + 300 + 50 + 10).toBeLessThanOrEqual(
      1100 + 80 + 20 - PRECIO,
    )
    expect(errores).toEqual([])
  })

  test('[S3] con la casa terminada, el aviso del desmayo dice «Despiertas en la entrada del valle» aunque despiertas en la casa', async ({
    page,
  }) => {
    const errores = await abrir(page, `?semilla=${SEMILLA}&debug&modo=plano&propias=${PARCELA}`)
    await page.evaluate(
      ({ v }) => window.__raices?.emitir({ tipo: 'PintarZona', ...v, zona: 'vivienda' }),
      { v: VIVIENDA },
    )
    await centrar(page, 36, 84)
    const [s] = await sitios(page, 'casa', VIVIENDA, { x: 34, y: 82 })
    if (!s) throw new Error('sin sitio')
    await page.evaluate(
      ({ s }) =>
        window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: 'casa', x: s.x, y: s.y }),
      { s },
    )
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    for (let i = 0; i < 3; i++) await desmayo(page)
    const yo = await personaje(page)
    // Despierta en la puerta de la casa, lejos de la entrada del valle (47.5, 92.5)…
    expect(yo).toMatchObject({ x: s.x + 2.5, y: s.y + 3.5 })
    expect(Math.hypot((yo?.x ?? 0) - 47.5, (yo?.y ?? 0) - 92.5)).toBeGreaterThan(5)
    // …pero el aviso dice otra cosa.
    const aviso = page.locator('.aviso')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('Te quedaste dormido')
    await expect(aviso).not.toContainText('entrada del valle')
    expect(errores).toEqual([])
  })
})

test.describe('M4 global · interacciones entre sistemas', () => {
  // Parcela central 14 (x 32..47, y 32..47), que se ve entera con cualquier panel; la vecina de abajo es la 20.
  const PI = 14
  const VECINA = 20
  const IV: Rect = { x0: 33, y0: 32, x1: 39, y1: 41 }
  const IA: Rect = { x0: 40, y0: 32, x1: 46, y1: 41 }
  const Q = `?semilla=${SEMILLA}&debug&modo=plano&dinero=5000&propias=${PI}`
  const abrirI = async (page: Page): Promise<string[]> => {
    const e = await abrir(page, Q)
    await centrar(page, 40, 38)
    return e
  }
  const emitir = (page: Page, c: Record<string, unknown>) =>
    page.evaluate((c) => window.__raices?.emitir(c as { tipo: string }), c)

  test('comprar parcelas con obras activas: la obra sigue, cobra una vez, y se puede construir a caballo de las dos', async ({
    page,
  }) => {
    const errores = await abrirI(page)
    await emitir(page, { tipo: 'PintarZona', ...IA, zona: 'almacen' })
    const [s] = await sitios(page, 'cobertizo', IA, { x: 41, y: 34 })
    if (!s) throw new Error('sin sitio')
    await emitir(page, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: s.x, y: s.y })
    await expect.poll(async () => (await edificios(page)).length).toBe(1)
    const d0 = (await dinero(page)) ?? 0
    // Parcela 20 (debajo de la 14), por la interfaz.
    const info = await page.evaluate(() => window.__raices?.parcelaInfo(20))
    expect(info?.comprable).toBe(true)
    await centrar(page, 40, 48)
    const pp = await page.evaluate(() => window.__raices?.puntoClicParcela(20))
    const libre =
      pp && (await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, pp))
    if (pp && libre === 'CANVAS') await pulsar(page, pp)
    else await page.evaluate(() => window.__raices?.seleccionar(20))
    await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBe(VECINA)
    const pParcela = region(page, /Parcela/)
    await boton(pParcela, new RegExp(`^Comprar por ${info?.precio}`)).click()
    await boton(pParcela, 'Comprar').click()
    await expect.poll(() => dinero(page)).toBe(d0 - (info?.precio ?? 0))
    // La obra sigue igual (mismo sitio, en obra, mismo cartel).
    expect(await edificios(page)).toMatchObject([
      { tipo: 'cobertizo', x: s.x, y: s.y, enObra: true, diasCartel: 2 },
    ])
    // Zona y cobertizo a caballo de la frontera (y = 47 | 48).
    await emitir(page, { tipo: 'PintarZona', x0: 33, y0: 44, x1: 46, y1: 51, zona: 'almacen' })
    const cruce = await page.evaluate(() => {
      const r = window.__raices
      for (let y = 46; y <= 47; y++) {
        for (let x = 32; x <= 45; x++) {
          const v = r?.colocacion('cobertizo', x, y)
          // Ya no queda madera para otro cobertizo: basta con que solo falte pagar.
          if (v?.valida || v?.motivo === 'materiales-insuficientes') return x
        }
      }
      return undefined
    })
    expect(cruce, 'un cobertizo a caballo de las dos parcelas es válido').toBeDefined()
    expect(errores).toEqual([])
  })

  test('mover un edificio a una zona y borrar la zona: lo de debajo se conserva y el edificio sigue siendo válido', async ({
    page,
  }) => {
    const errores = await abrirI(page)
    await emitir(page, { tipo: 'PintarZona', ...IV, zona: 'vivienda' })
    await emitir(page, { tipo: 'PintarZona', ...IA, zona: 'almacen' })
    const [s] = await sitios(page, 'caja-envio', IV, { x: 34, y: 34 })
    if (!s) throw new Error('sin sitio')
    await emitir(page, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: s.x, y: s.y })
    await page.evaluate(() => {
      const r = window.__raices
      r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    })
    await expect.poll(async () => (await edificios(page))[0]?.enObra).toBe(false)
    const destino = await mover(page, 1, 'caja-envio', IA, { x: 45, y: 38 })
    expect(await zonaDe(page, destino.x, destino.y)).toBe('almacen')
    // Borrar todo el almacén con el pincel.
    await pintar(page, 'Borrar', IA)
    await boton(barra(page), 'Listo').click()
    expect(await zonaDe(page, destino.x, destino.y)).toBe('almacen')
    expect(await zonaDe(page, IA.x0 === destino.x ? IA.x1 : IA.x0, IA.y0)).toBe(undefined)
    // El hueco viejo conserva su vivienda.
    expect(await zonaDe(page, s.x, s.y)).toBe('vivienda')
    // Mover una casilla a una casilla sin zona: zona-incompatible.
    const motivo = await page.evaluate(
      ({ d }) => {
        const r = window.__raices
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const v = r?.colocacion('caja-envio', d.x + (dx ?? 0), d.y + (dy ?? 0))
          if (v && !v.valida && v.motivo === 'zona-incompatible') return v.motivo
        }
        return undefined
      },
      { d: destino },
    )
    expect(motivo).toBe('zona-incompatible')
    expect(errores).toEqual([])
  })

  test('Vida con cada panel abierto (parcela + confirmación, pincel a medias, construir + confirmación, edificio + confirmación, mover): se cierra todo y no se aplica nada', async ({
    page,
  }) => {
    const errores = await abrirI(page)
    const P14: Rect = { x0: 32, y0: 32, x1: 47, y1: 47 }
    await emitir(page, { tipo: 'PintarZona', ...P14, zona: 'almacen' })
    const [sc] = await sitios(page, 'caja-envio', P14, { x: 46, y: 46 })
    if (!sc) throw new Error('sin sitio')
    await emitir(page, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: sc.x, y: sc.y })
    const foto = async () => ({
      d: await dinero(page),
      m: await materiales(page),
      e: await edificios(page),
      z: await page.evaluate(() => {
        const r = window.__raices
        let s = ''
        for (let y = 32; y < 48; y++) for (let x = 32; x < 48; x++) s += r?.zonaDe(x, y) ?? '.'
        return s
      }),
      p: await page.evaluate(() => window.__raices?.estadoVisual(20)),
    })
    const nadaAbierto = async () => {
      await expect(region(page, /Parcela/)).toHaveCount(0)
      await expect(barra(page)).toHaveCount(0)
      await expect(region(page, 'Construir')).toHaveCount(0)
      await expect(region(page, 'Mover edificio')).toHaveCount(0)
      await expect(region(page, 'Caja de envío')).toHaveCount(0)
      expect(await page.evaluate(() => window.__raices?.construccion()?.abierto)).toBe(false)
      expect(await page.evaluate(() => window.__raices?.pincel()?.abierto)).toBe(false)
      expect(await page.evaluate(() => window.__raices?.edificioSeleccionado()?.id)).toBeUndefined()
      expect(await page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
    }
    const ida = async () => {
      if (esMovil()) await aVida(page)
      else {
        await page.keyboard.press('m')
        await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
      }
      await nadaAbierto()
      await aPlano(page)
      await nadaAbierto()
    }
    const f0 = await foto()
    // Parcela vecina con la confirmación abierta.
    await page.evaluate(() => window.__raices?.seleccionar(20))
    await boton(region(page, /Parcela/), /^Comprar por/).click()
    await expect(boton(region(page, /Parcela/), 'Cancelar')).toBeVisible()
    await ida()
    // Pincel con la primera esquina del teclado o a medias de un arrastre.
    await boton(page, 'Zonas').click()
    await boton(barra(page), 'Cultivo').click()
    await centrar(page, 40, 42)
    if (esMovil()) {
      const a = await puntoLibre(page, 34, 42)
      const sesion = (cdp ??= await page.context().newCDPSession(page))
      if (a)
        await sesion.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: a.x, y: a.y, id: 0 }],
        })
      if (a)
        await sesion.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: a.x + 40, y: a.y + 30, id: 0 }],
        })
      await aVida(page)
      await sesion.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await nadaAbierto()
      await aPlano(page)
      await nadaAbierto()
    } else {
      const a = await puntoLibre(page, 34, 42)
      if (!a) throw new Error('no se ve')
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(a.x + 60, a.y + 40)
      await page.keyboard.press('m')
      await page.mouse.up()
      await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
      await nadaAbierto()
      await aPlano(page)
      await nadaAbierto()
    }
    // Construir con la confirmación abierta.
    await boton(page, 'Construir').click()
    await region(page, 'Construir')
      .getByRole('button', { name: /^Cobertizo/ })
      .click()
    await centrar(page, 40, 38)
    const [sb] = await sitios(page, 'cobertizo', P14, { x: 38, y: 36 })
    if (!sb) throw new Error('sin sitio')
    await apuntar(page, sb.punto)
    await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
    await boton(region(page, 'Construir'), 'Construir aquí').click()
    await expect(region(page, 'Construir').getByText('¿Construir Cobertizo?')).toBeVisible()
    await ida()
    // Edificio con la confirmación de cancelar la obra.
    await tocarEdificio(page, 1)
    await boton(region(page, 'Caja de envío'), 'Cancelar obra').click()
    await expect(region(page, 'Caja de envío').getByRole('alertdialog')).toBeVisible()
    await ida()
    // Modo mover (con un edificio terminado).
    await page.evaluate(() => {
      const r = window.__raices
      r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    })
    await expect.poll(async () => (await edificios(page))[0]?.enObra).toBe(false)
    const f1 = await foto()
    await tocarEdificio(page, 1)
    await boton(region(page, 'Caja de envío'), 'Mover').click()
    const [dm] = await sitios(page, 'caja-envio', P14, { x: 34, y: 34 })
    if (dm) await apuntar(page, dm.punto)
    await ida()
    expect(await foto()).toEqual(f1)
    // Lo de antes de terminar la obra tampoco cambió nada salvo la obra.
    expect({ ...f0, e: undefined }).toEqual({ ...f1, e: undefined })
    expect(errores).toEqual([])
  })

  test('exclusión mutua: parcela, pincel, construir y edificio nunca están abiertos a la vez', async ({
    page,
  }) => {
    const errores = await abrirI(page)
    await emitir(page, { tipo: 'PintarZona', ...IA, zona: 'almacen' })
    const [sc] = await sitios(page, 'caja-envio', IA, { x: 46, y: 39 })
    if (!sc) throw new Error('sin sitio')
    await emitir(page, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: sc.x, y: sc.y })
    const abiertos = async () => {
      const n = [
        await region(page, /Parcela/).count(),
        await barra(page).count(),
        await region(page, 'Construir').count(),
        await region(page, 'Caja de envío').count(),
      ]
      return n.reduce((a, b) => a + b, 0)
    }
    const pasos: [string, () => Promise<unknown>][] = [
      ['parcela', () => page.evaluate(() => window.__raices?.seleccionar(20))],
      ['zonas', () => boton(page, 'Zonas').click()],
      ['construir', () => boton(page, 'Construir').click()],
      ['edificio', () => page.evaluate(() => window.__raices?.seleccionarEdificio(1))],
      ['parcela', () => page.evaluate(() => window.__raices?.seleccionar(20))],
      ['construir', () => boton(page, 'Construir').click()],
      ['zonas', () => boton(page, 'Zonas').click()],
      ['edificio', () => page.evaluate(() => window.__raices?.seleccionarEdificio(1))],
      ['zonas', () => boton(page, 'Zonas').click()],
      ['parcela', () => page.evaluate(() => window.__raices?.seleccionar(20))],
      ['edificio', () => page.evaluate(() => window.__raices?.seleccionarEdificio(1))],
      ['construir', () => boton(page, 'Construir').click()],
    ]
    for (const [i, [nombre, accion]] of pasos.entries()) {
      // El botón Construir se oculta con un panel de parcela o de edificio abierto: se cierra antes.
      // Con la barra de zonas abierta, tocar el lienzo pinta: para elegir parcela hay que cerrarla.
      if (nombre === 'parcela' && (await barra(page).count()) > 0)
        await page.keyboard.press('Escape')
      if (nombre === 'construir' && (await boton(page, 'Construir').count()) === 0) {
        await page.keyboard.press('Escape')
        await page.keyboard.press('Escape')
      }
      await accion()
      await page.waitForTimeout(150)
      expect(await abiertos(), `paso ${i}: tras abrir ${nombre}`).toBe(1)
    }
    expect(errores).toEqual([])
  })

  test('tocar la obra con la parcela elegida debajo, y comprar la vecina con el edificio elegido: nunca dos paneles', async ({
    page,
  }) => {
    const errores = await abrirI(page)
    await emitir(page, { tipo: 'PintarZona', ...IA, zona: 'almacen' })
    const [sc] = await sitios(page, 'caja-envio', IA, { x: 46, y: 39 })
    if (!sc) throw new Error('sin sitio')
    await emitir(page, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: sc.x, y: sc.y })
    await page.evaluate((i) => window.__raices?.seleccionar(i), PI)
    await expect(region(page, /Parcela/)).toBeVisible()
    await tocarEdificio(page, 1)
    await expect(region(page, /Parcela/)).toHaveCount(0)
    await expect(region(page, 'Caja de envío')).toBeVisible()
    expect(errores).toEqual([])
  })
})

test.describe('M4 global · la parcela de la aparición en móvil vertical', () => {
  /** Filas de la columna 36 (parcela 32) visibles sobre el lienzo y sitios de casa válidos que se ven. */
  async function visible(page: Page): Promise<{ filas: number[]; casas: number }> {
    await camaraQuieta(page)
    return page.evaluate(() => {
      const r = window.__raices
      const c = r?.camara()
      if (!r || !c) return { filas: [] as number[], casas: 0 }
      const enLienzo = (cx: number, cy: number) => {
        const px = ((cx + 0.5) * 32 - c.scrollX - c.ancho / 2) * c.zoom + c.ancho / 2
        const py = ((cy + 0.5) * 32 - c.scrollY - c.alto / 2) * c.zoom + c.alto / 2
        if (px <= 0 || py <= 0 || px >= innerWidth || py >= innerHeight) return false
        return document.elementFromPoint(px, py)?.tagName === 'CANVAS'
      }
      const filas: number[] = []
      for (let y = 80; y <= 95; y++) if (enLienzo(36, y)) filas.push(y)
      let casas = 0
      for (let y = 80; y <= 93; y++) {
        for (let x = 32; x <= 44; x++) {
          if (r.colocacion('casa', x, y)?.valida && enLienzo(x + 1, y + 1)) casas++
        }
      }
      return { filas, casas }
    })
  }

  /** Arrastre de la vista con dos dedos (CDP), `dy` px de pantalla (negativo = hacia arriba). */
  async function dosDedos(page: Page, dy: number): Promise<void> {
    const sesion = (cdp ??= await page.context().newCDPSession(page))
    const x = 150
    const y0 = 300
    const puntos = (y: number) => [
      { x, y, id: 1 },
      { x: x + 80, y, id: 2 },
    ]
    await sesion.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: puntos(y0) })
    for (let i = 1; i <= 8; i++) {
      await sesion.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: puntos(y0 + (dy * i) / 8),
      })
    }
    await sesion.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(400)
  }

  test('[S3] móvil vertical, zoom inicial: con el panel Construir la parcela de la aparición queda bajo el panel y la cámara no baja más; solo asoman sus 4 últimas filas y la silueta nace fuera', async ({
    page,
  }) => {
    test.skip(!esMovil(), 'móvil vertical')
    test.setTimeout(90_000)
    const errores = await abrir(page, `?semilla=${SEMILLA}&debug&modo=plano&propias=${PARCELA}`)
    await page.evaluate(() =>
      window.__raices?.emitir({
        tipo: 'PintarZona',
        x0: 32,
        y0: 80,
        x1: 47,
        y1: 95,
        zona: 'vivienda',
      }),
    )
    // Abajo del todo, como al llegar al Plano desde la aparición.
    await page.evaluate(() => window.__raices?.centrarCamara(40, 95))
    await page.waitForTimeout(300)
    const sin = await visible(page)
    // Sin paneles se ve toda la parcela y hay muchos sitios para la casa.
    expect(sin.casas).toBeGreaterThan(0)
    await boton(page, 'Construir').click()
    await region(page, 'Construir').getByRole('button', { name: /^Casa/ }).click()
    await page.waitForTimeout(400)
    // El jugador arrastra la vista hacia arriba con dos dedos para ver más abajo.
    let con = await visible(page)
    for (let i = 0; i < 3; i++) {
      await dosDedos(page, -250)
      const v = await visible(page)
      con = {
        filas: [...new Set([...con.filas, ...v.filas])].sort((a, b) => a - b),
        casas: Math.max(con.casas, v.casas),
      }
    }
    console.log(`[alcance] sin ${JSON.stringify(sin)} con ${JSON.stringify(con)}`)
    test.info().annotations.push({
      type: 'alcance',
      description: `sin panel: filas ${sin.filas.join(',')}; con Construir: filas ${con.filas.join(',')}, sitios de casa visibles ${con.casas}`,
    })
    // Ni arrastrando la vista: solo asoma la franja de debajo del panel (filas 92 a 95).
    expect(
      con.filas.length,
      `filas de la parcela que se llegan a ver con el panel abierto: ${con.filas.join(',')}`,
    ).toBeGreaterThanOrEqual(8)
    // Además, la silueta nace fuera de la parcela (en la zona libre de arriba), en tierra ajena.
    expect.soft(await silueta(page), 'la silueta empieza en la parcela comprada').toMatchObject({
      valida: true,
    })
    expect(errores).toEqual([])
  })
})

/** Teclado: comprar, pintar, construir, mover y demoler sin ratón (escritorio). */
test.describe('M4 global · solo teclado', () => {
  /** Pulsa Tab (o Shift+Tab) hasta que el foco cumpla `pred`; falla tras `max` pulsaciones. */
  async function tabHasta(
    page: Page,
    pred: (el: { id: string; tag: string; nombre: string }) => boolean,
    msg: string,
    atras = false,
    max = 40,
  ): Promise<number> {
    for (let i = 0; i <= max; i++) {
      const el = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null
        return {
          id: a?.id ?? '',
          tag: a?.tagName ?? '',
          nombre: (a?.getAttribute('aria-label') ?? a?.textContent ?? '').trim(),
        }
      })
      if (pred(el)) return i
      await page.keyboard.press(atras ? 'Shift+Tab' : 'Tab')
    }
    throw new Error(`Con Tab no se llega a ${msg}`)
  }
  const lienzo = (el: { id: string; tag: string }) => el.id === 'juego' || el.tag === 'CANVAS'
  const nombre = (re: RegExp) => (el: { nombre: string }) => re.test(el.nombre)

  /** Lleva el cursor de casilla del pincel (o la silueta) a (x, y) con las flechas. */
  async function flechasHasta(
    page: Page,
    leer: () => Promise<{ x: number; y: number } | undefined>,
    x: number,
    y: number,
  ): Promise<void> {
    for (let i = 0; i < 80; i++) {
      const c = await leer()
      if (!c) throw new Error('sin cursor')
      if (c.x === x && c.y === y) return
      const tecla =
        c.x < x ? 'ArrowRight' : c.x > x ? 'ArrowLeft' : c.y < y ? 'ArrowDown' : 'ArrowUp'
      await page.keyboard.press(tecla)
    }
    throw new Error(`No se llega con las flechas a ${x},${y}`)
  }

  test('comprar, pintar, construir, mover y demoler sin ratón', async ({ page }) => {
    test.skip(esMovil(), 'teclado: escritorio')
    test.setTimeout(180_000)
    const errores = await abrir(page, `?semilla=${SEMILLA}&debug`)
    await page.locator('#juego').focus()
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
    await camaraQuieta(page)
    // Elegir la parcela del centro de la vista y llegar a la 32 con las flechas.
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBeDefined()
    for (let i = 0; i < 12; i++) {
      const s = (await page.evaluate(() => window.__raices?.seleccionada())) ?? 0
      if (s === PARCELA) break
      const [f, c] = [Math.floor(s / 6), s % 6]
      await page.keyboard.press(
        c < 2 ? 'ArrowRight' : c > 2 ? 'ArrowLeft' : f < 5 ? 'ArrowDown' : 'ArrowUp',
      )
    }
    expect(await page.evaluate(() => window.__raices?.seleccionada())).toBe(PARCELA)
    await tabHasta(page, nombre(/^Comprar por 540/), 'Comprar por 540')
    await page.keyboard.press('Enter')
    await tabHasta(page, nombre(/^Comprar$/), 'Comprar (confirmación)', true)
    await page.keyboard.press('Enter')
    await expect.poll(() => dinero(page)).toBe(560)
    await page.keyboard.press('Escape')
    await expect(region(page, /Parcela/)).toHaveCount(0)

    // Zonas con el teclado.
    await tabHasta(page, nombre(/^Zonas$/), 'Zonas')
    await page.keyboard.press('Enter')
    await expect(barra(page)).toBeVisible()
    const cursor = () => page.evaluate(() => window.__raices?.pincel()?.cursor)
    for (const [herr, r] of [
      [/^Vivienda$/, VIVIENDA],
      [/^Almacén$/, ALMACEN],
    ] as const) {
      await tabHasta(page, nombre(herr), String(herr))
      await page.keyboard.press('Enter')
      const pasos = await tabHasta(page, lienzo, 'el lienzo')
      test.info().annotations.push({ type: 'tabs-al-lienzo', description: String(pasos) })
      await page.evaluate(() => window.__raices?.centrarCamara(40, 84))
      await page.waitForTimeout(200)
      if (!(await cursor())) await page.keyboard.press('Enter')
      await flechasHasta(page, cursor, r.x0, r.y0)
      await page.keyboard.press('Enter')
      await flechasHasta(page, cursor, r.x1, r.y1)
      await page.keyboard.press('Enter')
      await expect
        .poll(() => zonaDe(page, r.x1, r.y1))
        .toBe(herr.source.includes('Viv') ? 'vivienda' : 'almacen')
    }
    // Esc suelta el cursor y luego cierra la barra.
    for (let i = 0; i < 3 && (await barra(page).count()) > 0; i++)
      await page.keyboard.press('Escape')
    await expect(barra(page)).toHaveCount(0)

    // Construir casa y caja con el teclado.
    const sil = async () => {
      const s = await silueta(page)
      return s && { x: s.x, y: s.y }
    }
    for (const [tipo, area, cerca] of [
      ['casa', VIVIENDA, { x: 34, y: 82 }],
      ['caja-envio', ALMACEN, { x: 46, y: 87 }],
    ] as const) {
      if ((await region(page, 'Construir').count()) === 0) {
        await tabHasta(page, nombre(/^Construir$/), 'Construir')
        await page.keyboard.press('Enter')
      }
      await tabHasta(page, nombre(new RegExp(`^${NOMBRE[tipo]}`)), NOMBRE[tipo] as string)
      await page.keyboard.press('Enter')
      await expect.poll(() => silueta(page)).toBeDefined()
      await tabHasta(page, lienzo, 'el lienzo')
      await page.evaluate(() => window.__raices?.centrarCamara(40, 84))
      const [s] = await sitios(page, tipo, area, cerca)
      if (!s) throw new Error('sin sitio')
      await flechasHasta(page, sil, s.x, s.y)
      await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
      await page.keyboard.press('Enter')
      await expect(region(page, 'Construir').getByText(`¿Construir ${NOMBRE[tipo]}?`)).toBeVisible()
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await edificios(page)).some((e) => e.tipo === tipo)).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(region(page, 'Construir')).toHaveCount(0)
    await expect.poll(() => dinero(page)).toBe(510)

    // Pasar los días (gancho) y mover la casa con el teclado.
    await page.evaluate(() => {
      const r = window.__raices
      for (let i = 0; i < 3; i++) {
        r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
        r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      }
      r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    })
    await expect.poll(async () => (await edificios(page)).every((e) => !e.enObra)).toBe(true)
    const casa = (await edificios(page)).find((e) => e.tipo === 'casa') as Vista
    await page.locator('#juego').focus()
    // Con el zoom del Plano la vista no se puede centrar en la fila inferior (fallo aparte): se acerca con +.
    await page.keyboard.down('NumpadAdd')
    await page.waitForTimeout(1200)
    await page.keyboard.up('NumpadAdd')
    await page.evaluate((c) => window.__raices?.centrarCamara(c.x + 1, c.y + 1), casa)
    await page.waitForTimeout(250)
    await page.keyboard.press('Enter')
    await expect
      .poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id))
      .toBe(casa.id)
    await tabHasta(page, nombre(/^Mover/), 'Mover')
    await page.keyboard.press('Enter')
    await expect(region(page, 'Mover edificio')).toBeVisible()
    await tabHasta(page, lienzo, 'el lienzo')
    let destino: { x: number; y: number } | undefined
    for (const q of await destinosMover(page, casa.id, 'casa', VIVIENDA, { x: 36, y: 85 })) {
      await flechasHasta(page, sil, q.x, q.y)
      if ((await silueta(page))?.valida) {
        destino = q
        break
      }
    }
    if (!destino) throw new Error('sin destino')
    await page.keyboard.press('Enter')
    await expect
      .poll(async () => (await edificios(page)).find((e) => e.id === casa.id))
      .toMatchObject({
        x: destino.x,
        y: destino.y,
      })

    // Demoler la caja con el teclado.
    const caja = (await edificios(page)).find((e) => e.tipo === 'caja-envio') as Vista
    await page.locator('#juego').focus()
    await page.evaluate((c) => window.__raices?.centrarCamara(c.x, c.y), caja)
    await page.waitForTimeout(250)
    await page.keyboard.press('Enter')
    await expect
      .poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id))
      .toBe(caja.id)
    await tabHasta(page, nombre(/^Demoler$/), 'Demoler')
    await page.keyboard.press('Enter')
    await tabHasta(page, nombre(/^Sí, demoler$/), 'Sí, demoler', true)
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await edificios(page)).length).toBe(1)
    await expect.poll(() => dinero(page)).toBe(535)
    expect(errores).toEqual([])
  })

  test('[S3] teclado, zoom del Plano: un edificio de la parcela de la aparición no se puede elegir con Enter (la vista no llega a centrarse en él)', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado: escritorio')
    const errores = await abrir(page, `?semilla=${SEMILLA}&debug&propias=${PARCELA}`)
    await page.locator('#juego').focus()
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
    await page.evaluate(
      (v) => window.__raices?.emitir({ tipo: 'PintarZona', ...v, zona: 'vivienda' }),
      VIVIENDA,
    )
    await centrar(page, 36, 82)
    const [s] = await sitios(page, 'casa', VIVIENDA, { x: 34, y: 81 })
    if (!s) throw new Error('sin sitio')
    await page.evaluate(
      (s) => window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: 'casa', x: s.x, y: s.y }),
      s,
    )
    await expect.poll(async () => (await edificios(page)).length).toBe(1)
    // El jugador lleva la vista hacia la casa con las flechas (sin selección, mueven la cámara): parte de más
    // arriba y mantiene la flecha hasta que el centro de la vista llega a la casa (con el zoom del Plano
    // la cámara ya puede centrarse en cualquier casilla del valle, pero no se queda sola en la casa).
    await centrar(page, 36, 66)
    await page.locator('#juego').focus()
    await page.keyboard.down('ArrowDown')
    await expect
      .poll(
        async () => {
          const c = await page.evaluate(() => window.__raices?.camara())
          return ((c?.scrollY ?? 0) + (c?.alto ?? 0) / 2) / 32
        },
        { intervals: [10] },
      )
      .toBeGreaterThanOrEqual(s.y + 1)
    await page.keyboard.up('ArrowDown')
    const cam = await page.evaluate(() => window.__raices?.camara())
    const centroY = ((cam?.scrollY ?? 0) + (cam?.alto ?? 0) / 2) / 32
    test.info().annotations.push({
      type: 'camara',
      description: `zoom ${cam?.zoom}, centro en la fila ${centroY.toFixed(1)}; casa en filas ${s.y}..${s.y + 2}`,
    })
    await page.keyboard.press('Enter')
    await expect
      .poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id), {
        message: `la vista se queda en la fila ${centroY.toFixed(1)} y Enter elige la parcela, no la casa`,
      })
      .toBe(1)
    expect(errores).toEqual([])
  })
})

/** Granja llena: todas las parcelas propias, zonas en franjas y muchos edificios. */
async function granjaLlena(page: Page): Promise<number> {
  return page.evaluate(() => {
    const r = window.__raices
    if (!r) return 0
    const zonas = ['vivienda', 'almacen', 'cultivo', 'huerto'] as const
    for (let i = 0; i < 24; i++) {
      r.emitir({
        tipo: 'PintarZona',
        x0: 0,
        y0: i * 4,
        x1: 95,
        y1: i * 4 + 3,
        zona: zonas[i % 4] as string,
      })
    }
    let n = 0
    // El lote de bienvenida (80 de madera) da para la casa y 3 cajas, dejando 20 de madera.
    for (const [t, max] of [
      ['casa', 1],
      ['caja-envio', 4],
    ] as const) {
      for (let y = 20; y < 96 && n < max; y += 7) {
        for (let x = 10; x < 96 && n < max; x += 13) {
          if (r.colocacion(t, x, y)?.valida) {
            r.emitir({ tipo: 'Construir', tipoEdificio: t, x, y })
            n++
          }
        }
      }
    }
    return n
  })
}

const TODAS = Array.from({ length: 36 }, (_, i) => i).join(',')

test.describe('M4 global · granja llena', () => {
  test('muchas acciones (pintar, construir, mover, demoler, cancelar, desmayos, modos) no dejan objetos ni texturas huérfanos', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errores = await abrir(
      page,
      `?semilla=${SEMILLA}&debug&modo=plano&dinero=100000000&propias=${TODAS}`,
    )
    const n = await granjaLlena(page)
    expect(n).toBe(4)
    await page.waitForTimeout(500)
    const medir = () =>
      page.evaluate(() => ({
        obj: window.__raices?.objetosValle() ?? 0,
        tex: window.__raices?.texturas() ?? 0,
        graf: (window.__raices?.graficosValle() ?? []).length,
      }))
    const base = await medir()
    const vistos = (await edificios(page)).length
    // Primero se terminan las obras: la base es la granja terminada.
    await page.evaluate(() => {
      const r = window.__raices
      r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    })
    await expect.poll(async () => (await edificios(page)).every((e) => !e.enObra)).toBe(true)
    await page.waitForTimeout(500)
    const base2 = await medir()
    for (let ronda = 0; ronda < 6; ronda++) {
      const ok = await page.evaluate(() => {
        const r = window.__raices
        if (!r) return false
        const cajas = r.edificios().filter((b) => b.tipo === 'caja-envio')
        const casa = r.edificios().find((b) => b.tipo === 'casa')
        // Repintar todo: lo que hay bajo los edificios no cambia.
        r.emitir({ tipo: 'BorrarZona', x0: 0, y0: 0, x1: 95, y1: 95 })
        r.emitir({ tipo: 'PintarZona', x0: 0, y0: 0, x1: 95, y1: 95, zona: 'almacen' })
        r.emitir({ tipo: 'PintarZona', x0: 0, y0: 0, x1: 47, y1: 95, zona: 'huerto' })
        // Obra nueva junto a una caja y cancelarla (devuelve todo).
        let hecho = false
        for (const c of cajas) {
          for (const [dx, dy] of [
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
          ] as const) {
            if (!hecho && r.colocacion('caja-envio', c.x + dx, c.y + dy)?.valida) {
              r.emitir({ tipo: 'Construir', tipoEdificio: 'caja-envio', x: c.x + dx, y: c.y + dy })
              const nueva = r.edificios().find((b) => b.enObra)
              if (nueva) r.emitir({ tipo: 'CancelarObra', id: nueva.id })
              hecho = true
            }
          }
        }
        // Mover cajas y la casa ida y vuelta.
        for (const b of [...cajas, ...(casa ? [casa] : [])]) {
          r.emitir({ tipo: 'MoverEdificio', id: b.id, x: b.x + 1, y: b.y })
          r.emitir({ tipo: 'MoverEdificio', id: b.id, x: b.x, y: b.y })
        }
        // Desmayo.
        r.emitir({ tipo: 'CambiarModo', modo: 'vida' })
        r.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
        r.emitir({ tipo: 'CambiarModo', modo: 'plano' })
        r.seleccionarEdificio(cajas[0]?.id ?? 0)
        return hecho
      })
      expect(ok, `ronda ${ronda}: obra y cancelación`).toBe(true)
      await expect(region(page, 'Caja de envío')).toBeVisible()
      await page.keyboard.press('Escape')
      await boton(page, 'Zonas').click()
      await page.keyboard.press('Escape')
      await boton(page, 'Construir').click()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(500)
    const fin = await medir()
    expect((await edificios(page)).length).toBe(vistos)
    expect(fin, 'tras 6 rondas, lo mismo que con la granja terminada').toEqual(base2)
    test
      .info()
      .annotations.push({ type: 'medidas', description: JSON.stringify({ base, base2, fin }) })
    expect(errores).toEqual([])
  })

  test('perder y recuperar el contexto WebGL con la granja llena, un edificio elegido, el pincel y la noche', async ({
    page,
  }) => {
    test.skip(esMovil(), 'basta con escritorio')
    test.setTimeout(120_000)
    const errores = await abrir(
      page,
      `?semilla=${SEMILLA}&debug&modo=plano&dinero=100000000&propias=${TODAS}&hora=23:00`,
    )
    await granjaLlena(page)
    await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
    const vis = await edificios(page)
    await page.evaluate((id) => window.__raices?.seleccionarEdificio(id), vis[3]?.id ?? 0)
    // Que se vaya el aviso de las obras (6 s): si no, cambia entre una foto y otra.
    await page.waitForTimeout(7000)
    const foto = async () =>
      sharp(await page.screenshot())
        .removeAlpha()
        .raw()
        .toBuffer()
    const dif = (x: Buffer, y: Buffer) => {
      let s = 0
      for (let i = 0; i < x.length; i++) s += Math.abs((x[i] ?? 0) - (y[i] ?? 0))
      return s / x.length
    }
    const f1 = await foto()
    const ruido = dif(f1, await foto())
    const res = await page.evaluate(async () => {
      const cv = document.querySelector('canvas') as HTMLCanvasElement
      let ok = false
      cv.addEventListener('webglcontextrestored', () => (ok = true))
      const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGL2RenderingContext
      const ext = gl.getExtension('WEBGL_lose_context')
      if (!ext) return 'sin-extension'
      ext.loseContext()
      await new Promise((r) => setTimeout(r, 300))
      ext.restoreContext()
      await new Promise((r) => setTimeout(r, 1500))
      return ok ? 'restaurado' : 'no'
    })
    expect(res).toBe('restaurado')
    expect(await edificios(page)).toEqual(vis)
    const despues = await foto()
    const d = dif(f1, despues)
    console.log(`[webgl] ruido ${ruido.toFixed(2)} dif ${d.toFixed(2)}`)
    expect(d, 'la imagen cambia tras restaurar').toBeLessThan(ruido + 2)
    // Y se sigue pudiendo pintar y construir.
    await boton(page, 'Zonas').click()
    await expect(barra(page)).toBeVisible()
    expect(errores).toEqual([])
  })

  test('fps con la granja llena en Plano, con el panel del edificio y en Vida', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await abrir(page, `?semilla=${SEMILLA}&debug&modo=plano&dinero=100000000&propias=${TODAS}`)
    const fps = (ms: number) =>
      page.evaluate(
        (ms) =>
          new Promise<number>((res) => {
            let n = 0
            const t0 = performance.now()
            const f = () => {
              n++
              if (performance.now() - t0 < ms) requestAnimationFrame(f)
              else res((n * 1000) / (performance.now() - t0))
            }
            requestAnimationFrame(f)
          }),
        ms,
      )
    const vacio = await fps(2500)
    const n = await granjaLlena(page)
    await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
    await page.waitForTimeout(500)
    const plano = await fps(2500)
    await page.evaluate(() => {
      const r = window.__raices
      r?.seleccionarEdificio(r.edificios()[5]?.id ?? 0)
    })
    await page.waitForTimeout(300)
    const panel = await fps(2500)
    await page.evaluate(() => {
      const r = window.__raices
      r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r?.emitir({ tipo: 'Pausar' })
    })
    await page.waitForTimeout(500)
    const vida = await fps(2500)
    test.info().annotations.push({
      type: 'fps',
      description: `edificios ${n}; vacío ${vacio.toFixed(1)}, plano ${plano.toFixed(1)}, panel ${panel.toFixed(1)}, vida ${vida.toFixed(1)}`,
    })
    console.log(
      `[fps ${test.info().project.name}] edificios ${n}; vacío ${vacio.toFixed(1)}, plano ${plano.toFixed(1)}, panel ${panel.toFixed(1)}, vida ${vida.toFixed(1)}`,
    )
    expect(plano).toBeGreaterThan(Math.min(15, vacio * 0.6))
    expect(panel).toBeGreaterThan(Math.min(15, vacio * 0.6))
  })
})

/** Granja de ejemplo (economía real): parcela 32, vivienda, almacén, cultivo y huerto, 3 edificios. */
async function granjaEjemplo(page: Page): Promise<void> {
  await page.evaluate(
    ({ V, A, parcela }) => {
      const r = window.__raices
      if (!r) return
      r.emitir({ tipo: 'CambiarModo', modo: 'plano' })
      r.emitir({ tipo: 'ComprarParcela', indice: parcela })
      r.emitir({ tipo: 'PintarZona', ...V, zona: 'vivienda' })
      r.emitir({ tipo: 'PintarZona', ...A, zona: 'almacen' })
      r.emitir({ tipo: 'PintarZona', x0: 33, y0: 89, x1: 39, y1: 94, zona: 'cultivo' })
      r.emitir({ tipo: 'PintarZona', x0: 40, y0: 89, x1: 45, y1: 94, zona: 'huerto' })
      const poner = (t: string, xs: number[], ys: number[]) => {
        for (const y of ys)
          for (const x of xs)
            if (r.colocacion(t, x, y)?.valida) {
              r.emitir({ tipo: 'Construir', tipoEdificio: t, x, y })
              return
            }
      }
      poner('casa', [34, 35, 33, 36], [82, 83, 81, 84])
      poner('cobertizo', [41, 42, 40, 43], [82, 83, 81, 84])
      poner('caja-envio', [45, 44, 46, 43], [86, 85, 87, 84])
      // Dos días: la casa (3 días) sigue en obra; la caja y el cobertizo, terminados.
      r.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r.emitir({ tipo: 'AvanzarTiempo', minutos: 240 })
    },
    { V: VIVIENDA, A: ALMACEN, parcela: PARCELA },
  )
}

async function contextoDe(browser: Browser, nombre: string) {
  const p7 = devices['Pixel 7']
  const opciones =
    nombre === 'escritorio'
      ? { viewport: { width: 1280, height: 720 } }
      : nombre === 'movil-horizontal'
        ? { ...p7, viewport: { width: 915, height: 412 } }
        : nombre === 'baja'
          ? { ...p7, viewport: { width: 640, height: 320 } }
          : { ...p7 }
  return browser.newContext({ ...opciones, baseURL: test.info().project.use.baseURL ?? '' })
}

test('capturas finales de la granja de ejemplo (m4-final)', async ({ browser }) => {
  test.skip(test.info().project.name !== 'escritorio', 'una sola vez')
  test.setTimeout(400_000)
  for (const nombre of ['escritorio', 'movil-horizontal', 'baja', 'movil-vertical']) {
    const ctx = await contextoDe(browser, nombre)
    const page = await ctx.newPage()
    const errores = await abrir(page, `?semilla=${SEMILLA}&debug`)
    await granjaEjemplo(page)
    const foto = async (n: string) => {
      await page.waitForTimeout(1000)
      await page.screenshot({ path: `capturas/m4-final--${n}--${nombre}.png` })
    }
    // Vida: el personaje en la granja.
    await page.waitForTimeout(1500)
    await foto('vida')
    // Plano: la granja centrada y algo más cerca en móvil.
    await page.evaluate(() => {
      const r = window.__raices
      r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    })
    await camaraQuieta(page)
    await page.evaluate(() => window.__raices?.centrarCamara(40, 88))
    await foto('plano')
    // Paneles.
    await page.evaluate(() => {
      const r = window.__raices
      r?.seleccionar(26)
    })
    await foto('panel-parcela')
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.__raices?.centrarCamara(40, 88))
    await boton(page, 'Zonas').click()
    await boton(barra(page), 'Huerto').click()
    await foto('panel-zonas')
    await boton(barra(page), 'Listo').click()
    await boton(page, 'Construir').click()
    await region(page, 'Construir')
      .getByRole('button', { name: /^Caja de envío/ })
      .click()
    await page.evaluate(() => window.__raices?.centrarCamara(40, 88))
    const s = (await sitios(page, 'caja-envio', ALMACEN, { x: 44, y: 87 }))[0]
    if (s) {
      if (nombre === 'escritorio') await page.mouse.move(s.punto.x, s.punto.y)
      else await page.touchscreen.tap(s.punto.x, s.punto.y)
    }
    await foto('panel-construir')
    await boton(region(page, 'Construir'), 'Listo').click()
    const vis = await edificios(page)
    const cob = vis.find((e) => e.tipo === 'cobertizo')
    const casa = vis.find((e) => e.tipo === 'casa')
    if (cob) {
      await page.evaluate((id) => window.__raices?.seleccionarEdificio(id), cob.id)
      await foto('panel-edificio')
      await boton(region(page, 'Cobertizo'), 'Demoler').click()
      await foto('confirmar-demoler')
      await boton(region(page, 'Cobertizo'), 'No, conservar').click()
      await page.keyboard.press('Escape')
    }
    if (casa) {
      await page.evaluate((id) => window.__raices?.seleccionarEdificio(id), casa.id)
      await foto('panel-obra')
      await page.keyboard.press('Escape')
    }
    // La casa terminada: un día más y la granja completa en Plano.
    await page.evaluate(() => {
      const r = window.__raices
      r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 240 })
    })
    await page.waitForTimeout(7000) // que se vaya el aviso
    await foto('vida-terminada')
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'plano' }))
    await camaraQuieta(page)
    await page.evaluate(() => window.__raices?.centrarCamara(40, 88))
    await foto('plano-terminada')
    expect(errores, nombre).toEqual([])
    await ctx.close()
  }
})
