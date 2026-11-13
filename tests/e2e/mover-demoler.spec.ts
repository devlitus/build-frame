import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test'

/**
 * M4-06 · Mover y demoler: seleccionar un edificio, moverlo (sitio válido e inválido), demolerlo con
 * su reembolso, cancelar una obra y usar el teclado. Valen en escritorio (ratón y teclado) y en
 * móvil emulado (tocar y botones). Los edificios se levantan con comandos (la interfaz de construir
 * ya tiene su spec) y los sitios se buscan con el gancho `colocacion`.
 */

const QUERY = '?semilla=42&debug&modo=plano&propias=14,15,20,21'
type Punto = { x: number; y: number }
type Sitio = { x: number; y: number; punto: Punto }
type Obra = { id: number; x: number; y: number }

const esMovil = () => test.info().project.name === 'movil'
const panel = (page: Page, nombre: string | RegExp) => page.getByRole('region', { name: nombre })

async function abrir(page: Page): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text())
  })
  await page.goto(`./${QUERY}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.zoom)).toBeGreaterThan(0)
  await page.waitForTimeout(300)
  // Vivienda a la izquierda y almacén a la derecha de las casillas centrales.
  await page.evaluate(() => {
    const r = window.__raices
    r?.emitir({ tipo: 'PintarZona', x0: 40, y0: 40, x1: 47, y1: 55, zona: 'vivienda' })
    r?.emitir({ tipo: 'PintarZona', x0: 48, y0: 40, x1: 55, y1: 55, zona: 'almacen' })
  })
  return errores
}

/**
 * Sitios válidos de `tipo` (esquina) con un punto de pantalla donde apuntar, de más cerca a más
 * lejos del centro del valle. `lejos` salta las primeras casillas para no pegarse a otro edificio.
 */
async function sitios(page: Page, tipo: string, min = 1): Promise<Sitio[]> {
  await camaraQuieta(page)
  const lista = await page.evaluate(
    ({ tipo }) => {
      const r = window.__raices
      const [w, h] = ({ casa: [4, 3], 'caja-envio': [1, 1], cobertizo: [3, 2] }[tipo] ?? [
        1, 1,
      ]) as [number, number]
      const c: (Sitio & { d: number })[] = []
      for (let y = 36; y < 60; y++) {
        for (let x = 36; x < 60; x++) {
          const v = r?.colocacion(tipo, x, y)
          if (!v?.valida) continue
          const p = r?.puntoClicCasilla(x + Math.floor((w - 1) / 2), y + Math.floor((h - 1) / 2))
          if (p) c.push({ x, y, punto: p, d: Math.hypot(x - 48, y - 48) })
        }
      }
      return c.sort((a, b) => a.d - b.d)
    },
    { tipo },
  )
  if (lista.length < min) throw new Error(`Faltan sitios válidos para ${tipo}`)
  return lista
}

/** Espera a que la cámara termine de deslizarse (guía o vuelta de la extensión). */
async function camaraQuieta(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__raices?.camara()?.guiando), { timeout: 15_000 })
    .toBe(false)
}

const edificios = (page: Page) => page.evaluate(() => window.__raices?.edificios() ?? [])
const dinero = (page: Page) => page.evaluate(() => window.__raices?.dinero())
const materiales = (page: Page) => page.evaluate(() => window.__raices?.materiales())

/** Levanta `tipo` con el comando y devuelve su id; `terminar` pasa los días de obra necesarios. */
async function levantar(page: Page, tipo: string, s: Punto, terminar: boolean): Promise<Obra> {
  const antes = (await edificios(page)).map((e) => e.id)
  await page.evaluate(
    ({ tipo, s }) => window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: tipo, ...s }),
    { tipo, s },
  )
  // La vista se actualiza en el siguiente fotograma: se espera a ver el edificio nuevo.
  await expect
    .poll(async () => (await edificios(page)).some((e) => !antes.includes(e.id)), {
      message: `No se pudo construir ${tipo} en ${s.x},${s.y}`,
    })
    .toBe(true)
  const nuevo = (await edificios(page)).find((e) => !antes.includes(e.id))
  if (!nuevo) throw new Error('sin edificio nuevo')
  if (terminar) await terminarObras(page)
  return { id: nuevo.id, x: nuevo.x, y: nuevo.y }
}

async function terminarObras(page: Page): Promise<void> {
  await page.evaluate(() => {
    const r = window.__raices
    for (let i = 0; i < 4; i++) {
      r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
    }
    r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
  })
  await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
  await expect.poll(async () => (await edificios(page)).every((e) => !e.enObra)).toBe(true)
  // El desmayo llevó la cámara al personaje: se vuelve al centro del valle.
  await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
  await page.waitForTimeout(300)
}

let cdp: CDPSession | undefined
test.beforeEach(() => {
  cdp = undefined
})

/** Toca o hace clic en un punto de pantalla. */
async function pulsar(page: Page, p: Punto): Promise<void> {
  if (esMovil()) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
}

/** Apunta a un punto: ratón (mover, sin pulsar) o un toque. */
async function apuntar(page: Page, p: Punto): Promise<void> {
  if (esMovil()) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.move(p.x, p.y)
}

/** Arrastra un dedo (CDP): el toque corto lo toma la selección y el arrastre lo toma la silueta. */
async function arrastrarDedo(page: Page, a: Punto, b: Punto): Promise<void> {
  const sesion = (cdp ??= await page.context().newCDPSession(page))
  const toque = (tipo: 'touchStart' | 'touchMove' | 'touchEnd', p?: Punto) =>
    sesion.send('Input.dispatchTouchEvent', {
      type: tipo,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [],
    })
  await toque('touchStart', a)
  for (let i = 1; i <= 5; i++) {
    await toque('touchMove', { x: a.x + ((b.x - a.x) * i) / 5, y: a.y + ((b.y - a.y) * i) / 5 })
  }
  await toque('touchEnd')
}

/** Selecciona el edificio tocándolo de verdad. */
async function tocarEdificio(page: Page, id: number): Promise<void> {
  await camaraQuieta(page)
  // El punto se recalcula hasta que el edificio se vea (la cámara puede estar asentándose).
  let punto: Punto | undefined
  await expect
    .poll(
      async () => {
        punto = await page.evaluate((id) => window.__raices?.puntoClicEdificio(id), id)
        return punto
      },
      { message: `El edificio ${id} no se ve` },
    )
    .toBeDefined()
  await pulsar(page, punto as Punto)
  await expect.poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id)).toBe(id)
}

const silueta = (page: Page) => page.evaluate(() => window.__raices?.construccion()?.silueta)
const enMovimiento = (page: Page) => page.evaluate(() => window.__raices?.construccion()?.origen)

const boton = (p: Locator, nombre: string | RegExp) => p.getByRole('button', { name: nombre })

test('tocar un edificio terminado lo selecciona: panel con Mover y Demoler, y fuera de él, la parcela', async ({
  page,
}) => {
  const errores = await abrir(page)
  const [s] = await sitios(page, 'caja-envio')
  const caja = await levantar(page, 'caja-envio', s as Sitio, true)
  await tocarEdificio(page, caja.id)
  const p = panel(page, 'Caja de envío')
  await expect(p).toBeVisible()
  await expect(p).toContainText('Terminado')
  await expect(boton(p, 'Mover')).toBeVisible()
  await expect(boton(p, 'Demoler')).toBeVisible()
  expect(await page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
  // Los botones se pueden tocar con el dedo.
  for (const b of ['Mover', 'Demoler']) {
    const caja = await boton(p, b).boundingBox()
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  // Fuera del edificio se elige la parcela y el panel del edificio se va.
  const otra = await page.evaluate(() => window.__raices?.puntoClicParcela(14))
  const lejos = (await sitios(page, 'caja-envio', 2)).at(-1) as Sitio
  await pulsar(page, lejos.punto)
  await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBeDefined()
  await expect(p).toHaveCount(0)
  expect(await page.evaluate(() => window.__raices?.edificioSeleccionado()?.id)).toBeUndefined()
  expect(otra).toBeDefined()
  expect(errores).toEqual([])
})

test('la casa se puede mover pero no demoler: no hay botón Demoler', async ({ page }) => {
  const errores = await abrir(page)
  const [s] = await sitios(page, 'casa')
  const casa = await levantar(page, 'casa', s as Sitio, true)
  await tocarEdificio(page, casa.id)
  const p = panel(page, 'Casa')
  await expect(p).toBeVisible()
  await expect(boton(p, 'Mover')).toBeVisible()
  await expect(boton(p, 'Demoler')).toHaveCount(0)
  await expect(boton(p, 'Cancelar obra')).toHaveCount(0)
  await expect(p).toContainText('no demoler')
  expect(errores).toEqual([])
})

test('una obra ofrece Cancelar obra (y no Mover); cancelar devuelve todo lo pagado', async ({
  page,
}) => {
  const errores = await abrir(page)
  const d0 = await dinero(page)
  const m0 = await materiales(page)
  const [s] = await sitios(page, 'cobertizo')
  const obra = await levantar(page, 'cobertizo', s as Sitio, false)
  expect(await dinero(page)).toBe((d0 ?? 0) - 300)
  await tocarEdificio(page, obra.id)
  const p = panel(page, 'Cobertizo')
  await expect(p).toContainText('En obra')
  await expect(boton(p, 'Mover')).toHaveCount(0)
  await expect(boton(p, 'Demoler')).toHaveCount(0)
  await boton(p, 'Cancelar obra').click()
  const dialogo = p.getByRole('alertdialog')
  await expect(dialogo).toContainText('¿Cancelar la obra de Cobertizo?')
  await expect(dialogo).toContainText('Te devuelven todo: 300 monedas, 50 de madera y 10 de piedra')
  // Dinero y materiales aún no han cambiado.
  expect(await dinero(page)).toBe((d0 ?? 0) - 300)
  await boton(dialogo, 'Sí, cancelar obra').click()
  await expect.poll(() => dinero(page)).toBe(d0)
  expect(await materiales(page)).toEqual(m0)
  expect(await edificios(page)).toEqual([])
  await expect(p).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Obra cancelada' })).toBeVisible()
  expect(errores).toEqual([])
})

test('«No, seguir con la obra» y Escape no cancelan nada', async ({ page }) => {
  await abrir(page)
  const [s] = await sitios(page, 'caja-envio')
  const obra = await levantar(page, 'caja-envio', s as Sitio, false)
  await tocarEdificio(page, obra.id)
  const p = panel(page, 'Caja de envío')
  await boton(p, 'Cancelar obra').click()
  await boton(p, 'No, seguir con la obra').click()
  await expect(p.getByRole('alertdialog')).toHaveCount(0)
  expect((await edificios(page)).length).toBe(1)
  if (!esMovil()) {
    await boton(p, 'Cancelar obra').click()
    await expect(p.getByRole('alertdialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(p.getByRole('alertdialog')).toHaveCount(0)
    await expect(p).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(p).toHaveCount(0)
    expect((await edificios(page)).length).toBe(1)
  }
})

test('demoler pide confirmación con el reembolso exacto: la mitad redondeada hacia abajo', async ({
  page,
}) => {
  const errores = await abrir(page)
  const [s] = await sitios(page, 'cobertizo')
  const cobertizo = await levantar(page, 'cobertizo', s as Sitio, true)
  const d1 = (await dinero(page)) ?? 0
  const m1 = (await materiales(page)) ?? { madera: 0, piedra: 0 }
  await tocarEdificio(page, cobertizo.id)
  const p = panel(page, 'Cobertizo')
  await boton(p, 'Demoler').click()
  const dialogo = p.getByRole('alertdialog')
  await expect(dialogo).toContainText('¿Demoler Cobertizo?')
  await expect(dialogo).toContainText('Recuperas: 150 monedas, 25 de madera y 5 de piedra')
  expect(await dinero(page)).toBe(d1)
  expect((await edificios(page)).length).toBe(1)
  await boton(dialogo, 'Sí, demoler').click()
  await expect.poll(() => dinero(page)).toBe(d1 + 150)
  expect(await materiales(page)).toEqual({ madera: m1.madera + 25, piedra: m1.piedra + 5 })
  expect(await edificios(page)).toEqual([])
  await expect(p).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Demolido: Cobertizo' })).toBeVisible()
  expect(errores).toEqual([])
})

test('construir y demoler nunca deja más dinero ni materiales que al principio', async ({
  page,
}) => {
  await abrir(page)
  const d0 = (await dinero(page)) ?? 0
  const m0 = (await materiales(page)) ?? { madera: 0, piedra: 0 }
  const [s] = await sitios(page, 'caja-envio')
  const caja = await levantar(page, 'caja-envio', s as Sitio, true)
  await tocarEdificio(page, caja.id)
  const p = panel(page, 'Caja de envío')
  await boton(p, 'Demoler').click()
  await boton(p.getByRole('alertdialog'), 'Sí, demoler').click()
  await expect.poll(async () => (await edificios(page)).length).toBe(0)
  expect(await dinero(page)).toBeLessThanOrEqual(d0)
  const m = (await materiales(page)) ?? { madera: 0, piedra: 0 }
  expect(m.madera).toBeLessThanOrEqual(m0.madera)
  expect(m.piedra).toBeLessThanOrEqual(m0.piedra)
})

test('mover a un sitio válido: silueta verde, gratis, y el edificio se redibuja sin objetos huérfanos', async ({
  page,
}) => {
  const errores = await abrir(page)
  const [s] = await sitios(page, 'caja-envio')
  const caja = await levantar(page, 'caja-envio', s as Sitio, true)
  const d1 = await dinero(page)
  const m1 = await materiales(page)
  const objetos = await page.evaluate(() => window.__raices?.objetosValle())
  await tocarEdificio(page, caja.id)
  const p = panel(page, 'Caja de envío')
  await boton(p, 'Mover').click()
  const pm = panel(page, 'Mover edificio')
  await expect(pm).toBeVisible()
  await expect(pm).toContainText('Mover Caja de envío')
  await expect(pm).toContainText('Mover es gratis')
  expect(await enMovimiento(page)).toBe(caja.id)
  await expect(p).toHaveCount(0)
  // La silueta empieza donde está el edificio, que no choca consigo mismo.
  await expect.poll(() => silueta(page)).toMatchObject({ x: caja.x, y: caja.y })
  // A otro sitio válido, lejos del actual.
  const destino = (await sitios(page, 'caja-envio', 3))
    .filter((q) => Math.hypot(q.x - caja.x, q.y - caja.y) > 3)
    .at(0) as Sitio
  await apuntar(page, destino.punto)
  await expect.poll(() => silueta(page)).toMatchObject({ x: destino.x, y: destino.y, valida: true })
  await expect(pm).toContainText('Aquí se puede mover')
  // Hasta confirmar nada cambia.
  expect((await edificios(page))[0]).toMatchObject({ x: caja.x, y: caja.y })
  await boton(pm, 'Mover aquí').click()
  await expect
    .poll(async () => (await edificios(page))[0])
    .toMatchObject({
      x: destino.x,
      y: destino.y,
    })
  expect(await enMovimiento(page)).toBeUndefined()
  expect(await page.evaluate(() => window.__raices?.construccion()?.abierto)).toBe(false)
  expect(await dinero(page)).toBe(d1)
  expect(await materiales(page)).toEqual(m1)
  // Un solo edificio, con la profundidad del borde inferior de su nueva huella (32 px por casilla).
  const lista = await edificios(page)
  expect(lista).toHaveLength(1)
  expect(lista[0]?.profundidad).toBe((destino.y + 1) * 32)
  expect(await page.evaluate(() => window.__raices?.objetosValle())).toBe(objetos)
  await expect(page.getByRole('status').filter({ hasText: 'Movido: Caja de envío' })).toBeVisible()
  expect(errores).toEqual([])
})

test('mover a un sitio inválido: silueta roja con su motivo y el botón no mueve', async ({
  page,
}) => {
  const errores = await abrir(page)
  const [s] = await sitios(page, 'caja-envio')
  const caja = await levantar(page, 'caja-envio', s as Sitio, true)
  // Una segunda caja: mover la primera encima de ella da «ocupada».
  const otraSitio = (await sitios(page, 'caja-envio', 2)).find(
    (q) => Math.hypot(q.x - caja.x, q.y - caja.y) > 2,
  ) as Sitio
  const otra = await levantar(page, 'caja-envio', otraSitio, true)
  await tocarEdificio(page, caja.id)
  await boton(panel(page, 'Caja de envío'), 'Mover').click()
  const pm = panel(page, 'Mover edificio')
  await expect(pm).toBeVisible()
  const sobreOtra = await page.evaluate((o) => window.__raices?.puntoClicCasilla(o.x, o.y), otra)
  if (!sobreOtra) throw new Error('La otra caja no se ve')
  await apuntar(page, sobreOtra)
  await expect
    .poll(() => silueta(page))
    .toMatchObject({ x: otra.x, y: otra.y, valida: false, motivo: 'ocupada' })
  await expect(pm).toContainText('Ya hay otro edificio u obra')
  const confirmar = boton(pm, 'Mover aquí')
  await expect(confirmar).toHaveAttribute('aria-disabled', 'true')
  await confirmar.click({ force: true })
  expect(await enMovimiento(page)).toBe(caja.id)
  expect((await edificios(page)).find((e) => e.id === caja.id)).toMatchObject({
    x: caja.x,
    y: caja.y,
  })
  // Un sitio fuera de la zona del edificio (la caja admite vivienda y almacén; un cobertizo no) también se rechaza.
  const fueraDeParcela = await page.evaluate(() => window.__raices?.puntoClicCasilla(20, 20))
  if (fueraDeParcela) {
    await apuntar(page, fueraDeParcela)
    await expect.poll(async () => (await silueta(page))?.valida).toBe(false)
    await expect(pm.locator('[data-valida="false"]')).toBeVisible()
  }
  // Cancelar sale del modo sin tocar nada.
  await boton(pm, 'Cancelar').click()
  await expect(pm).toHaveCount(0)
  expect(await enMovimiento(page)).toBeUndefined()
  expect(errores).toEqual([])
})

test('mover arrastrando con un dedo ajusta la silueta y solo el botón confirma', async ({
  page,
}) => {
  test.skip(!esMovil(), 'arrastrar con el dedo es de móvil')
  await abrir(page)
  const [s] = await sitios(page, 'caja-envio')
  const caja = await levantar(page, 'caja-envio', s as Sitio, true)
  await tocarEdificio(page, caja.id)
  await boton(panel(page, 'Caja de envío'), 'Mover').click()
  const pm = panel(page, 'Mover edificio')
  const destino = (await sitios(page, 'caja-envio', 3)).find(
    (q) => Math.hypot(q.x - caja.x, q.y - caja.y) > 3,
  ) as Sitio
  const inicio = await page.evaluate((c) => window.__raices?.puntoClicCasilla(c.x, c.y), caja)
  if (!inicio) throw new Error('El edificio no se ve')
  await arrastrarDedo(page, inicio, destino.punto)
  await expect.poll(() => silueta(page)).toMatchObject({ x: destino.x, y: destino.y })
  expect((await edificios(page))[0]).toMatchObject({ x: caja.x, y: caja.y })
  await boton(pm, 'Mover aquí').click()
  await expect
    .poll(async () => (await edificios(page))[0])
    .toMatchObject({
      x: destino.x,
      y: destino.y,
    })
})

test('seleccionar un edificio cierra el pincel y el modo Construir; abrirlos suelta el edificio', async ({
  page,
}) => {
  await abrir(page)
  const [s] = await sitios(page, 'caja-envio')
  const caja = await levantar(page, 'caja-envio', s as Sitio, true)
  await tocarEdificio(page, caja.id)
  await expect(page.getByRole('button', { name: 'Construir', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Zonas', exact: true }).click()
  expect(await page.evaluate(() => window.__raices?.edificioSeleccionado()?.id)).toBeUndefined()
  expect(await page.evaluate(() => window.__raices?.pincel()?.abierto)).toBe(true)
  await page.getByRole('button', { name: 'Listo', exact: true }).click()
  await tocarEdificio(page, caja.id)
  expect(await page.evaluate(() => window.__raices?.pincel()?.abierto)).toBe(false)
  // Volver a Vida lo suelta.
  await page.getByRole('button', { name: /Modo de juego/ }).click()
  await expect
    .poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id))
    .toBeUndefined()
  await expect(panel(page, 'Caja de envío')).toHaveCount(0)
})

test('teclado: Enter elige el edificio del centro, Tab llega al panel y Demoler se confirma con Enter', async ({
  page,
}) => {
  test.skip(esMovil(), 'el teclado es de escritorio')
  const errores = await abrir(page)
  // La caja en la casilla del centro de la vista (el cursor del teclado en el Modo Plano).
  const v = await page.evaluate(() => window.__raices?.colocacion('caja-envio', 48, 48))
  test.skip(!v?.valida, 'la casilla central no admite una caja con esta semilla')
  const caja = await levantar(page, 'caja-envio', { x: 48, y: 48 }, true)
  const d1 = (await dinero(page)) ?? 0
  await page.locator('#juego').focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id))
    .toBe(caja.id)
  expect(await page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
  const p = panel(page, 'Caja de envío')
  await expect(p).toBeVisible()
  // Con el teclado la confirmación deja el foco en «Sí»: Enter y otra pulsación demuelen.
  await boton(p, 'Demoler').focus()
  await page.keyboard.press('Enter')
  const dialogo = p.getByRole('alertdialog')
  await expect(dialogo).toBeVisible()
  await expect(boton(dialogo, 'Sí, demoler')).toBeFocused()
  // Mantener Enter (repetición) no confirma: hace falta una pulsación nueva.
  await page.keyboard.down('Enter')
  await page.keyboard.up('Enter')
  await expect.poll(() => dinero(page)).toBe(d1 + 25)
  expect(await edificios(page)).toEqual([])
  expect(errores).toEqual([])
})

test('teclado: con una parcela elegida, Enter sobre un edificio del centro cambia la selección a ese edificio', async ({
  page,
}) => {
  test.skip(esMovil(), 'el teclado es de escritorio')
  const errores = await abrir(page)
  const v = await page.evaluate(() => window.__raices?.colocacion('caja-envio', 48, 48))
  test.skip(!v?.valida, 'la casilla central no admite una caja con esta semilla')
  const caja = await levantar(page, 'caja-envio', { x: 48, y: 48 }, true)
  await page.evaluate(() => window.__raices?.seleccionar(14))
  await expect.poll(() => page.evaluate(() => window.__raices?.seleccionada())).toBe(14)
  // Elegir la parcela lleva la vista a ella: se vuelve al centro del valle, donde está la caja.
  await camaraQuieta(page)
  await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
  await camaraQuieta(page)
  await page.locator('#juego').focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.edificioSeleccionado()?.id))
    .toBe(caja.id)
  expect(await page.evaluate(() => window.__raices?.seleccionada())).toBeUndefined()
  await expect(panel(page, 'Caja de envío')).toBeVisible()
  expect(errores).toEqual([])
})

test('teclado: Mover con las flechas y Enter; Escape cancela', async ({ page }) => {
  test.skip(esMovil(), 'el teclado es de escritorio')
  const errores = await abrir(page)
  const v = await page.evaluate(() => window.__raices?.colocacion('caja-envio', 48, 48))
  test.skip(!v?.valida, 'la casilla central no admite una caja con esta semilla')
  const caja = await levantar(page, 'caja-envio', { x: 48, y: 48 }, true)
  await tocarEdificio(page, caja.id).catch(() =>
    page.evaluate((id) => window.__raices?.seleccionarEdificio(id), caja.id),
  )
  await boton(panel(page, 'Caja de envío'), 'Mover').focus()
  await page.keyboard.press('Enter')
  expect(await enMovimiento(page)).toBe(caja.id)
  // El foco volvió al lienzo: las flechas mueven la silueta, no la cámara.
  await expect(page.locator('#juego')).toBeFocused()
  const antes = await silueta(page)
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await silueta(page))?.x).toBe((antes?.x ?? 0) + 1)
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await silueta(page))?.y).toBe((antes?.y ?? 0) + 1)
  // Escape cancela: el edificio no se movió.
  await page.keyboard.press('Escape')
  await expect.poll(() => enMovimiento(page)).toBeUndefined()
  expect(await page.evaluate(() => window.__raices?.construccion()?.abierto)).toBe(false)
  expect((await edificios(page))[0]).toMatchObject({ x: caja.x, y: caja.y })
  // De nuevo, y esta vez Enter con la silueta verde mueve.
  await page.evaluate((id) => window.__raices?.seleccionarEdificio(id), caja.id)
  await boton(panel(page, 'Caja de envío'), 'Mover').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
  const objetivo = await silueta(page)
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await edificios(page))[0])
    .toMatchObject({
      x: objetivo?.x,
      y: objetivo?.y,
    })
  expect(await enMovimiento(page)).toBeUndefined()
  expect(errores).toEqual([])
})

test('una obra no se puede mover ni demoler: el panel solo ofrece cancelarla', async ({ page }) => {
  await abrir(page)
  const [s] = await sitios(page, 'caja-envio')
  const obra = await levantar(page, 'caja-envio', s as Sitio, false)
  const r = await page.evaluate(({ id, x, y }) => {
    const e = window.__raices
    const antes = e?.edificios().map((b) => `${b.id}:${b.x},${b.y}`)
    e?.emitir({ tipo: 'MoverEdificio', id, x: x + 1, y })
    e?.emitir({ tipo: 'DemolerEdificio', id })
    return { antes, despues: e?.edificios().map((b) => `${b.id}:${b.x},${b.y}`) }
  }, obra)
  expect(r.despues).toEqual(r.antes)
})
