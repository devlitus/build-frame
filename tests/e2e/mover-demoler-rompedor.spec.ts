/**
 * Rompedor · M4-06 Mover y demoler. Ataques de interfaz: doble clic y doble toque en «Sí, demoler»,
 * «Mover aquí» y «Mover», Enter mantenido, M y Esc a destiempo, Enter en el mismo sitio, el
 * edificio y la silueta tapados por el panel (también en 640×320 y en vertical), fugas tras mover y
 * demoler muchas veces, contexto WebGL perdido y capturas para la verificación visual.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'

const QUERY = '?semilla=42&debug&modo=plano&propias=14,15,20,21'
type Punto = { x: number; y: number }
type Sitio = { x: number; y: number; punto: Punto }
type Obra = { id: number; x: number; y: number }

const esMovil = () => test.info().project.name === 'movil'
const panel = (page: Page, nombre: string | RegExp) => page.getByRole('region', { name: nombre })
const boton = (p: Locator, nombre: string | RegExp) =>
  p.getByRole('button', { name: nombre, exact: typeof nombre === 'string' })
const TAM: Record<string, [number, number]> = {
  casa: [4, 3],
  'caja-envio': [1, 1],
  cobertizo: [3, 2],
}

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
  await page.evaluate(() => {
    const r = window.__raices
    r?.emitir({ tipo: 'PintarZona', x0: 40, y0: 40, x1: 47, y1: 55, zona: 'vivienda' })
    r?.emitir({ tipo: 'PintarZona', x0: 48, y0: 40, x1: 55, y1: 55, zona: 'almacen' })
  })
  return errores
}

/** Sitios válidos de `tipo` cuyo centro se ve (lienzo, no tapado), de más cerca a más lejos de (48, 48). */
async function sitios(page: Page, tipo: string): Promise<Sitio[]> {
  const [w, h] = TAM[tipo] ?? [1, 1]
  const lista = await page.evaluate(
    ({ tipo, w, h }) => {
      const r = window.__raices
      const c: (Sitio & { d: number })[] = []
      for (let y = 36; y < 60; y++) {
        for (let x = 36; x < 60; x++) {
          if (!r?.colocacion(tipo, x, y)?.valida) continue
          const p = r.puntoClicCasilla(x + Math.floor((w - 1) / 2), y + Math.floor((h - 1) / 2))
          if (!p || document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS') continue
          c.push({ x, y, punto: p, d: Math.hypot(x - 48, y - 48) })
        }
      }
      return c.sort((a, b) => a.d - b.d)
    },
    { tipo, w, h },
  )
  if (lista.length === 0) throw new Error(`Sin sitios válidos para ${tipo}`)
  return lista
}

const edificios = (page: Page) => page.evaluate(() => window.__raices?.edificios() ?? [])
const dinero = (page: Page) => page.evaluate(() => window.__raices?.dinero())
const seleccionado = (page: Page) => page.evaluate(() => window.__raices?.edificioSeleccionado())
const construccion = (page: Page) => page.evaluate(() => window.__raices?.construccion())
const parcela = (page: Page) => page.evaluate(() => window.__raices?.seleccionada())

async function levantar(page: Page, tipo: string, s: Punto, terminar: boolean): Promise<Obra> {
  const antes = (await edificios(page)).map((e) => e.id)
  await page.evaluate(
    ({ tipo, s }) =>
      window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: tipo, x: s.x, y: s.y }),
    { tipo, s },
  )
  await expect
    .poll(async () => (await edificios(page)).some((e) => !antes.includes(e.id)))
    .toBe(true)
  const nuevo = (await edificios(page)).find((e) => !antes.includes(e.id))
  if (!nuevo) throw new Error('sin edificio nuevo')
  if (terminar) {
    await page.evaluate(() => {
      const r = window.__raices
      for (let i = 0; i < 4; i++) {
        r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
        r?.emitir({ tipo: 'AvanzarTiempo', minutos: 100_000 })
      }
      r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    })
    await expect.poll(async () => (await edificios(page)).every((e) => !e.enObra)).toBe(true)
    await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
    await page.waitForTimeout(300)
  }
  return { id: nuevo.id, x: nuevo.x, y: nuevo.y }
}

async function pulsar(page: Page, p: Punto): Promise<void> {
  if (esMovil()) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
}

