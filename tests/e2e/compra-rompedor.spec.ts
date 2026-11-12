import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * M3-04 · Rompedor. Ataques al flujo de compra: doble clic, carreras, botón desactivado, Esc,
 * dinero en HUD/estado/panel, estado visual, repintado y panel en pantallas bajas.
 */

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const urlPlano = (extra = '') => `?semilla=42&debug&modo=plano${extra}`

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

const dinero = (page: Page) => page.evaluate(() => window.__raices?.dinero())
const panel = (page: Page) => page.getByRole('region', { name: /^Parcela / })
const pedir = (page: Page) => panel(page).locator('.boton-compra-pedir')
const grupo = (page: Page) => panel(page).getByRole('group', { name: /Comprar esta parcela/ })
const confirmar = (page: Page) => grupo(page).getByRole('button', { name: 'Comprar', exact: true })
const cancelar = (page: Page) => grupo(page).getByRole('button', { name: 'Cancelar' })

type Info = NonNullable<ReturnType<NonNullable<Window['__raices']>['parcelaInfo']>>
async function infos(page: Page): Promise<Info[]> {
  return page.evaluate(() =>
    Array.from({ length: 36 }, (_, n) => {
      const p = window.__raices?.parcelaInfo(n)
      if (!p) throw new Error(`sin info ${n}`)
      return p
    }),
  )
}
const visuales = (page: Page) =>
  page.evaluate(() => Array.from({ length: 36 }, (_, n) => window.__raices?.estadoVisual(n)))

async function seleccionar(page: Page, i: number): Promise<void> {
  await page.evaluate((n) => window.__raices?.seleccionar(n), i)
  await expect(panel(page)).toHaveAttribute('data-parcela', String(i))
}

async function caja(l: Locator) {
  const b = await l.boundingBox()
  if (!b) throw new Error('sin caja')
  return b
}

/** Comprueba que HUD, estado y lo que se ve cuadran (dinero y estado visual de las 36). */
async function cuadra(page: Page, esperado: number): Promise<void> {
  await expect.poll(() => dinero(page)).toBe(esperado)
  await expect(page.locator('.dinero-cifra')).toHaveText(miles(esperado))
  await expect(page.locator('.dinero')).toHaveAttribute('data-dinero', String(esperado))
  const inf = await infos(page)
  await expect
    .poll(async () => visuales(page))
    .toEqual(
      inf.map((p) =>
        p.estado === 'propia' ? 'propia' : p.comprable ? 'comprable' : 'no-comprable',
      ),
    )
  for (const p of inf) expect(p.dinero).toBe(esperado)
}

/** Como `cuadra`, pero en Vida (sin estado visual de Plano). */
async function cuadraEnVida(page: Page, esperado: number): Promise<void> {
  await expect.poll(() => dinero(page)).toBe(esperado)
  await expect(page.locator('.dinero-cifra')).toHaveText(miles(esperado))
}

