/**
 * Rompedor · M4-05 Construir. Ataques de interfaz: doble clic y doble toque en los botones del
 * panel, Enter mantenido, segundo dedo, Esc y M a destiempo, cambio de estado con la confirmación
 * abierta, pantallas bajas (640×320), pérdida del contexto WebGL, fugas al construir muchas veces,
 * el cartel de días tras el desmayo y capturas para la verificación visual.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import sharp from 'sharp'

const QUERY = '?semilla=42&debug&modo=plano&propias=14,15,20,21'
type Punto = { x: number; y: number }
type Sitio = { x: number; y: number; punto: Punto; cx: number; cy: number }

const esMovil = () => test.info().project.name === 'movil'
const panel = (page: Page) => page.getByRole('region', { name: 'Construir' })
const r = <T>(page: Page, f: () => T) => page.evaluate(f)

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
    const e = window.__raices?.emitir
    e?.({ tipo: 'PintarZona', x0: 40, y0: 40, x1: 47, y1: 55, zona: 'vivienda' })
    e?.({ tipo: 'PintarZona', x0: 48, y0: 40, x1: 55, y1: 55, zona: 'almacen' })
  })
  return errores
}

async function abrirCatalogo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Construir', exact: true }).click()
  await expect(panel(page)).toBeVisible()
}

async function elegir(page: Page, nombre: RegExp): Promise<void> {
  await panel(page).getByRole('button', { name: nombre }).click()
  await expect
    .poll(() => page.evaluate(() => window.__raices?.construccion()?.silueta !== undefined))
    .toBe(true)
}

/** Casilla visible (no tapada por el HUD ni el panel) con la silueta pedida, cerca del centro. */
async function buscarSitio(page: Page, tipo: string, valida: boolean, motivo?: string) {
  const s = await page.evaluate(
    ({ tipo, valida, motivo }) => {
      const r = window.__raices
      const [w, h] = ({ casa: [4, 3], 'caja-envio': [1, 1], cobertizo: [3, 2] } as const)[
        tipo as 'casa'
      ]
      const c: Sitio[] = []
      for (let y = 36; y < 60; y++) {
        for (let x = 36; x < 60; x++) {
          const v = r?.colocacion(tipo, x, y)
          if (!v || v.valida !== valida || (motivo && v.motivo !== motivo)) continue
          const cx = x + Math.floor((w - 1) / 2)
          const cy = y + Math.floor((h - 1) / 2)
          const p = r?.puntoClicCasilla(cx, cy)
          if (!p) continue
          const el = document.elementFromPoint(p.x, p.y)
          if (el?.tagName !== 'CANVAS') continue
          c.push({ x, y, punto: p, cx, cy })
        }
      }
      c.sort((a, b) => Math.hypot(a.cx - 48, a.cy - 48) - Math.hypot(b.cx - 48, b.cy - 48))
      return c[0]
    },
    { tipo, valida, motivo },
  )
  if (!s) throw new Error(`Sin sitio ${valida ? 'válido' : 'inválido'} para ${tipo}`)
  return s
}

const silueta = (page: Page) => page.evaluate(() => window.__raices?.construccion()?.silueta)
const construccion = (page: Page) => page.evaluate(() => window.__raices?.construccion())
const nEdificios = (page: Page) => page.evaluate(() => window.__raices?.edificios().length ?? -1)

async function apuntar(page: Page, p: Punto): Promise<void> {
  if (esMovil()) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.move(p.x, p.y)
}

/** Deja la silueta de la caja en un sitio válido y abre la confirmación. */
async function hastaConfirmar(page: Page, tipo = 'caja-envio', nombre = /^Caja de envío/) {
  await abrirCatalogo(page)
  await elegir(page, nombre)
  const s = await buscarSitio(page, tipo, true)
  await apuntar(page, s.punto)
  await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
  if (esMovil()) await panel(page).getByRole('button', { name: 'Construir aquí' }).click()
  else await page.mouse.click(s.punto.x, s.punto.y)
  await expect(panel(page).getByText(/^¿Construir/)).toBeVisible()
  return s
}