/** Dos clics (o dos toques) rápidos en el centro del elemento. */
async function doble(page: Page, l: Locator): Promise<void> {
  const b = await l.boundingBox()
  if (!b) throw new Error('el botón no se ve')
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  if (esMovil()) {
    await page.touchscreen.tap(x, y)
    await page.waitForTimeout(60)
    await page.touchscreen.tap(x, y)
  } else await page.mouse.dblclick(x, y)
}

/** Punto de pantalla del centro de la casilla con la cámara actual, si cae sobre el lienzo (no tapado). */
async function puntoVisible(page: Page, cx: number, cy: number): Promise<Punto | undefined> {
  return page.evaluate(
    ({ cx, cy }) => {
      const c = window.__raices?.camara()
      if (!c) return undefined
      const x = ((cx + 0.5) * 32 - c.scrollX - c.ancho / 2) * c.zoom + c.ancho / 2
      const y = ((cy + 0.5) * 32 - c.scrollY - c.alto / 2) * c.zoom + c.alto / 2
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return undefined
      return document.elementFromPoint(x, y)?.tagName === 'CANVAS' ? { x, y } : undefined
    },
    { cx, cy },
  )
}

/** Toca el edificio de verdad (o, si no se ve en ningún sitio, lo elige con el gancho). */
async function tocarEdificio(page: Page, id: number): Promise<void> {
  let punto = await page.evaluate((id) => window.__raices?.puntoClicEdificio(id), id)
  if (!punto) {
    const e = (await edificios(page)).find((b) => b.id === id)
    if (e) {
      for (let y = e.y; y < e.y + e.alto && !punto; y++) {
        for (let x = e.x; x < e.x + e.ancho && !punto; x++) punto = await puntoVisible(page, x, y)
      }
    }
  }
  if (punto) await pulsar(page, punto)
  else await page.evaluate((id) => window.__raices?.seleccionarEdificio(id), id)
  await expect.poll(async () => (await seleccionado(page))?.id).toBe(id)
}

/** Casillas de la huella cuyo centro no se ve (fuera de pantalla o tapadas por el HUD o un panel). */
async function casillasTapadas(page: Page, h: { x: number; y: number; w: number; alto: number }) {
  const tapadas: string[] = []
  for (let y = h.y; y < h.y + h.alto; y++) {
    for (let x = h.x; x < h.x + h.w; x++) {
      if (!(await puntoVisible(page, x, y))) tapadas.push(`${x},${y}`)
    }
  }
  return tapadas
}