test.describe('doble pulsación', () => {
  // FALLA (S2): en la hoja inferior del móvil vertical el panel crece hacia arriba y «Comprar»
  // (confirmar) aparece justo debajo del dedo, en la mitad derecha del botón «Comprar por N».
  // Un doble toque o doble clic compra sin haber leído la confirmación.
  for (const fx of [0.25, 0.5, 0.75, 0.9]) {
    test(`doble clic en «Comprar por N» (x=${fx}) no compra sin confirmar`, async ({ page }) => {
      await abrir(page, urlPlano('&dinero=5000'))
      await seleccionar(page, 14)
      const b = await caja(pedir(page))
      await page.mouse.dblclick(b.x + b.width * fx, b.y + b.height / 2)
      await page.waitForTimeout(300)
      expect(await dinero(page), 'se compró con un doble clic').toBe(5000)
      expect((await infos(page))[14]?.estado).toBe('en-venta')
    })
  }

  test('dos toques rápidos en «Comprar por N» no compran sin confirmar', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'toque')
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    const b = await caja(pedir(page))
    const x = b.x + b.width * 0.75
    const y = b.y + b.height / 2
    await page.touchscreen.tap(x, y)
    await page.waitForTimeout(120)
    await page.touchscreen.tap(x, y)
    await page.waitForTimeout(300)
    expect(await dinero(page), 'se compró con dos toques').toBe(5000)
  })

  // FALLA (S3, escritorio): el panel encoge al comprar y el segundo clic cae en el lienzo,
  // que selecciona otra parcela (la de debajo) y cierra el panel de la recién comprada.
  test('doble clic en «Comprar» (confirmar) compra una vez y no cambia la selección', async ({
    page,
  }) => {
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    const precio = (await infos(page))[14]?.precio ?? 0
    await pedir(page).click()
    const b = await caja(confirmar(page))
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2)
    await page.waitForTimeout(300)
    await cuadra(page, 5000 - precio)
    expect(await page.evaluate(() => window.__raices?.seleccionada())).toBe(14)
    await expect(panel(page)).toHaveAttribute('data-parcela', '14')
    await expect(panel(page).locator('.parcela-error')).toHaveCount(0)
  })

  test('confirmar dos veces en el mismo instante cobra una sola vez', async ({ page }) => {
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    const precio = (await infos(page))[14]?.precio ?? 0
    await pedir(page).click()
    await expect(confirmar(page)).toBeVisible()
    // Dos clics en la misma tarea (antes de que Preact repinte). Con clics reales no se da (Preact
    // repinta en una microtarea entre eventos); el segundo lo rechaza el núcleo con «ya-propia»
    // y sale un «No se pudo comprar» tras una compra buena (observación, no fallo).
    await page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>('.boton-compra-confirmar')
      b?.click()
      b?.click()
    })
    await cuadra(page, 5000 - precio)
    await expect(panel(page).locator('.parcela-precio')).toContainText('Tuya')
  })

  test('Enter mantenido en «Comprar por N» no compra (la repetición va a Cancelar)', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'teclado')
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    await pedir(page).focus()
    for (let k = 0; k < 6; k++) await page.keyboard.press('Enter', { delay: 10 })
    await page.waitForTimeout(200)
    expect(await dinero(page)).toBe(5000)
  })
})

test.describe('carreras', () => {
  test('si el estado cambia justo antes de confirmar, sale un role=alert con el motivo y nada cambia', async ({
    page,
  }) => {
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    await pedir(page).click()
    await expect(confirmar(page)).toBeVisible()
    // Se compra la 0 (no adyacente a la 14) y se pulsa «Comprar» antes de que Preact repinte.
    const precio0 = (await infos(page))[0]?.precio ?? 0
    await page.evaluate(() => {
      window.__raices?.emitir({ tipo: 'ComprarParcela', indice: 0 })
      document.querySelector<HTMLButtonElement>('.boton-compra-confirmar')?.click()
    })
    const alerta = panel(page).getByRole('alert')
    await expect(alerta).toContainText('debe tocar una de tus parcelas')
    await expect(alerta).toBeVisible()
    await cuadra(page, 5000 - precio0)
    await expect(pedir(page)).toBeFocused()
    await expect(pedir(page)).toHaveAttribute('aria-disabled', 'true')
  })

  test('si el precio sube con la confirmación abierta, la pregunta y el cobro usan el nuevo', async ({
    page,
  }) => {
    await abrir(page, urlPlano('&dinero=5000&propias=14'))
    await seleccionar(page, 15)
    await pedir(page).click()
    await expect(grupo(page)).toBeVisible()
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'ComprarParcela', indice: 13 }))
    const inf = await infos(page)
    const nuevo = inf[15]?.precio ?? 0
    const resto = inf[15]?.dinero ?? 0
    await expect(grupo(page)).toContainText(`por ${miles(nuevo)} monedas`)
    await expect(grupo(page)).toContainText(`Te quedarán ${miles(resto - nuevo)}`)
    await confirmar(page).click()
    await cuadra(page, resto - nuevo)
  })

  // Con entrada real no se da (Preact repinta entre eventos); si se fuerza en la misma tarea, la
  // compra se hace ya en Vida, sin panel. Se deja documentado: el dinero cuadra igualmente.
  test('confirmar en la misma tarea que el cambio de modo deja el dinero cuadrado', async ({
    page,
  }) => {
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    const precio = (await infos(page))[14]?.precio ?? 0
    await pedir(page).click()
    await expect(confirmar(page)).toBeVisible()
    await page.evaluate(() => {
      window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      document.querySelector<HTMLButtonElement>('.boton-compra-confirmar')?.click()
    })
    await page.waitForTimeout(200)
    await expect(panel(page)).toHaveCount(0)
    const propia = (await infos(page))[14]?.estado === 'propia'
    await cuadraEnVida(page, propia ? 5000 - precio : 5000)
  })
})

