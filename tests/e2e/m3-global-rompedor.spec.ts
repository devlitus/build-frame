/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test'

/**
 * M3 · pasada global del rompedor: interacciones entre las historias de Parcelas (precio, compra,
 * selección, panel, confirmación, HUD de dinero) y con M2 (tiempo, personaje, modos, táctil).
 */

const TAM = 32 // TAM_CASILLA
const CASILLAS = 16 // casillas por parcela
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

async function abrir(page: Page, query: string): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  return errores
}

const dinero = (page: Page) => page.evaluate(() => window.__raices!.dinero()!)
const reloj = (page: Page) => page.evaluate(() => window.__raices!.reloj()!)
const personaje = (page: Page) => page.evaluate(() => window.__raices!.personaje()!)
const modo = (page: Page) => page.evaluate(() => window.__raices!.modo())
const seleccionada = (page: Page) => page.evaluate(() => window.__raices!.seleccionada())
const panel = (page: Page) => page.getByRole('region', { name: /^Parcela / })
const pedir = (page: Page) => panel(page).locator('.boton-compra-pedir')
const grupo = (page: Page) => panel(page).getByRole('group', { name: /Comprar esta parcela/ })
const confirmar = (page: Page) => grupo(page).getByRole('button', { name: 'Comprar', exact: true })
const cancelar = (page: Page) => grupo(page).getByRole('button', { name: 'Cancelar' })
const botonModo = (page: Page) => page.getByRole('button', { name: /Modo de juego/ })

type Info = NonNullable<ReturnType<NonNullable<Window['__raices']>['parcelaInfo']>>
const infos = (page: Page): Promise<Info[]> =>
  page.evaluate(() => Array.from({ length: 36 }, (_, n) => window.__raices!.parcelaInfo(n)!))
const visuales = (page: Page) =>
  page.evaluate(() => Array.from({ length: 36 }, (_, n) => window.__raices?.estadoVisual(n)))

/** HUD, estado, panel y dibujo cuadran con `esperado` (en Plano). */
async function cuadra(page: Page, esperado: number): Promise<void> {
  await expect.poll(() => dinero(page)).toBe(esperado)
  await expect(page.locator('.dinero-cifra')).toHaveText(miles(esperado))
  await expect(page.locator('.dinero')).toHaveAttribute('data-dinero', String(esperado))
  const inf = await infos(page)
  for (const p of inf) expect(p.dinero).toBe(esperado)
  await expect
    .poll(() => visuales(page))
    .toEqual(
      inf.map((p) =>
        p.estado === 'propia' ? 'propia' : p.comprable ? 'comprable' : 'no-comprable',
      ),
    )
  // Las propias forman un bloque 4-conexo y su número coincide con lo gastado.
  const propias = inf.flatMap((p, i) => (p.estado === 'propia' ? [i] : []))
  if (propias.length > 1) {
    const set = new Set(propias)
    const vistos = new Set([propias[0]!])
    const pila = [propias[0]!]
    while (pila.length) {
      const i = pila.pop()!
      for (const j of vecinas(i))
        if (set.has(j) && !vistos.has(j)) {
          vistos.add(j)
          pila.push(j)
        }
    }
    expect(vistos.size, 'propias no conexas').toBe(propias.length)
  }
}

async function cuadraHud(page: Page, esperado: number): Promise<void> {
  await expect.poll(() => dinero(page)).toBe(esperado)
  await expect(page.locator('.dinero-cifra')).toHaveText(miles(esperado))
}

function vecinas(i: number): number[] {
  const f = Math.floor(i / 6)
  const c = i % 6
  return (
    [
      [f - 1, c],
      [f + 1, c],
      [f, c - 1],
      [f, c + 1],
    ] as const
  )
    .filter(([a, b]) => a >= 0 && b >= 0 && a < 6 && b < 6)
    .map(([a, b]) => a * 6 + b)
}