test.describe('M4-06 rompedor · interfaz', () => {
  test('[S3] doble clic o doble toque en «Sí, demoler»: el segundo no elige otra cosa', async ({
    page,
  }) => {
    const errores = await abrir(page)
    const [s] = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', s as Sitio, true)
    await tocarEdificio(page, caja.id)
    const p = panel(page, 'Caja de envío')
    await boton(p, 'Demoler').click()
    const si = boton(p.getByRole('alertdialog'), 'Sí, demoler')
    await expect(si).toBeVisible()
    await page.waitForTimeout(500) // fuera de la ventana antidoble de «Demoler»
    await doble(page, si)
    await expect.poll(async () => (await edificios(page)).length).toBe(0)
    await page.waitForTimeout(300)
    // Demoler una sola vez y no abrir nada con el segundo toque.
    expect(await seleccionado(page)).toMatchObject({ id: undefined })
    expect(await parcela(page), 'el segundo toque eligió una parcela').toBeUndefined()
    expect((await construccion(page))?.abierto, 'el segundo toque abrió Construir').toBe(false)
    expect(errores).toEqual([])
  })

  test('[S3] doble clic o doble toque en «Mover aquí»: mueve una vez y el segundo no elige nada', async ({
    page,
  }) => {
    const errores = await abrir(page)
    const lista = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', lista[0] as Sitio, true)
    await tocarEdificio(page, caja.id)
    await boton(panel(page, 'Caja de envío'), 'Mover').click()
    const pm = panel(page, 'Mover edificio')
    await expect(pm).toBeVisible()
    const destino = (await sitios(page, 'caja-envio')).find(
      (q) => Math.hypot(q.x - caja.x, q.y - caja.y) > 3,
    ) as Sitio
    await pulsar(page, destino.punto)
    await expect
      .poll(async () => (await construccion(page))?.silueta)
      .toMatchObject({ x: destino.x, y: destino.y, valida: true })
    await doble(page, boton(pm, 'Mover aquí'))
    await expect
      .poll(async () => (await edificios(page))[0])
      .toMatchObject({ x: destino.x, y: destino.y })
    await page.waitForTimeout(300)
    expect(await seleccionado(page)).toMatchObject({ id: undefined })
    expect(await parcela(page), 'el segundo toque eligió una parcela').toBeUndefined()
    expect((await construccion(page))?.abierto).toBe(false)
    expect(errores).toEqual([])
  })

  test('[S3] doble clic o doble toque en «Mover»: el modo mover sigue abierto', async ({
    page,
  }) => {
    await abrir(page)
    const [s] = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', s as Sitio, true)
    await tocarEdificio(page, caja.id)
    await doble(page, boton(panel(page, 'Caja de envío'), 'Mover'))
    await page.waitForTimeout(300)
    expect((await construccion(page))?.origen, 'el segundo toque canceló el modo mover').toBe(
      caja.id,
    )
    expect((await edificios(page))[0]).toMatchObject({ x: caja.x, y: caja.y })
  })

  test('mantener Enter sobre «Demoler» no demuele sin soltar la tecla', async ({ page }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    await abrir(page)
    const [s] = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', s as Sitio, true)
    await tocarEdificio(page, caja.id)
    const p = panel(page, 'Caja de envío')
    await boton(p, 'Demoler').focus()
    await page.keyboard.down('Enter')
    await page.keyboard.down('Enter') // repetición automática
    await page.keyboard.down('Enter')
    await page.waitForTimeout(200)
    await page.keyboard.up('Enter')
    await page.waitForTimeout(200)
    expect(await edificios(page)).toHaveLength(1)
    await expect(p.getByRole('alertdialog')).toBeVisible()
  })

  test('M con la confirmación abierta: no demuele y al volver al Plano no queda nada abierto', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    const errores = await abrir(page)
    const [s] = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', s as Sitio, true)
    const d = await dinero(page)
    await tocarEdificio(page, caja.id)
    const p = panel(page, 'Caja de envío')
    await boton(p, 'Demoler').click()
    await expect(p.getByRole('alertdialog')).toBeVisible()
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
    await expect(p).toHaveCount(0)
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
    await page.waitForTimeout(200)
    await expect(p).toHaveCount(0)
    expect(await seleccionado(page)).toMatchObject({ id: undefined, confirmando: undefined })
    expect(await edificios(page)).toHaveLength(1)
    expect(await dinero(page)).toBe(d)
    // Y lo mismo en mitad de mover.
    await page.evaluate(() => window.__raices?.centrarCamara(48, 48))
    await page.waitForTimeout(300)
    await tocarEdificio(page, caja.id)
    await boton(p, 'Mover').click()
    await expect.poll(async () => (await construccion(page))?.origen).toBe(caja.id)
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('vida')
    await page.keyboard.press('m')
    await expect.poll(() => page.evaluate(() => window.__raices?.modo())).toBe('plano')
    expect((await construccion(page))?.origen).toBeUndefined()
    expect((await construccion(page))?.abierto).toBe(false)
    expect(errores).toEqual([])
  })

  test('Esc a destiempo: cancela la confirmación, luego cierra el panel, y los demás no hacen nada', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    const errores = await abrir(page)
    const [s] = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', s as Sitio, true)
    await tocarEdificio(page, caja.id)
    const p = panel(page, 'Caja de envío')
    await boton(p, 'Demoler').click()
    await expect(boton(p, 'No, conservar')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(p.getByRole('alertdialog')).toHaveCount(0)
    await expect(p).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(p).toHaveCount(0)
    for (let i = 0; i < 3; i++) await page.keyboard.press('Escape')
    expect(await edificios(page)).toHaveLength(1)
    const activo = await page.evaluate(() => document.activeElement?.tagName)
    expect(activo).not.toBe('BODY')
    expect(errores).toEqual([])
  })

  test('[S3] Enter con la silueta de mover en su mismo sitio no sale del modo (el panel dice «elige otro sitio»)', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    await abrir(page)
    const [s] = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', s as Sitio, true)
    await tocarEdificio(page, caja.id)
    await boton(panel(page, 'Caja de envío'), 'Mover').focus()
    await page.keyboard.press('Enter')
    const pm = panel(page, 'Mover edificio')
    await expect(pm).toContainText('Ahí está ahora')
    await expect(boton(pm, 'Mover aquí')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.locator('#juego')).toBeFocused()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    expect((await construccion(page))?.origen, 'Enter cerró el modo mover sin mover').toBe(caja.id)
  })

  test('[S3] en su mismo sitio la silueta de mover no se pinta verde mientras el panel dice ✕', async ({
    page,
  }) => {
    await abrir(page)
    const [s] = await sitios(page, 'caja-envio')
    const caja = await levantar(page, 'caja-envio', s as Sitio, true)
    await tocarEdificio(page, caja.id)
    await boton(panel(page, 'Caja de envío'), 'Mover').click()
    const pm = panel(page, 'Mover edificio')
    await expect(pm.locator('[data-valida="false"]')).toContainText('Ahí está ahora')
    // El lienzo y el panel deben decir lo mismo.
    expect((await construccion(page))?.silueta?.valida).toBe(false)
  })
})