test.describe('botón desactivado', () => {
  test('no abre la confirmación con clic, Enter, Espacio ni toque', async ({ page, isMobile }) => {
    await abrir(page, urlPlano('&dinero=5000&propias=14'))
    await seleccionar(page, 0)
    await expect(pedir(page)).toHaveAttribute('aria-disabled', 'true')
    await pedir(page).click({ force: true })
    if (isMobile) {
      const b = await caja(pedir(page))
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
    } else {
      await pedir(page).focus()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Space')
    }
    await page.waitForTimeout(200)
    await expect(grupo(page)).toHaveCount(0)
    expect(await dinero(page)).toBe(5000)
    // Sigue siendo enfocable y el motivo se anuncia con aria-describedby.
    await expect(pedir(page)).toHaveAttribute('aria-describedby', 'parcela-compra-estado')
    await expect(page.locator('#parcela-compra-estado')).toContainText('Debe tocar')
  })
})

test.describe('Esc', () => {
  // FALLA (S3): con la confirmación abierta y el foco en el lienzo (p. ej. tras arrastrar la
  // cámara), Esc cierra el panel entero en vez de cancelar primero la confirmación.
  test('con la confirmación abierta y el foco en el lienzo, Esc cancela antes de cerrar', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'teclado')
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    await pedir(page).click()
    await expect(grupo(page)).toBeVisible()
    await page.locator('#juego').focus()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeVisible()
    await expect(grupo(page)).toHaveCount(0)
    expect(await dinero(page)).toBe(5000)
  })
})

test.describe('partida simulada por la interfaz', () => {
  test('comprar con clics hasta quedarse sin dinero: HUD, estado, panel y dibujo cuadran', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errores = await abrir(page, urlPlano())
    let caja = 1100
    let compradas = 0
    for (;;) {
      const inf = await infos(page)
      const i = inf.findIndex((p) => p.comprable)
      if (i < 0) break
      const precio = inf[i]?.precio ?? 0
      await seleccionar(page, i)
      await expect(pedir(page)).toHaveText(`Comprar por ${miles(precio)} monedas`)
      await pedir(page).click()
      await expect(grupo(page)).toContainText(`Te quedarán ${miles(caja - precio)}`)
      await confirmar(page).click()
      caja -= precio
      compradas++
      await cuadra(page, caja)
      await expect(page.locator('.aviso')).toContainText(`comprada por ${miles(precio)}`)
    }
    expect(compradas).toBeGreaterThan(0)
    // Al final, cualquier parcela en venta tiene el botón desactivado y el motivo.
    const inf = await infos(page)
    const j = inf.findIndex((p) => p.estado !== 'propia')
    await seleccionar(page, j)
    await expect(pedir(page)).toHaveAttribute('aria-disabled', 'true')
    expect(errores).toEqual([])
  })
})

test.describe('repintado', () => {
  test('no se repinta por fotograma en Vida ni en Plano, y sí una vez al cambiar de modo', async ({
    page,
  }) => {
    await abrir(page, '?semilla=42&debug&dinero=5000')
    const r = () => page.evaluate(() => window.__raices?.repintadosParcelas() ?? -1)
    const a = await r()
    await page.waitForTimeout(800)
    expect(await r(), 'en Vida, con el reloj en marcha').toBe(a)
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'plano' }))
    await expect.poll(r).toBe(a + 1)
    await page.waitForTimeout(800)
    expect(await r(), 'en Plano, quieto').toBe(a + 1)
    // Mover la cámara no repinta las parcelas.
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(400)
    await page.keyboard.up('ArrowRight')
    expect(await r()).toBe(a + 1)
    await page.evaluate(() => window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' }))
    await expect.poll(r).toBe(a + 2)
  })
})

/** ¿El elemento está entero dentro de la ventana y sin nada encima en su centro? */
async function alAlcance(l: Locator): Promise<string | undefined> {
  return l.evaluate((el) => {
    const r = el.getBoundingClientRect()
    if (r.height < 44) return `mide ${r.height.toFixed(0)} px de alto`
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth)
      return `fuera de la ventana: ${JSON.stringify(r)}`
    // Recortado por el desplazamiento del panel.
    const p = el.closest('.panel-parcela')?.getBoundingClientRect()
    if (p && (r.top < p.top - 0.5 || r.bottom > p.bottom + 0.5))
      return `recortado por el panel (necesita scroll): ${r.top}-${r.bottom} vs ${p.top}-${p.bottom}`
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const encima = document.elementFromPoint(cx, cy)
    if (!encima || !(el === encima || el.contains(encima)))
      return `tapado por ${encima?.className || encima?.tagName}`
    return undefined
  })
}