/** Toca o hace clic de verdad sobre la parcela `i` (con el punto que da el gancho de depuración). */
async function tocarParcela(page: Page, i: number, movil: boolean): Promise<void> {
  // Espera a que la cámara se quede quieta (la guía la mueve al abrir o encoger el panel).
  let antes = ''
  await expect
    .poll(async () => {
      const ahora = JSON.stringify(await page.evaluate(() => window.__raices!.camara()))
      const quieta = ahora === antes
      antes = ahora
      return quieta
    })
    .toBe(true)
  const p = await page.evaluate((n) => window.__raices!.puntoClicParcela(n), i)
  if (!p) throw new Error(`la parcela ${i} no se ve`)
  if (movil) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
  await expect(panel(page)).toHaveAttribute('data-parcela', String(i))
}

/** Compra la parcela seleccionada con la interfaz (botón y confirmación) y devuelve el precio. */
async function comprarConInterfaz(page: Page, movil: boolean): Promise<number> {
  const i = Number(await panel(page).getAttribute('data-parcela'))
  const precio = (await infos(page))[i]!.precio!
  if (movil) await pedir(page).tap()
  else await pedir(page).click()
  await expect(confirmar(page)).toBeVisible()
  await expect(grupo(page)).toContainText(miles(precio))
  // Fuera de la ventana anti doble toque.
  await page.waitForTimeout(450)
  if (movil) await confirmar(page).tap()
  else await confirmar(page).click()
  await expect.poll(async () => (await infos(page))[i]!.estado).toBe('propia')
  // Tras comprar, los toques en el lienzo se ignoran 400 ms (anti doble clic).
  await page.waitForTimeout(450)
  return precio
}

const visibles = (page: Page) =>
  page.evaluate(() =>
    Array.from({ length: 36 }, (_, i) => window.__raices!.puntoClicParcela(i) !== undefined),
  )

const parcelaDe = (p: { x: number; y: number }) =>
  Math.floor(p.y / CASILLAS) * 6 + Math.floor(p.x / CASILLAS)

type R = { x: number; y: number; width: number; height: number }
async function caja(l: Locator): Promise<R> {
  const b = await l.boundingBox()
  if (!b) throw new Error('sin caja')
  return b
}
const solapa = (a: R, b: R) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
async function dentro(page: Page, l: Locator, msg: string): Promise<void> {
  const v = page.viewportSize()!
  const c = await caja(l)
  expect(c.x, msg).toBeGreaterThanOrEqual(-0.5)
  expect(c.y, msg).toBeGreaterThanOrEqual(-0.5)
  expect(c.x + c.width, msg).toBeLessThanOrEqual(v.width + 0.5)
  expect(c.y + c.height, msg).toBeLessThanOrEqual(v.height + 0.5)
}