test.describe('M4-06 rompedor · que se vea', () => {
  const VISTAS = [
    ['escritorio', { width: 1280, height: 720 }],
    ['movil-horizontal', { width: 915, height: 412 }],
    ['baja', { width: 640, height: 320 }],
    ['movil-vertical', { width: 412, height: 915 }],
  ] as const

  for (const [nombre, vp] of VISTAS) {
    test(`${nombre}: el edificio elegido, con y sin la confirmación, y la silueta de mover no quedan tapados`, async ({
      page,
    }) => {
      test.skip(esMovil(), 'fija sus propios tamaños')
      await page.setViewportSize(vp)
      const errores = await abrir(page)
      const lista = await sitios(page, 'cobertizo')
      // El más alejado del centro: el que más fácil queda bajo el panel.
      const s = lista.at(-1) as Sitio
      const ed = await levantar(page, 'cobertizo', s, true)
      await page.evaluate(({ x, y }) => window.__raices?.centrarCamara(x + 1, y + 1), ed)
      await page.waitForTimeout(300)
      await tocarEdificio(page, ed.id)
      const p = panel(page, 'Cobertizo')
      await expect(p).toBeVisible()
      await page.waitForTimeout(800) // la guía de la cámara
      const h = { x: ed.x, y: ed.y, w: 3, alto: 2 }
      expect(await casillasTapadas(page, h), 'el cobertizo elegido queda tapado').toEqual([])
      // Todo el panel cabe en la pantalla.
      const caja = await p.boundingBox()
      expect(caja && caja.y >= 0 && caja.y + caja.height <= vp.height + 1).toBe(true)
      for (const b of ['Mover', 'Demoler']) {
        const bb = await boton(p, b).boundingBox()
        expect(bb?.height ?? 0).toBeGreaterThanOrEqual(44)
      }
      await boton(p, 'Demoler').click()
      await page.waitForTimeout(800)
      expect(
        await casillasTapadas(page, h),
        'con la confirmación el cobertizo queda tapado',
      ).toEqual([])
      const sib = await boton(p, 'Sí, demoler').boundingBox()
      expect(sib && sib.y + sib.height <= vp.height + 1, '«Sí, demoler» fuera de la pantalla').toBe(
        true,
      )
      await boton(p, 'No, conservar').click()
      await boton(p, 'Mover').click()
      await page.waitForTimeout(800)
      const sil = (await construccion(page))?.silueta
      if (!sil) throw new Error('sin silueta de mover')
      expect(
        await casillasTapadas(page, { x: sil.x, y: sil.y, w: 3, alto: 2 }),
        'la silueta de mover empieza tapada',
      ).toEqual([])
      expect(errores).toEqual([])
    })
  }
})

/** Puntos de la caja del elemento (centro y cerca de las esquinas) que tapa otro elemento. */
async function puntosTapados(l: Locator): Promise<string[]> {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const out: string[] = []
    for (const fx of [0.1, 0.5, 0.9]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        const e = document.elementFromPoint(x, y)
        if (!e || !(e === el || el.contains(e))) {
          out.push(
            `${Math.round(x)},${Math.round(y)}→${e?.textContent?.trim().slice(0, 20) ?? 'nada'}`,
          )
        }
      }
    }
    return out
  })
}