test.describe('móvil horizontal con poca altura', () => {
  // FALLA (S2): en móviles horizontales habituales (740x360, 667x375) «Comprar por N» queda
  // por debajo del borde del panel y solo se ve desplazando el panel.
  for (const [w, h, debug] of [
    [915, 412, true],
    [740, 360, true],
    [667, 375, true],
    [640, 320, true],
    [740, 360, false],
    [667, 375, false],
    [640, 320, false],
  ] as const) {
    test(`${w}x${h}${debug ? ' con ?debug' : ''}: «Comprar por N», «Cancelar» y «Comprar» visibles sin scroll`, async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, 'móvil')
      await page.setViewportSize({ width: w, height: h })
      if (debug) {
        await abrir(page, urlPlano('&dinero=5000'))
        await seleccionar(page, 14)
      } else {
        // Sin ?debug no hay gancho: se toca el centro del lienzo (cualquier parcela vale, con
        // 1.100 monedas y sin propias casi todas son comprables).
        await abrir(page, '?semilla=42&modo=plano')
        await page.touchscreen.tap(w * 0.3, h * 0.6)
        await expect(panel(page)).toBeVisible()
        await page.waitForTimeout(300)
      }
      expect(await alAlcance(pedir(page)), '«Comprar por N»').toBeUndefined()
      if ((await pedir(page).getAttribute('aria-disabled')) === 'true') return
      await pedir(page).click()
      await expect(grupo(page)).toBeVisible()
      await page.waitForTimeout(200)
      expect(await alAlcance(cancelar(page)), '«Cancelar»').toBeUndefined()
      expect(await alAlcance(confirmar(page)), '«Comprar»').toBeUndefined()
      // El texto de la pregunta tampoco queda cortado.
      expect(await alAlcance(grupo(page)), 'la pregunta').toBeUndefined()
    })
  }

  test('rotar con la confirmación abierta: sigue abierta y sus botones al alcance', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'móvil')
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    await pedir(page).click()
    await expect(grupo(page)).toBeVisible()
    const vp = page.viewportSize() ?? { width: 412, height: 915 }
    for (const tam of [{ width: vp.height, height: vp.width }, vp]) {
      await page.setViewportSize(tam)
      await page.waitForTimeout(600)
      await expect(grupo(page)).toBeVisible()
      expect(await alAlcance(cancelar(page)), `Cancelar a ${tam.width}x${tam.height}`).toBe(
        undefined,
      )
      expect(await alAlcance(confirmar(page)), `Comprar a ${tam.width}x${tam.height}`).toBe(
        undefined,
      )
    }
    await confirmar(page).click()
    await expect.poll(() => dinero(page)).toBeLessThan(5000)
  })
})

test.describe('HUD de dinero', () => {
  for (const n of [0, 999, 1000, 1_000_000, 999_999_999]) {
    test(`con ${miles(n)} monedas el HUD se lee entero y no pisa nada`, async ({ page }) => {
      await abrir(page, `?semilla=42&debug&dinero=${n}`)
      const d = page.locator('.dinero')
      await expect(d.locator('.dinero-cifra')).toHaveText(miles(n))
      const r = await caja(d)
      const vp = page.viewportSize() ?? { width: 0, height: 0 }
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width).toBeLessThanOrEqual(vp.width)
      // Que la cifra no se recorte dentro de su caja.
      expect(
        await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        'cifra recortada',
      ).toBe(true)
      for (const sel of ['.reloj', '.controles-tiempo', '.boton-modo', '.contador-fps']) {
        for (const o of await page.locator(sel).all()) {
          const b = await o.boundingBox()
          if (!b) continue
          const solapa =
            b.x < r.x + r.width &&
            b.x + b.width > r.x &&
            b.y < r.y + r.height &&
            b.y + b.height > r.y
          expect(solapa, `el dinero pisa ${sel}`).toBe(false)
        }
      }
    })
  }

  test('el aviso de compra no pisa el dinero ni el panel', async ({ page }) => {
    await abrir(page, urlPlano('&dinero=5000'))
    await seleccionar(page, 14)
    await pedir(page).click()
    await confirmar(page).click()
    const aviso = page.locator('.aviso')
    await expect(aviso).toBeVisible()
    const a = await caja(aviso)
    for (const sel of ['.dinero', '.panel-parcela', '.reloj']) {
      const b = await caja(page.locator(sel))
      const solapa =
        b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
      expect(solapa, `el aviso pisa ${sel}`).toBe(false)
    }
  })
})