async function centro(page: Page, nombre: string, exact = true): Promise<Punto> {
  const b = await panel(page).getByRole('button', { name: nombre, exact }).boundingBox()
  if (!b) throw new Error(`sin botón ${nombre}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

test.describe('doble clic y doble toque', () => {
  test('[S3] doble clic en «Construir» de la confirmación: una obra y el segundo clic no elige otro edificio', async ({
    page,
  }) => {
    const errores = await abrir(page)
    await hastaConfirmar(page)
    const p = await centro(page, 'Construir')
    if (esMovil()) {
      await page.touchscreen.tap(p.x, p.y)
      await page.waitForTimeout(60)
      await page.touchscreen.tap(p.x, p.y)
    } else await page.mouse.dblclick(p.x, p.y)
    await page.waitForTimeout(300)
    expect(await nEdificios(page)).toBe(1)
    expect(await r(page, () => window.__raices?.dinero())).toBe(1050)
    // El segundo clic no debe caer en el catálogo recién pintado y elegir un edificio.
    expect((await construccion(page))?.tipo).toBeUndefined()
    expect(errores).toEqual([])
  })

  test('doble clic o doble toque en «Construir aquí» no construye', async ({ page }) => {
    const errores = await abrir(page)
    await abrirCatalogo(page)
    await elegir(page, /^Caja de envío/)
    const s = await buscarSitio(page, 'caja-envio', true)
    await apuntar(page, s.punto)
    await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
    const p = await centro(page, 'Construir aquí')
    if (esMovil()) {
      await page.touchscreen.tap(p.x, p.y)
      await page.waitForTimeout(60)
      await page.touchscreen.tap(p.x, p.y)
    } else await page.mouse.dblclick(p.x, p.y)
    await page.waitForTimeout(300)
    expect(await nEdificios(page)).toBe(0)
    expect(await r(page, () => window.__raices?.dinero())).toBe(1100)
    expect(errores).toEqual([])
  })

  test('doble clic en el valle con la silueta válida: abre la confirmación y no construye', async ({
    page,
  }) => {
    test.skip(esMovil(), 'con el dedo tocar no confirma')
    const errores = await abrir(page)
    await abrirCatalogo(page)
    await elegir(page, /^Caja de envío/)
    const s = await buscarSitio(page, 'caja-envio', true)
    await page.mouse.move(s.punto.x, s.punto.y)
    await page.mouse.dblclick(s.punto.x, s.punto.y)
    await page.waitForTimeout(300)
    expect((await construccion(page))?.confirmando).toBe(true)
    expect(await nEdificios(page)).toBe(0)
    await page.keyboard.press('Enter') // el foco está en «Cancelar»: Enter cancela
    expect(await nEdificios(page)).toBe(0)
    expect(errores).toEqual([])
  })
})

test.describe('teclado', () => {
  test('[S3] mantener Enter (repetición) no debe construir sin una segunda pulsación', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    const errores = await abrir(page)
    await abrirCatalogo(page)
    await elegir(page, /^Caja de envío/)
    const s = await buscarSitio(page, 'caja-envio', true)
    await page.mouse.move(s.punto.x, s.punto.y)
    await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
    // El ratón se queda quieto sobre el sitio y el foco pasa al lienzo.
    await page.evaluate(() => document.getElementById('juego')?.focus())
    await page.keyboard.down('Enter')
    await expect.poll(async () => (await construccion(page))?.confirmando).toBe(true)
    // Repetición automática del sistema (repeat: true) con la tecla aún pulsada.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(40)
      await page.keyboard.down('Enter')
    }
    await page.keyboard.up('Enter')
    await page.waitForTimeout(200)
    expect(await nEdificios(page)).toBe(0)
    expect(errores).toEqual([])
  })

  test('una sola pulsación de Espacio (bajar, esperar, soltar) pide la confirmación y no construye', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    const errores = await abrir(page)
    await abrirCatalogo(page)
    await elegir(page, /^Caja de envío/)
    const s = await buscarSitio(page, 'caja-envio', true)
    await page.mouse.move(s.punto.x, s.punto.y)
    await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
    await page.evaluate(() => document.getElementById('juego')?.focus())
    await page.keyboard.down('Space')
    await page.waitForTimeout(150)
    await page.keyboard.up('Space')
    await page.waitForTimeout(200)
    expect((await construccion(page))?.confirmando).toBe(true)
    expect(await nEdificios(page)).toBe(0)
    expect(errores).toEqual([])
  })

  test('M con la confirmación abierta: pasa a Vida, cierra todo y no cobra; al volver no queda nada abierto', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    const errores = await abrir(page)
    await hastaConfirmar(page)
    await page.keyboard.press('KeyM')
    await expect.poll(() => r(page, () => window.__raices?.modo())).toBe('vida')
    await expect(panel(page)).toHaveCount(0)
    expect(await r(page, () => window.__raices?.dinero())).toBe(1100)
    await page.keyboard.press('KeyM')
    await expect.poll(() => r(page, () => window.__raices?.modo())).toBe('plano')
    expect((await construccion(page))?.abierto).toBe(false)
    await expect(page.getByRole('button', { name: 'Construir', exact: true })).toBeVisible()
    expect(errores).toEqual([])
  })

  test('Esc a destiempo: con el foco en «Cancelar», en el catálogo y repetido no deja nada a medias', async ({
    page,
  }) => {
    test.skip(esMovil(), 'teclado de escritorio')
    const errores = await abrir(page)
    await hastaConfirmar(page)
    await expect(panel(page).getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    expect((await construccion(page))?.confirmando).toBe(false)
    expect((await construccion(page))?.tipo).toBe('caja-envio')
    await page.keyboard.press('Escape')
    expect((await construccion(page))?.abierto).toBe(false)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    expect((await construccion(page))?.abierto).toBe(false)
    // El foco no se pierde en <body>: el teclado sigue siendo del juego.
    const foco = await page.evaluate(
      () => document.activeElement?.id ?? document.activeElement?.tagName,
    )
    expect(foco).not.toBe('BODY')
    expect(await nEdificios(page)).toBe(0)
    expect(errores).toEqual([])
  })
})

test('[S3] con ratón la ayuda del panel no habla de tocar (hay texto de escritorio sin usar)', async ({
  page,
}) => {
  test.skip(esMovil(), 'en móvil «Toca o arrastra» es correcto')
  await abrir(page)
  await abrirCatalogo(page)
  await elegir(page, /^Caja de envío/)
  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).not.toContainText('Toca o arrastra')
})

test('rendimiento: mover la silueta sobre el valle con obras y edificios no hunde los fps', async ({
  page,
}) => {
  test.skip(esMovil(), 'ratón de escritorio')
  test.setTimeout(60_000)
  await abrir(page)
  await page.evaluate(() => {
    const r = window.__raices
    for (const [tipo, max] of [
      ['casa', 1],
      ['caja-envio', 4],
    ] as const) {
      let n = 0
      for (let y = 38; y < 58 && n < max; y += 4)
        for (let x = 38; x < 58 && n < max; x += 5)
          if (r?.colocacion(tipo, x, y)?.valida) {
            r.emitir({ tipo: 'Construir', tipoEdificio: tipo, x, y })
            n++
          }
    }
  })
  await page.waitForTimeout(1500)
  const quieto = await r(page, () => window.__raices?.fps() ?? 0)
  await abrirCatalogo(page)
  await elegir(page, /^Cobertizo/)
  const v = page.viewportSize() ?? { width: 1280, height: 720 }
  const muestras: number[] = []
  for (let i = 0; i < 60; i++) {
    const t = i / 60
    await page.mouse.move(
      v.width * (0.3 + 0.4 * t),
      v.height * (0.15 + 0.4 * Math.abs(Math.sin(t * 9))),
    )
    if (i % 10 === 9) muestras.push(await r(page, () => window.__raices?.fps() ?? 0))
  }
  const moviendo = Math.min(...muestras)
  test.info().annotations.push({
    type: 'fps',
    description: `quieto ${quieto.toFixed(1)}, moviendo (mín.) ${moviendo.toFixed(1)}`,
  })
  expect(moviendo).toBeGreaterThanOrEqual(Math.min(30, quieto * 0.6))
})

test.describe('gestos', () => {
  let cdp: CDPSession | undefined
  test.beforeEach(() => {
    cdp = undefined
  })

  test('segundo dedo a mitad de arrastre: la silueta vuelve a donde estaba y no se confirma nada', async ({
    page,
  }) => {
    test.skip(!esMovil(), 'gesto táctil')
    const errores = await abrir(page)
    await abrirCatalogo(page)
    await elegir(page, /^Caja de envío/)
    const a = await buscarSitio(page, 'caja-envio', true)
    await page.touchscreen.tap(a.punto.x, a.punto.y)
    await expect.poll(async () => (await construccion(page))?.centro).toEqual({ x: a.cx, y: a.cy })
    const sesion = (cdp ??= await page.context().newCDPSession(page))
    const toque = (type: string, pts: Punto[]) =>
      sesion.send('Input.dispatchTouchEvent', {
        type: type as 'touchStart',
        touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })),
      })
    const b = { x: a.punto.x + 70, y: a.punto.y + 50 }
    await toque('touchStart', [b])
    await toque('touchMove', [{ x: b.x + 40, y: b.y }])
    await toque('touchStart', [
      { x: b.x + 40, y: b.y },
      { x: b.x - 80, y: b.y - 60 },
    ])
    await toque('touchMove', [
      { x: b.x + 60, y: b.y + 20 },
      { x: b.x - 120, y: b.y - 90 },
    ])
    await toque('touchEnd', [{ x: b.x - 120, y: b.y - 90 }])
    await toque('touchEnd', [])
    await page.waitForTimeout(150)
    expect((await construccion(page))?.centro).toEqual({ x: a.cx, y: a.cy })
    expect((await construccion(page))?.confirmando).toBe(false)
    // Después, un toque normal vuelve a colocar.
    const c = await buscarSitio(page, 'caja-envio', false, 'zona-incompatible')
    await page.touchscreen.tap(c.punto.x, c.punto.y)
    await expect.poll(async () => (await construccion(page))?.centro).toEqual({ x: c.cx, y: c.cy })
    expect(await nEdificios(page)).toBe(0)
    expect(errores).toEqual([])
  })

  test('si el estado cambia con la confirmación abierta (zona borrada) se cierra y no se cobra', async ({
    page,
  }) => {
    const errores = await abrir(page)
    const s = await hastaConfirmar(page)
    await page.evaluate(
      ({ x, y }) => window.__raices?.emitir({ tipo: 'BorrarZona', x0: x, y0: y, x1: x, y1: y }),
      { x: s.x, y: s.y },
    )
    await expect.poll(async () => (await construccion(page))?.confirmando).toBe(false)
    expect((await silueta(page))?.valida).toBe(false)
    await expect(panel(page).getByRole('button', { name: 'Construir aquí' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(await nEdificios(page)).toBe(0)
    expect(errores).toEqual([])
  })
})

test.describe('pantallas bajas', () => {
  for (const vp of [
    { width: 640, height: 320 },
    { width: 320, height: 640 },
  ]) {
    test(`${vp.height < 400 ? '[S2] ' : ''}${vp.width}×${vp.height}: catálogo, colocación y confirmación caben y la silueta se ve`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      const errores = await abrir(page)
      const dentro = async (nombre: string | RegExp, exact = true) => {
        const b = await panel(page)
          .getByRole('button', { name: nombre, exact: typeof nombre === 'string' && exact })
          .boundingBox()
        expect(b, String(nombre)).not.toBeNull()
        if (!b) return
        expect.soft(b.y, `${nombre} arriba`).toBeGreaterThanOrEqual(0)
        expect.soft(b.y + b.height, `${nombre} abajo`).toBeLessThanOrEqual(vp.height + 0.5)
        expect.soft(b.x + b.width, `${nombre} derecha`).toBeLessThanOrEqual(vp.width + 0.5)
        expect.soft(b.height, `${nombre} alto`).toBeGreaterThanOrEqual(44)
        // Nada encima (otro botón del HUD tapándolo).
        const tapado = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest('.panel-construir') === null,
          { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        )
        expect.soft(tapado, `${nombre} tapado`).toBe(false)
      }
      await abrirCatalogo(page)
      await dentro('Listo')
      // Con el catálogo abierto el dinero y los materiales siguen a la vista (hacen falta para elegir).
      for (const grupo of ['Materiales']) {
        const b = await page.getByRole('group', { name: grupo }).boundingBox()
        const visible = await page.evaluate(
          (p) => document.elementFromPoint(p.x, p.y)?.closest('.panel-construir') === null,
          { x: (b?.x ?? 0) + (b?.width ?? 0) / 2, y: (b?.y ?? 0) + (b?.height ?? 0) / 2 },
        )
        expect.soft(visible, `${grupo} tapado por el catálogo`).toBe(true)
      }
      for (const n of [/^Casa/, /^Caja de envío/, /^Cobertizo/]) {
        await panel(page).getByRole('button', { name: n }).scrollIntoViewIfNeeded()
        await dentro(n)
      }
      await elegir(page, /^Caja de envío/)
      await dentro('Construir aquí')
      await dentro('Listo')
      // La silueta aparece donde se ve (no bajo el panel ni el HUD).
      const s = await silueta(page)
      const p = await page.evaluate(({ x, y }) => window.__raices?.puntoClicCasilla(x, y), {
        x: s?.x ?? 0,
        y: s?.y ?? 0,
      })
      expect(p).toBeTruthy()
      const enLienzo = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
        p ?? { x: 0, y: 0 },
      )
      expect.soft(enLienzo, 'silueta inicial bajo el panel o el HUD').toBe('CANVAS')
      // Con la silueta elegida el panel crece y la cámara la busca: se espera a que termine el deslizamiento.
      await expect.poll(() => page.evaluate(() => window.__raices?.camara()?.guiando)).toBe(false)
      const sitio = await buscarSitio(page, 'caja-envio', true)
      await apuntar(page, sitio.punto)
      await expect.poll(async () => (await silueta(page))?.valida).toBe(true)
      await panel(page).getByRole('button', { name: 'Construir aquí' }).click()
      await dentro('Construir')
      await dentro('Cancelar')
      expect(errores).toEqual([])
    })
  }
})

test.describe('obras en el valle', () => {
  test('el cartel de la casa cuenta 3, 2, 1 con desmayos y al terminar se ve la casa', async ({
    page,
  }) => {
    const errores = await abrir(page)
    const s = await buscarSitio(page, 'casa', true)
    await page.evaluate(
      ({ x, y }) => window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: 'casa', x, y }),
      s,
    )
    const cartel = async () => (await r(page, () => window.__raices?.edificios()))?.[0]
    await expect.poll(async () => (await cartel())?.diasCartel).toBe(3)
    for (const n of [2, 1]) {
      await page.evaluate(() => {
        const e = window.__raices?.emitir
        e?.({ tipo: 'CambiarModo', modo: 'vida' })
        e?.({ tipo: 'AvanzarTiempo', minutos: 5000 })
      })
      await expect.poll(async () => (await cartel())?.diasCartel).toBe(n)
    }
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 5000 }))
    await expect.poll(async () => (await cartel())?.enObra).toBe(false)
    expect((await cartel())?.diasCartel).toBeUndefined()
    expect(errores).toEqual([])
  })

  test('construir, pasar días y reiniciar la escena no deja Graphics, textos ni texturas sueltos', async ({
    page,
  }) => {
    // El lote de bienvenida da para 4 cajas (80 de madera) y la casa es gratis: 5 edificios,
    // con la casa repintando su cartel 3 veces y 3 reinicios de la escena del valle.
    const errores = await abrir(page, `${QUERY}&dinero=100000`)
    await page.waitForTimeout(200)
    const base = {
      obj: await r(page, () => window.__raices?.objetosValle() ?? 0),
      tex: await r(page, () => window.__raices?.texturas() ?? 0),
    }
    const hechos = await page.evaluate(() => {
      const r = window.__raices
      let ok = 0
      for (const [tipo, max] of [
        ['casa', 1],
        ['caja-envio', 4],
      ] as const) {
        let n = 0
        for (let y = 38; y < 58 && n < max; y += 4)
          for (let x = 38; x < 58 && n < max; x += 5)
            if (r?.colocacion(tipo, x, y)?.valida) {
              r.emitir({ tipo: 'Construir', tipoEdificio: tipo, x, y })
              n++
            }
        ok += n
      }
      return ok
    })
    expect(hechos).toBe(5)
    await page.waitForTimeout(150)
    const conObras = await r(page, () => window.__raices?.objetosValle() ?? 0)
    // En obra: un Graphics y un texto por obra.
    expect(conObras - base.obj).toBe(2 * hechos)
    for (let d = 0; d < 3; d++) {
      await page.evaluate(() => {
        const e = window.__raices?.emitir
        e?.({ tipo: 'CambiarModo', modo: 'vida' })
        e?.({ tipo: 'AvanzarTiempo', minutos: 5000 })
        e?.({ tipo: 'CambiarModo', modo: 'plano' })
      })
      await page.waitForTimeout(150)
    }
    await expect
      .poll(async () =>
        (await r(page, () => window.__raices?.edificios()))?.every((b) => !b.enObra),
      )
      .toBe(true)
    const terminados = {
      obj: await r(page, () => window.__raices?.objetosValle() ?? 0),
      tex: await r(page, () => window.__raices?.texturas() ?? 0),
    }
    expect(terminados.obj - base.obj).toBe(hechos)
    expect(terminados.tex).toBeLessThanOrEqual(base.tex)
    // Reiniciar la escena (estado nuevo, sin edificios) con obras a medias no deja texturas de
    // carteles: tras el primer reinicio, los siguientes dejan los mismos objetos y texturas.
    const reiniciar = async () => {
      await page.evaluate(() => {
        const r = window.__raices
        r?.emitir({ tipo: 'PintarZona', x0: 40, y0: 40, x1: 47, y1: 55, zona: 'vivienda' })
        r?.emitir({ tipo: 'Construir', tipoEdificio: 'casa', x: 41, y: 41 })
        r?.reiniciarValle()
      })
      await expect.poll(() => r(page, () => window.__raices?.escenaActiva())).toBe('valle')
      await page.waitForTimeout(400)
      return {
        obj: await r(page, () => window.__raices?.objetosValle() ?? 0),
        tex: await r(page, () => window.__raices?.texturas() ?? 0),
      }
    }
    const primero = await reiniciar()
    for (let i = 0; i < 3; i++) expect(await reiniciar()).toEqual(primero)
    expect(errores).toEqual([])
  })

  test('tras perder y recuperar el contexto WebGL, obra y edificio se siguen viendo igual', async ({
    page,
  }) => {
    test.skip(esMovil(), 'basta con escritorio')
    const errores = await abrir(page)
    const casa = await buscarSitio(page, 'casa', true)
    await page.evaluate(
      ({ x, y }) => window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: 'casa', x, y }),
      casa,
    )
    const caja = await buscarSitio(page, 'caja-envio', true)
    await page.evaluate(
      ({ x, y }) =>
        window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: 'caja-envio', x, y }),
      caja,
    )
    await page.waitForTimeout(500)
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
    const a = await foto()
    const b = await foto()
    const ruido = dif(a, b)
    const antes = await r(page, () => window.__raices?.edificios())
    const res = await page.evaluate(async () => {
      const cv = document.querySelector('canvas') as HTMLCanvasElement
      let restaurado = false
      cv.addEventListener('webglcontextrestored', () => (restaurado = true))
      const gl = (cv.getContext('webgl2') ?? cv.getContext('webgl')) as WebGL2RenderingContext
      const ext = gl.getExtension('WEBGL_lose_context')
      if (!ext) return 'sin-extension'
      ext.loseContext()
      await new Promise((r) => setTimeout(r, 300))
      ext.restoreContext()
      await new Promise((r) => setTimeout(r, 1500))
      return restaurado ? 'restaurado' : 'no-restaurado'
    })
    expect(res).toBe('restaurado')
    expect(await r(page, () => window.__raices?.edificios())).toEqual(antes)
    const c = await foto()
    expect(dif(a, c)).toBeLessThan(ruido + 2)
    expect(errores).toEqual([])
  })
})

/** Verificación visual: catálogo, silueta válida e inválida, confirmación, obra y edificio. */
test('capturas de construir', async ({ page }) => {
  test.skip(esMovil(), 'fija sus propios tamaños')
  test.setTimeout(120_000)
  const vistas = [
    ['escritorio', { width: 1280, height: 720 }],
    ['movil-horizontal', { width: 915, height: 412 }],
    ['movil-vertical', { width: 412, height: 915 }],
    ['baja', { width: 640, height: 320 }],
  ] as const
  for (const [nombre, vp] of vistas) {
    await page.setViewportSize(vp)
    await abrir(page, `${QUERY}&dinero=200`)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `capturas/m405-plano--${nombre}.png` })
    await abrirCatalogo(page)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `capturas/m405-catalogo--${nombre}.png` })
    await elegir(page, /^Cobertizo/)
    const mala = await buscarSitio(page, 'cobertizo', false).catch(() => undefined)
    if (mala) await page.mouse.move(mala.punto.x, mala.punto.y)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `capturas/m405-silueta-roja--${nombre}.png` })
    await panel(page).getByRole('button', { name: 'Cambiar edificio' }).click()
    await elegir(page, /^Caja de envío/)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `capturas/m405-silueta-inicial--${nombre}.png` })
    const buena = await buscarSitio(page, 'caja-envio', true).catch(() => undefined)
    if (!buena) continue
    await page.mouse.move(buena.punto.x, buena.punto.y)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `capturas/m405-silueta-verde--${nombre}.png` })
    await page.mouse.click(buena.punto.x, buena.punto.y)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `capturas/m405-confirmacion--${nombre}.png` })
    await panel(page).getByRole('button', { name: 'Construir', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Listo' }).click()
    const casa = await buscarSitio(page, 'casa', true)
    await page.evaluate(
      ({ x, y }) => window.__raices?.emitir({ tipo: 'Construir', tipoEdificio: 'casa', x, y }),
      casa,
    )
    await page.waitForTimeout(300)
    await page.screenshot({ path: `capturas/m405-obras--${nombre}.png` })
    await page.evaluate(() => {
      const e = window.__raices?.emitir
      e?.({ tipo: 'CambiarModo', modo: 'vida' })
      for (let i = 0; i < 3; i++) e?.({ tipo: 'AvanzarTiempo', minutos: 5000 })
      e?.({ tipo: 'CambiarModo', modo: 'plano' })
    })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `capturas/m405-edificios--${nombre}.png` })
  }
})