test.describe('M4-06 rompedor · solapes', () => {
  test('[S3] 640×320: el panel del edificio y su confirmación no tapan el HUD ni los tapan los botones de abajo', async ({
    page,
  }) => {
    test.skip(esMovil(), 'fija su propio tamaño')
    await page.setViewportSize({ width: 640, height: 320 })
    await abrir(page)
    const [s] = await sitios(page, 'caja-envio').catch(() => [undefined])
    const caja = await levantar(page, 'caja-envio', s ?? { x: 49, y: 44 }, true)
    await tocarEdificio(page, caja.id)
    const p = panel(page, 'Caja de envío')
    await expect(p).toBeVisible()
    const problemas: string[] = []
    // Los controles del tiempo del HUD siguen a la vista y se pueden pulsar.
    for (const nombre of [/En pausa|Pausar|Reanudar/, /x1|Velocidad/]) {
      const b = page.locator('.hud').getByRole('button', { name: nombre }).first()
      if ((await b.count()) === 0) continue
      const t = await puntosTapados(b)
      if (t.length) problemas.push(`HUD ${nombre} tapado: ${t.join(' ')}`)
    }
    await boton(p, 'Demoler').click()
    for (const nombre of ['Sí, demoler', 'No, conservar']) {
      const t = await puntosTapados(boton(p, nombre))
      if (t.length) problemas.push(`«${nombre}» tapado: ${t.join(' ')}`)
    }
    expect(problemas).toEqual([])
  })

  test('[S3] escritorio: con el panel del edificio abierto la captura no tiene huecos transparentes', async ({
    page,
  }) => {
    test.skip(esMovil(), 'basta con escritorio')
    await abrir(page)
    const [s] = await sitios(page, 'cobertizo')
    const ed = await levantar(page, 'cobertizo', s as Sitio, true)
    const huecos = async () => {
      const { data, info } = await sharp(await page.screenshot())
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      let n = 0
      for (let i = 3; i < data.length; i += info.channels) if ((data[i] ?? 255) < 255) n++
      return n
    }
    expect(await huecos(), 'sin panel ya hay huecos').toBe(0)
    await tocarEdificio(page, ed.id)
    await page.waitForTimeout(1500)
    // m406-panel--escritorio.png: un rectángulo transparente (blanco en el visor) bajo el panel.
    expect(await huecos(), 'huecos transparentes con el panel del edificio').toBe(0)
  })
})

test.describe('M4-06 rompedor · dibujo', () => {
  test('mover, demoler y cancelar muchas veces no deja objetos ni texturas huérfanos; la profundidad sigue a la Y', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const errores = await abrir(page)
    const base = await page.evaluate(() => ({
      obj: window.__raices?.objetosValle() ?? 0,
      tex: window.__raices?.texturas() ?? 0,
    }))
    // Sitios calculados en el valle vacío (después los costes y la casa única los esconderían).
    const lista = await sitios(page, 'caja-envio')
    const casas = await sitios(page, 'casa')
    const c = await levantar(page, 'casa', casas[0] as Sitio, true)
    const libre = async () => {
      const ocupadas = await edificios(page)
      return lista.filter((q) =>
        ocupadas.every(
          (e) => q.x < e.x - 1 || q.x > e.x + e.ancho || q.y < e.y - 1 || q.y > e.y + e.alto,
        ),
      )
    }
    for (let i = 0; i < 6; i++) {
      const a = await levantar(page, 'caja-envio', (await libre())[0] as Sitio, true)
      const destino = (await libre()).at(-1 - i)
      if (destino) {
        await page.evaluate(
          ({ id, d }) => window.__raices?.emitir({ tipo: 'MoverEdificio', id, x: d.x, y: d.y }),
          { id: a.id, d: destino },
        )
      }
      // La casa va y viene (si el sitio no vale, el comando se rechaza y no pasa nada).
      for (const dc of casas.slice(i % 2 === 0 ? -6 : 0, i % 2 === 0 ? undefined : 6)) {
        await page.evaluate(
          ({ id, d }) => window.__raices?.emitir({ tipo: 'MoverEdificio', id, x: d.x, y: d.y }),
          { id: c.id, d: dc },
        )
      }
      await page.waitForTimeout(100)
      const vis = await edificios(page)
      for (const e of vis) expect(e.profundidad).toBe((e.y + e.alto) * 32)
      await page.evaluate((id) => window.__raices?.emitir({ tipo: 'DemolerEdificio', id }), a.id)
      const o = await levantar(page, 'caja-envio', (await libre())[0] as Sitio, false)
      await page.evaluate((id) => window.__raices?.emitir({ tipo: 'CancelarObra', id }), o.id)
      await page.waitForTimeout(100)
    }
    const movida = (await edificios(page)).find((e) => e.id === c.id)
    expect(movida && (movida.x !== c.x || movida.y !== c.y), 'la casa no llegó a moverse').toBe(
      true,
    )
    await expect.poll(async () => (await edificios(page)).length).toBe(1)
    const fin = await page.evaluate(() => ({
      obj: window.__raices?.objetosValle() ?? 0,
      tex: window.__raices?.texturas() ?? 0,
    }))
    // Solo la casa: un objeto más que al empezar y ninguna textura nueva.
    expect(fin.obj).toBe(base.obj + 1)
    expect(fin.tex).toBe(base.tex)
    expect(errores).toEqual([])
  })

  test('tras mover y con un edificio elegido, perder y recuperar el contexto WebGL deja la misma imagen', async ({
    page,
  }) => {
    test.skip(esMovil(), 'basta con escritorio')
    const errores = await abrir(page)
    const lista = await sitios(page, 'caja-envio')
    const a = await levantar(page, 'caja-envio', lista[0] as Sitio, true)
    const d = (await sitios(page, 'caja-envio')).find(
      (q) => Math.hypot(q.x - a.x, q.y - a.y) > 3,
    ) as Sitio
    await page.evaluate(
      ({ id, d }) => window.__raices?.emitir({ tipo: 'MoverEdificio', id, x: d.x, y: d.y }),
      {
        id: a.id,
        d,
      },
    )
    await tocarEdificio(page, a.id)
    await page.waitForTimeout(800)
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
    const antes = await edificios(page)
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
    expect(await edificios(page)).toEqual(antes)
    expect(dif(f1, await foto())).toBeLessThan(ruido + 2)
    expect(errores).toEqual([])
  })
})