async function aPantalla(page: Page, x: number, y: number) {
  const c = (await page.evaluate(() => window.__raices!.camara()))!
  return {
    x: (x * TAM - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
    y: (y * TAM - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
  }
}

test.describe('partida completa por la interfaz', () => {
  test.setTimeout(150_000)

  test('Vida → Plano, primera compra, no adyacente rechazada, adyacentes hasta sin fondos, vuelta a Vida y paseo', async ({
    page,
    isMobile,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&acelerar=30')
    const inicial = await dinero(page)
    expect(inicial).toBe(1100)
    await cuadraHud(page, inicial)
    // En Vida el reloj corre y el dinero no cambia.
    const r0 = await reloj(page)
    await page.waitForTimeout(1500)
    const r1 = await reloj(page)
    expect(r1.minutoDelDia + r1.dia * 2000).toBeGreaterThan(r0.minutoDelDia + r0.dia * 2000)
    await cuadraHud(page, inicial)

    // A Plano con el botón.
    if (isMobile) await botonModo(page).tap()
    else await botonModo(page).click()
    await expect.poll(() => modo(page)).toBe('plano')
    const enPlano = await reloj(page)
    // Alejar la cámara (tecla «-», también con el teclado del móvil) para ver todo el valle.
    await page.keyboard.down('Minus')
    await page.waitForTimeout(1500)
    await page.keyboard.up('Minus')

    // Primera compra: la parcela donde está el personaje, si tiene alguna vecina asequible después.
    const ap = parcelaDe(await personaje(page))
    let inf = await infos(page)
    const primera = ap
    expect(inf[primera]!.comprable).toBe(true)
    await tocarParcela(page, primera, isMobile)
    let gastado = await comprarConInterfaz(page, isMobile)
    await cuadra(page, inicial - gastado)
    await expect(page.locator('.aviso')).toContainText('comprada por')

    // Una no adyacente: botón desactivado, motivo visible y sin confirmación aunque se pulse.
    inf = await infos(page)
    let vis = await visibles(page)
    const lejana = inf.findIndex(
      (p, i) => vis[i] && p.estado !== 'propia' && !vecinas(primera).includes(i) && i !== primera,
    )
    await tocarParcela(page, lejana, isMobile)
    await expect(pedir(page)).toHaveAttribute('aria-disabled', 'true')
    await expect(panel(page)).toContainText('Debe tocar una de tus parcelas')
    await pedir(page).click({ force: true })
    await expect(grupo(page)).toHaveCount(0)
    await cuadra(page, inicial - gastado)

    // Adyacentes hasta que no quede nada comprable.
    for (let vuelta = 0; vuelta < 36; vuelta++) {
      inf = await infos(page)
      vis = await visibles(page)
      const siguiente = inf.findIndex((p, i) => p.comprable && vis[i])
      if (siguiente < 0)
        expect(
          inf.some((p) => p.comprable),
          'comprable fuera de la vista',
        ).toBe(false)
      if (siguiente < 0) break
      await tocarParcela(page, siguiente, isMobile)
      gastado += await comprarConInterfaz(page, isMobile)
      await cuadra(page, inicial - gastado)
    }
    inf = await infos(page)
    expect(inf.some((p) => p.comprable)).toBe(false)
    for (const p of inf.filter((q) => q.estado !== 'propia'))
      expect(['no-adyacente', 'fondos-insuficientes']).toContain(p.motivo)
    const propias = inf.flatMap((p, i) => (p.estado === 'propia' ? [i] : []))
    expect(propias.length).toBeGreaterThanOrEqual(1)

    // En Plano el reloj no se ha movido con las compras.
    const finPlano = await reloj(page)
    expect(finPlano.dia).toBe(enPlano.dia)
    expect(finPlano.minutoDelDia).toBe(enPlano.minutoDelDia)

    // Vuelta a Vida: la selección se suelta, el reloj sigue desde donde estaba.
    if (isMobile) await botonModo(page).tap()
    else await botonModo(page).click()
    await expect.poll(() => modo(page)).toBe('vida')
    await expect(panel(page)).toHaveCount(0)
    expect(await seleccionada(page)).toBeUndefined()
    const vuelta = await reloj(page)
    // Con acelerar=30 pasan ~25 ms reales por minuto entre el clic y la lectura.
    expect(vuelta.dia).toBe(finPlano.dia)
    expect(vuelta.minutoDelDia - finPlano.minutoDelDia).toBeLessThanOrEqual(40)
    expect(vuelta.minutoDelDia).toBeGreaterThanOrEqual(finPlano.minutoDelDia)

    // Paseo por propias y ajenas: el dinero no cambia y el personaje no se queda atascado.
    const visitadas = new Set<number>([parcelaDe(await personaje(page))])
    for (const [tecla, ms] of [
      ['KeyW', 3600],
      ['KeyA', 1500],
      ['KeyS', 1500],
      ['KeyD', 2400],
    ] as const) {
      const pasos = Math.round(ms / 150)
      if (isMobile) {
        // En móvil se camina con el joystick (CDP) hacia la dirección de la tecla.
        const cdp = await page.context().newCDPSession(page)
        const d = { KeyD: [1, 0], KeyA: [-1, 0], KeyW: [0, -1], KeyS: [0, 1] }[tecla]!
        const o = { x: 200, y: 600 }
        const tocar = (type: string, pts: [number, number][]) =>
          cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
          } as never)
        await tocar('touchStart', [[o.x, o.y]])
        await tocar('touchMove', [[o.x + d[0]! * 20, o.y + d[1]! * 20]])
        await tocar('touchMove', [[o.x + d[0]! * 60, o.y + d[1]! * 60]])
        for (let k = 0; k < pasos; k++) {
          await page.waitForTimeout(150)
          visitadas.add(parcelaDe(await personaje(page)))
        }
        await tocar('touchEnd', [])
        await cdp.detach()
      } else {
        await page.keyboard.down(tecla)
        for (let k = 0; k < pasos; k++) {
          await page.waitForTimeout(150)
          visitadas.add(parcelaDe(await personaje(page)))
        }
        await page.keyboard.up(tecla)
      }
      await cuadraHud(page, inicial - gastado)
      const bloqueada = await page.evaluate(() => {
        const p = window.__raices!.personaje()!
        return window.__raices!.bloqueada(Math.floor(p.x), Math.floor(p.y))
      })
      expect(bloqueada).toBe(false)
    }
    const propiasVisitadas = [...visitadas].filter((i) => propias.includes(i))
    const ajenasVisitadas = [...visitadas].filter((i) => !propias.includes(i))
    expect(propiasVisitadas.length, `visitadas ${[...visitadas]}`).toBeGreaterThan(0)
    expect(ajenasVisitadas.length, `visitadas ${[...visitadas]}`).toBeGreaterThan(0)
    expect(errores).toEqual([])
  })
})

test.describe('compra y tiempo', () => {
  test('el desmayo no toca el dinero, las propias ni deja selección; al volver a Plano todo cuadra', async ({
    page,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&modo=plano&hora=01:58&dinero=3000')
    await page.evaluate(() => window.__raices!.seleccionar(14))
    await expect(panel(page)).toHaveAttribute('data-parcela', '14')
    const gastado = await comprarConInterfaz(page, false)
    await page.evaluate(() => window.__raices!.seleccionar(15))
    await expect(panel(page)).toHaveAttribute('data-parcela', '15')
    const gastado2 = await comprarConInterfaz(page, false)
    const quedan = 3000 - gastado - gastado2
    await cuadra(page, quedan)
    // Panel abierto con la confirmación de una tercera (no comprable con lo que queda o sí).
    await page.evaluate(() => window.__raices!.seleccionar(16))
    await expect(panel(page)).toHaveAttribute('data-parcela', '16')
    const antes = await reloj(page)
    await page.waitForTimeout(2500) // Plano: el reloj está parado aunque sean las 01:58.
    expect(await reloj(page)).toEqual(antes)
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('vida')
    await expect(panel(page)).toHaveCount(0)
    await expect.poll(async () => (await reloj(page)).dia, { timeout: 15_000 }).toBe(2)
    await expect(page.locator('.aviso')).toContainText('dormido')
    await cuadraHud(page, quedan)
    expect(await seleccionada(page)).toBeUndefined()
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('plano')
    await cuadra(page, quedan)
    const inf = await infos(page)
    expect(inf[14]!.estado).toBe('propia')
    expect(inf[15]!.estado).toBe('propia')
    expect(inf.filter((p) => p.estado === 'propia')).toHaveLength(2)
    expect(errores).toEqual([])
  })

  test('Pausa, x2 y x3 con la confirmación abierta: sigue abierta, cobra una vez y el reloj no corre en Plano', async ({
    page,
    isMobile,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&modo=plano&dinero=5000&acelerar=50')
    await page.evaluate(() => window.__raices!.seleccionar(14))
    await expect(panel(page)).toHaveAttribute('data-parcela', '14')
    const precio = (await infos(page))[14]!.precio!
    if (isMobile) await pedir(page).tap()
    else await pedir(page).click()
    await expect(confirmar(page)).toBeVisible()
    const r0 = await reloj(page)
    for (const nombre of ['Pausa', 'Velocidad x2', 'Velocidad x3', 'Pausa']) {
      const b = page.getByRole('button', { name: nombre, exact: true })
      if (isMobile) await b.tap()
      else await b.click()
      await page.waitForTimeout(300)
      await expect(confirmar(page), `tras ${nombre} la confirmación se cerró`).toBeVisible()
      const r = await reloj(page)
      expect(r.minutoDelDia).toBe(r0.minutoDelDia)
      expect(r.dia).toBe(r0.dia)
    }
    expect((await reloj(page)).velocidad).toBe(3)
    // También con la P desde el teclado (escritorio).
    if (!isMobile) {
      await page.keyboard.press('KeyP')
      await page.keyboard.press('KeyP')
      await expect(confirmar(page)).toBeVisible()
    }
    await page.waitForTimeout(450)
    if (isMobile) await confirmar(page).tap()
    else await confirmar(page).click()
    await cuadra(page, 5000 - precio)
    await page.waitForTimeout(500)
    await cuadra(page, 5000 - precio)
    // Vuelta a Vida: velocidad x3 y el reloj corre (la pausa quedó desactivada: dos pulsaciones).
    await page.evaluate(() => window.__raices!.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    const v0 = await reloj(page)
    // Unos pocos minutos de margen: con acelerar=50 y x3 pasan ~5 ms reales por minuto.
    expect(v0.minutoDelDia - r0.minutoDelDia).toBeLessThan(30)
    expect(v0.velocidad).toBe(3)
    await expect.poll(async () => (await reloj(page)).minutoDelDia).toBeGreaterThan(v0.minutoDelDia)
    await cuadraHud(page, 5000 - precio)
    expect(errores).toEqual([])
  })
})

test.describe('selección y personaje', () => {
  test('Esc y M con panel y confirmación, y destino tocado en Vida: nada queda colgado', async ({
    page,
    isMobile,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&dinero=5000')
    // Vida: tocar un destino; luego M a Plano cancela la ruta.
    const p0 = await personaje(page)
    const destino = await aPantalla(page, p0.x + 3, p0.y - 4)
    if (isMobile) await page.touchscreen.tap(destino.x, destino.y)
    else await page.mouse.click(destino.x, destino.y)
    await expect.poll(() => page.evaluate(() => window.__raices!.destino())).toBeDefined()
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('plano')
    expect(await page.evaluate(() => window.__raices!.destino())).toBeUndefined()
    // Plano: tocar una parcela, abrir la confirmación, Esc cancela, Esc cierra.
    await tocarParcela(page, 33, isMobile)
    await pedir(page).click()
    await expect(confirmar(page)).toBeVisible()
    await page.waitForTimeout(150)
    await page.keyboard.press('Escape')
    await expect(grupo(page)).toHaveCount(0)
    await expect(panel(page)).toHaveCount(1)
    await page.waitForTimeout(150)
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    // Otra vez con la confirmación abierta y M: se cierra todo sin comprar.
    await tocarParcela(page, 33, isMobile)
    await pedir(page).click()
    await expect(confirmar(page)).toBeVisible()
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('vida')
    await expect(panel(page)).toHaveCount(0)
    await cuadraHud(page, 5000)
    // El toque de la parcela en Plano no quedó como destino en Vida.
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => window.__raices!.destino())).toBeUndefined()
    const p1 = await personaje(page)
    await page.waitForTimeout(400)
    expect(await personaje(page)).toEqual(p1)
    // Y de nuevo a Plano: no queda selección vieja.
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('plano')
    expect(await seleccionada(page)).toBeUndefined()
    await expect(panel(page)).toHaveCount(0)
    expect(errores).toEqual([])
  })

  test('joystick con cambio de modo (M) con el dedo puesto, panel y confirmación, vuelta a Vida y joystick otra vez', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'táctil')
    const errores = await abrir(page, '?semilla=42&debug&dinero=5000')
    // Todos los dedos por una sola sesión CDP (mezclar con page.touchscreen deja dedos fantasma).
    const cdp: CDPSession = await page.context().newCDPSession(page)
    const tocar = (type: string, pts: [number, number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: pts.map(([x, y, id]) => ({ x, y, id })),
      } as never)
    let id = 10
    const toque = async (x: number, y: number) => {
      id++
      await tocar('touchStart', [[x, y, id]])
      await page.waitForTimeout(60)
      await tocar('touchEnd', [])
      await page.waitForTimeout(250)
    }
    const centro = async (l: Locator): Promise<[number, number]> => {
      const c = await caja(l)
      return [c.x + c.width / 2, c.y + c.height / 2]
    }
    // Vida: joystick activo y M (teclado del móvil) con el dedo puesto: a Plano.
    await tocar('touchStart', [[200, 600, 1]])
    await tocar('touchMove', [[230, 600, 1]])
    await tocar('touchMove', [[270, 600, 1]])
    await expect.poll(() => page.evaluate(() => window.__raices!.joystickVisible())).toBe(true)
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('plano')
    await expect.poll(() => page.evaluate(() => window.__raices!.joystickVisible())).toBe(false)
    const a0 = await personaje(page)
    await tocar('touchMove', [[300, 600, 1]])
    await page.waitForTimeout(200)
    await tocar('touchEnd', [])
    await page.waitForTimeout(200)
    expect(await personaje(page)).toEqual(a0)
    // Al soltar el dedo del joystick en Plano no se selecciona nada.
    expect(await seleccionada(page)).toBeUndefined()
    // Panel con confirmación abierta (toques reales) y el botón de modo: a Vida sin comprar.
    const p33 = (await page.evaluate(() => window.__raices!.puntoClicParcela(33)))!
    await toque(p33.x, p33.y)
    await expect(panel(page)).toHaveAttribute('data-parcela', '33')
    await toque(...(await centro(pedir(page))))
    await expect(confirmar(page)).toBeVisible()
    await toque(...(await centro(botonModo(page))))
    await expect.poll(() => modo(page)).toBe('vida')
    await expect(panel(page)).toHaveCount(0)
    await cuadraHud(page, 5000)
    // Joystick en Vida: el personaje anda y se para al soltar.
    const a = await personaje(page)
    await tocar('touchStart', [[200, 600, 2]])
    await tocar('touchMove', [[200, 570, 2]])
    await tocar('touchMove', [[200, 520, 2]])
    await expect.poll(async () => (await personaje(page)).y).toBeLessThan(a.y - 0.5)
    await tocar('touchEnd', [])
    await page.waitForTimeout(300)
    const b = await personaje(page)
    await page.waitForTimeout(400)
    expect(await personaje(page), 'el personaje sigue andando tras soltar').toEqual(b)
    // Tocar destino, y a Plano: la ruta se cancela; el toque en la parcela selecciona.
    await toque(200, 300)
    await expect.poll(() => page.evaluate(() => window.__raices!.destino())).toBeDefined()
    await toque(...(await centro(botonModo(page))))
    await expect.poll(() => modo(page)).toBe('plano')
    expect(await page.evaluate(() => window.__raices!.destino())).toBeUndefined()
    const vis = await visibles(page)
    const i = vis.findIndex((v) => v)
    const pi = (await page.evaluate((n) => window.__raices!.puntoClicParcela(n), i))!
    await toque(pi.x, pi.y)
    await expect(panel(page)).toHaveAttribute('data-parcela', String(i))
    await cuadraHud(page, 5000)
    expect(errores).toEqual([])
  })
})

test.describe('reinicio de escena', () => {
  test('reiniciar el valle 5 veces tras comprar: HUD y dibujo coherentes, una compra cobra una vez, sin duplicados', async ({
    page,
    isMobile,
  }) => {
    const errores = await abrir(page, '?semilla=42&debug&modo=plano&dinero=5000&propias=14')
    await cuadra(page, 5000)
    await page.evaluate(() => window.__raices!.seleccionar(15))
    await comprarConInterfaz(page, isMobile)
    for (let k = 0; k < 5; k++) {
      await page.evaluate(() => window.__raices!.reiniciarValle())
      await expect
        .poll(() => page.evaluate(() => window.__raices?.camara()?.zoom))
        .toBeGreaterThan(0)
      await page.waitForTimeout(300)
      // Tras reiniciar, lo que se ve y lo que dice el estado coinciden (sea cual sea el dinero).
      const d = await dinero(page)
      await cuadra(page, d)
    }
    expect(await page.locator('.hud').count()).toBe(1)
    expect(await page.locator('.joystick-base').count()).toBe(1)
    const d0 = await dinero(page)
    const inf = await infos(page)
    const i = inf.findIndex((p) => p.comprable)
    await page.evaluate((n) => window.__raices!.seleccionar(n), i)
    await expect(panel(page)).toHaveCount(1)
    const precio = await comprarConInterfaz(page, isMobile)
    await cuadra(page, d0 - precio)
    await page.waitForTimeout(500)
    await cuadra(page, d0 - precio)
    await expect(page.locator('.aviso')).toHaveCount(1)
    // Esc cierra una vez (un solo oyente de Esc).
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    expect(errores).toEqual([])
  })
})

test.describe('teclado sin ratón', () => {
  test.skip(({ isMobile }) => isMobile, 'teclado')

  test('se puede elegir una parcela y comprarla solo con teclado (Tab, flechas, Enter, Esc)', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42&debug')
    // A Plano con el teclado.
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('plano')
    // Cualquier recorrido razonable de teclado debería poder abrir el panel de alguna parcela.
    const intentos = [
      'Tab',
      'Enter',
      'Space',
      'ArrowRight',
      'Enter',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Tab',
      'Enter',
    ]
    for (const k of intentos) {
      await page.keyboard.press(k)
      if (await panel(page).count()) break
    }
    // Tras recorrer todos los controles con Tab, ninguno abre una parcela.
    await expect(panel(page), 'no hay forma de seleccionar una parcela sin ratón').toHaveCount(1)
    await panel(page).locator('.boton-compra-pedir').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    expect(await dinero(page)).toBeLessThan(1100)
  })

  test('con el panel abierto, Tab llega a «Comprar por N», Enter abre la confirmación y Esc devuelve el foco', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42&debug&modo=plano&dinero=5000')
    await page.evaluate(() => window.__raices!.seleccionar(14))
    await expect(panel(page)).toHaveCount(1)
    const precio = (await infos(page))[14]!.precio!
    // Desde el lienzo, Tab hasta el botón de compra.
    await page.locator('#juego').focus()
    let llegado = false
    for (let k = 0; k < 15 && !llegado; k++) {
      await page.keyboard.press('Tab')
      llegado = await pedir(page).evaluate((b) => b === document.activeElement)
    }
    expect(llegado, 'Tab no llega a «Comprar por N»').toBe(true)
    await page.keyboard.press('Enter')
    await expect(cancelar(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(pedir(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(cancelar(page)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirmar(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await cuadra(page, 5000 - precio)
    // El foco no se pierde en <body>.
    const activo = await page.evaluate(() => document.activeElement?.tagName)
    expect(activo).not.toBe('BODY')
  })
})

test.describe('girar el móvil en cada paso', () => {
  test('Vida, Plano, selección, confirmación, compra y vuelta a Vida: todo a la vista tras girar', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'móvil')
    test.setTimeout(120_000)
    const errores = await abrir(page, '?semilla=42&debug&dinero=5000')
    const tamanos = [
      [915, 412],
      [412, 915],
    ] as const
    const girar = async (paso: string, extra: Locator[] = []) => {
      for (const [w, h] of tamanos) {
        await page.setViewportSize({ width: w, height: h })
        await page.waitForTimeout(500)
        const msg = `${paso} ${w}x${h}`
        for (const l of [
          page.locator('.reloj'),
          page.locator('.dinero'),
          botonModo(page),
          ...extra,
        ])
          await dentro(page, l, msg)
        const din = await caja(page.locator('.dinero'))
        for (const sel of ['.controles-tiempo', '.boton-modo'])
          expect(
            solapa(din, await caja(page.locator(sel).first())),
            `${msg}: dinero solapa ${sel}`,
          ).toBe(false)
        if (await panel(page).count()) {
          const pc = await caja(panel(page))
          expect(solapa(pc, din), `${msg}: el panel tapa el dinero`).toBe(false)
          expect(solapa(pc, await caja(botonModo(page))), `${msg}: panel y botón de modo`).toBe(
            false,
          )
        }
        if ((await modo(page)) === 'vida') {
          const p = await personaje(page)
          const s = await aPantalla(page, p.x, p.y)
          expect(s.x > 0 && s.x < w && s.y > 0 && s.y < h, `${msg}: personaje fuera`).toBe(true)
        }
      }
    }
    await girar('vida')
    await botonModo(page).tap()
    await expect.poll(() => modo(page)).toBe('plano')
    await girar('plano')
    await page.evaluate(() => window.__raices!.seleccionar(14))
    await expect(panel(page)).toHaveCount(1)
    await girar('seleccion', [pedir(page)])
    await pedir(page).tap()
    await expect(confirmar(page)).toBeVisible()
    await girar('confirmacion', [confirmar(page), cancelar(page)])
    const precio = (await infos(page))[14]!.precio!
    await page.waitForTimeout(450)
    await confirmar(page).tap()
    await cuadra(page, 5000 - precio)
    await girar('tras-compra')
    await botonModo(page).tap()
    await expect.poll(() => modo(page)).toBe('vida')
    await girar('vuelta-vida')
    await cuadraHud(page, 5000 - precio)
    expect(errores).toEqual([])
  })
})

test.describe('rendimiento global M3', () => {
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

  test('fps en Vida, en Plano y en Plano con muchas propias y el panel abierto (anota)', async ({
    page,
  }, info) => {
    // 20 propias en bloque (filas 0-2 y dos de la fila 3), dinero de sobra.
    const propias = Array.from({ length: 20 }, (_, i) => i).join(',')
    await abrir(page, `?semilla=42&debug&dinero=100000000&propias=${propias}`)
    await page.waitForTimeout(800)
    const vida = await fps(page, 3000)
    await page.keyboard.press('KeyM')
    await expect.poll(() => modo(page)).toBe('plano')
    await page.waitForTimeout(800)
    const plano = await fps(page, 3000)
    await page.evaluate(() => window.__raices!.seleccionar(20))
    await expect(panel(page)).toHaveCount(1)
    await page.waitForTimeout(800)
    const conPanel = await fps(page, 3000)
    await pedir(page).click()
    await expect(confirmar(page)).toBeVisible()
    const conConfirmacion = await fps(page, 3000)
    const msg = `fps: vida ${vida.toFixed(1)}, plano ${plano.toFixed(1)}, plano+panel ${conPanel.toFixed(1)}, plano+confirmacion ${conConfirmacion.toFixed(1)}`
    info.annotations.push({ type: 'rendimiento', description: msg })
    console.log(msg)
    expect(conPanel, msg).toBeGreaterThan(15)
    expect(conPanel / vida, `el panel cuesta demasiado: ${msg}`).toBeGreaterThan(0.6)
  })
})