/** Verificación visual: panel del edificio, casa, obra, confirmación y mover en verde y en rojo. */
test('capturas de mover y demoler', async ({ page }) => {
  test.skip(esMovil(), 'fija sus propios tamaños')
  test.setTimeout(180_000)
  const vistas = [
    ['escritorio', { width: 1280, height: 720 }],
    ['movil-horizontal', { width: 915, height: 412 }],
    ['baja', { width: 640, height: 320 }],
    ['movil-vertical', { width: 412, height: 915 }],
  ] as const
  for (const [nombre, vp] of vistas) {
    await page.setViewportSize(vp)
    await abrir(page)
    const cobs = await sitios(page, 'cobertizo')
    const casa = await levantar(page, 'casa', (await sitios(page, 'casa'))[0] as Sitio, true)
    const cob = await levantar(
      page,
      'cobertizo',
      (await sitios(page, 'cobertizo'))[0] as Sitio,
      true,
    )
    const obra = await levantar(
      page,
      'caja-envio',
      (await sitios(page, 'caja-envio'))[0] as Sitio,
      false,
    )
    const foto = async (n: string) => {
      await page.waitForTimeout(900)
      await page.screenshot({ path: `capturas/m406-${n}--${nombre}.png` })
    }
    await tocarEdificio(page, cob.id)
    await foto('panel')
    await boton(panel(page, 'Cobertizo'), 'Demoler').click()
    await foto('confirmacion-demoler')
    await boton(panel(page, 'Cobertizo'), 'No, conservar').click()
    await boton(panel(page, 'Cobertizo'), 'Mover').click()
    await foto('mover-inicio')
    const ok = cobs.find((q) => Math.hypot(q.x - cob.x, q.y - cob.y) > 4)
    const pok = ok && (await puntoVisible(page, ok.x + 1, ok.y))
    if (pok) {
      await page.mouse.move(pok.x, pok.y)
      await foto('mover-verde')
    }
    const sobreCasa = await puntoVisible(page, casa.x + 1, casa.y + 1)
    if (sobreCasa) {
      await page.mouse.move(sobreCasa.x, sobreCasa.y)
      await foto('mover-rojo')
    }
    await boton(panel(page, 'Mover edificio'), 'Cancelar').click()
    await tocarEdificio(page, casa.id)
    await foto('casa')
    await page.keyboard.press('Escape')
    await tocarEdificio(page, obra.id)
    await foto('obra')
    await boton(panel(page, 'Caja de envío'), 'Cancelar obra').click()
    await foto('confirmacion-cancelar')
  }
})
