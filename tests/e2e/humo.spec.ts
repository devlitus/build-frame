import { expect, test, type Page } from '@playwright/test'

/**
 * Tanda de humo (`@humo`): lo único que corre la CI (ver docs/PROCESO.md §5). Comprueba los
 * flujos básicos del juego con margen de tiempo amplio, porque el runner de GitHub no tiene GPU
 * y va a pocos fps. La tanda completa (`npm run e2e`) se ejecuta en local antes de cada hito.
 */

const TAM = 32 // TAM_CASILLA
const HUMO = { tag: '@humo' }
const LENTO = { timeout: 30_000 }

async function abrirValle(page: Page, query = '?semilla=42&debug'): Promise<void> {
  page.on('pageerror', (e) => {
    throw e
  })
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva()), LENTO).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined), LENTO)
    .toBe(true)
}

async function personaje(page: Page): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(() => window.__raices?.personaje())
  if (!p) throw new Error('sin personaje')
  return p
}

const distancia = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

test('arrancar: la portada lleva al valle con el HUD', HUMO, async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Nueva partida' }).click()
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva()), LENTO).toBe('valle')
  await expect(page.getByText(/Día 1 de Primavera/)).toBeVisible(LENTO)
  await expect(page.getByRole('button', { name: /Modo de juego/ })).toBeVisible()
})

test('moverse con el teclado', HUMO, async ({ page, isMobile }) => {
  test.skip(isMobile, 'el teclado es de escritorio; en móvil se prueba el toque')
  await abrirValle(page)
  const p0 = await personaje(page)
  // Alguna dirección puede tener un obstáculo pegado a la aparición: se prueban las cuatro.
  for (const tecla of ['w', 'd', 'a', 's']) {
    await page.keyboard.down(tecla)
    await page.waitForTimeout(1500)
    await page.keyboard.up(tecla)
    if (distancia(await personaje(page), p0) > 0.3) break
  }
  expect(distancia(await personaje(page), p0)).toBeGreaterThan(0.3)
})

test('clic o toque hasta un destino cercano', HUMO, async ({ page, isMobile }) => {
  await abrirValle(page)
  // La cámara se asienta sobre el personaje antes de calcular el punto de pantalla.
  await page.waitForTimeout(1500)
  const p = await personaje(page)
  const objetivo = await page.evaluate(
    ({ px, py, tam }) => {
      const r = window.__raices
      const c = r?.camara()
      if (!r || !c) return undefined
      const cx0 = Math.floor(px)
      const cy0 = Math.floor(py)
      // Casilla libre a 2 casillas, con sus vecinas libres: el camino es corto y directo.
      for (const [dx, dy] of [
        [0, -2],
        [2, 0],
        [-2, 0],
        [0, 2],
      ] as const) {
        const cx = cx0 + dx
        const cy = cy0 + dy
        if (r.bloqueada(cx, cy) || r.bloqueada(cx0 + dx / 2, cy0 + dy / 2)) continue
        return {
          cx,
          cy,
          sx: ((cx + 0.5) * tam - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2,
          sy: ((cy + 0.5) * tam - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2,
        }
      }
      return undefined
    },
    { px: p.x, py: p.y, tam: TAM },
  )
  if (!objetivo) throw new Error('no hay casilla libre a 2 casillas del personaje')
  if (isMobile) await page.touchscreen.tap(objetivo.sx, objetivo.sy)
  else await page.mouse.click(objetivo.sx, objetivo.sy)
  const meta = { x: objetivo.cx + 0.5, y: objetivo.cy + 0.5 }
  await expect.poll(async () => distancia(await personaje(page), meta), LENTO).toBeLessThan(0.3)
})

test('cambiar de modo detiene el reloj y volver lo reanuda', HUMO, async ({ page }) => {
  await abrirValle(page)
  const boton = page.getByRole('button', { name: /Modo de juego/ })
  await boton.click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo()), LENTO).toBe('plano')
  const r0 = await page.evaluate(() => window.__raices?.reloj()?.minutoDelDia)
  await page.waitForTimeout(2000)
  expect(await page.evaluate(() => window.__raices?.reloj()?.minutoDelDia)).toBe(r0)
  await boton.click()
  await expect.poll(() => page.evaluate(() => window.__raices?.modo()), LENTO).toBe('vida')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.reloj()?.minutoDelDia), LENTO)
    .toBeGreaterThan(r0 ?? 0)
})

test('un día acelerado pasa al día siguiente con el aviso', HUMO, async ({ page }) => {
  await abrirValle(page, '?semilla=42&debug&hora=01:30&acelerar=50')
  await expect(page.getByRole('status')).toHaveText(/Te quedaste dormido/, LENTO)
  await expect.poll(() => page.evaluate(() => window.__raices?.reloj()?.dia), LENTO).toBe(2)
  await expect(page.getByText(/Día 2 de Primavera/)).toBeVisible()
})

test('seleccionar una parcela en el Modo Plano abre el panel', HUMO, async ({ page, isMobile }) => {
  await abrirValle(page, '?semilla=42&debug&modo=plano')
  await expect.poll(() => page.evaluate(() => window.__raices?.modo()), LENTO).toBe('plano')
  // Sin depender de los fps: se pulsa el punto de una parcela visible en el primer fotograma.
  await expect
    .poll(() => page.evaluate(() => window.__raices?.puntoClicParcela(14) !== undefined), LENTO)
    .toBe(true)
  const punto = await page.evaluate(() => window.__raices?.puntoClicParcela(14))
  if (!punto) throw new Error('la parcela 14 no está visible')
  if (isMobile) await page.touchscreen.tap(punto.x, punto.y)
  else await page.mouse.click(punto.x, punto.y)
  await expect(page.getByRole('region', { name: /^Parcela / })).toBeVisible(LENTO)
})

test('comprar la primera parcela baja el dinero del HUD', HUMO, async ({ page }) => {
  await abrirValle(page, '?semilla=42&debug&modo=plano')
  const hud = page.locator('.dinero')
  await expect(hud).toContainText('1.100', LENTO)
  const i = await page.evaluate(() => {
    for (let n = 0; n < 36; n++) if (window.__raices?.parcelaInfo(n)?.comprable) return n
    return -1
  })
  expect(i).toBeGreaterThanOrEqual(0)
  const precio = await page.evaluate((n) => window.__raices?.parcelaInfo(n)?.precio, i)
  if (precio === undefined) throw new Error('sin precio')
  await page.evaluate((n) => window.__raices?.seleccionar(n), i)
  const panel = page.getByRole('region', { name: /^Parcela / })
  await panel.getByRole('button', { name: /^Comprar por / }).click(LENTO)
  await panel.getByRole('button', { name: 'Comprar', exact: true }).click(LENTO)
  const resto = String(1100 - precio).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  await expect(hud).toContainText(resto, LENTO)
  expect(await page.evaluate(() => window.__raices?.dinero())).toBe(1100 - precio)
})

test('pintar una zona con el pincel y borrarla', HUMO, async ({ page, isMobile }) => {
  await abrirValle(page, '?semilla=42&debug&modo=plano&propias=14,15,20,21')
  await page.getByRole('button', { name: 'Zonas', exact: true }).click(LENTO)
  const barra = page.getByRole('group', { name: 'Pincel de zonas' })
  await expect(barra).toBeVisible(LENTO)
  const casilla = async (cx: number, cy: number) => {
    await expect
      .poll(
        () =>
          page.evaluate((c) => window.__raices?.puntoClicCasilla(c.x, c.y) !== undefined, {
            x: cx,
            y: cy,
          }),
        LENTO,
      )
      .toBe(true)
    const p = await page.evaluate((c) => window.__raices?.puntoClicCasilla(c.x, c.y), {
      x: cx,
      y: cy,
    })
    if (!p) throw new Error('casilla no visible')
    return p
  }
  // Un toque o clic pinta una casilla; se prueban varias por si el río corta alguna.
  const pintadas = async () =>
    page.evaluate(() => {
      let n = 0
      for (let x = 44; x <= 52; x++) if (window.__raices?.zonaDe(x, 46) === 'cultivo') n++
      return n
    })
  await barra.getByRole('button', { name: 'Cultivo' }).click()
  for (let x = 44; x <= 52; x++) {
    const p = await casilla(x, 46)
    if (isMobile) await page.touchscreen.tap(p.x, p.y)
    else await page.mouse.click(p.x, p.y)
  }
  await expect.poll(pintadas, LENTO).toBeGreaterThan(0)
  await barra.getByRole('button', { name: 'Borrar' }).click()
  for (let x = 44; x <= 52; x++) {
    const p = await casilla(x, 46)
    if (isMobile) await page.touchscreen.tap(p.x, p.y)
    else await page.mouse.click(p.x, p.y)
  }
  await expect.poll(pintadas, LENTO).toBe(0)
  await barra.getByRole('button', { name: 'Listo' }).click()
  await expect(barra).toHaveCount(0)
})

test(
  'pintar una zona y construir en ella: obra visible y edificio al pasar el día',
  HUMO,
  async ({ page, isMobile }) => {
    await abrirValle(page, '?semilla=42&debug&modo=plano&propias=14,15,20,21')
    /** Casilla visible, la más cercana al centro del valle, donde `caja-envio` da ese veredicto. */
    const buscar = (motivo: string | undefined) =>
      page.evaluate((m) => {
        const r = window.__raices
        const c: { x: number; y: number; px: number; py: number }[] = []
        for (let y = 40; y < 56; y++) {
          for (let x = 40; x < 56; x++) {
            const v = r?.colocacion('caja-envio', x, y)
            if (!v || v.motivo !== m) continue
            const p = r?.puntoClicCasilla(x, y)
            if (p) c.push({ x, y, px: p.x, py: p.y })
          }
        }
        c.sort((a, b) => Math.hypot(a.x - 48, a.y - 48) - Math.hypot(b.x - 48, b.y - 48))
        return c[0]
      }, motivo)
    const pulsar = async (x: number, y: number) => {
      if (isMobile) await page.touchscreen.tap(x, y)
      else await page.mouse.click(x, y)
    }
    // 1. Pintar Vivienda en una casilla libre de sus parcelas.
    await page.getByRole('button', { name: 'Zonas', exact: true }).click(LENTO)
    const barra = page.getByRole('group', { name: 'Pincel de zonas' })
    await barra.getByRole('button', { name: 'Vivienda' }).click()
    await expect.poll(() => buscar('zona-incompatible'), LENTO).toBeDefined()
    const sitio = await buscar('zona-incompatible')
    if (!sitio) throw new Error('sin casilla libre')
    await pulsar(sitio.px, sitio.py)
    await expect
      .poll(() => page.evaluate((s) => window.__raices?.zonaDe(s.x, s.y), sitio), LENTO)
      .toBe('vivienda')
    await barra.getByRole('button', { name: 'Listo' }).click()
    // 2. Construir una caja de envío encima.
    await page.getByRole('button', { name: 'Construir', exact: true }).click(LENTO)
    const panel = page.getByRole('region', { name: 'Construir' })
    await panel.getByRole('button', { name: /^Caja de envío/ }).click(LENTO)
    await expect.poll(() => buscar(undefined), LENTO).toBeDefined()
    const valido = await buscar(undefined)
    if (!valido) throw new Error('sin sitio válido')
    if (isMobile) {
      await page.touchscreen.tap(valido.px, valido.py)
      await panel.getByRole('button', { name: 'Construir aquí' }).click(LENTO)
    } else await page.mouse.click(valido.px, valido.py)
    await expect(panel.getByText('¿Construir Caja de envío?')).toBeVisible(LENTO)
    await panel.getByRole('button', { name: 'Construir', exact: true }).click()
    // 3. La obra se ve con su cartel y cuesta dinero y madera.
    await expect
      .poll(() => page.evaluate(() => window.__raices?.edificios()[0]?.enObra), LENTO)
      .toBe(true)
    expect(await page.evaluate(() => window.__raices?.dinero())).toBe(1050)
    // 4. Un día después el edificio está terminado.
    await page.evaluate(() => {
      window.__raices?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
      window.__raices?.emitir({ tipo: 'AvanzarTiempo', minutos: 2000 })
    })
    await expect
      .poll(() => page.evaluate(() => window.__raices?.edificios()[0]?.enObra), LENTO)
      .toBe(false)
  },
)

test('demoler un edificio terminado devuelve la mitad del coste', HUMO, async ({ page }) => {
  await abrirValle(page, '?semilla=42&debug&modo=plano&propias=14,15,20,21')
  // Vivienda en el centro y una caja de envío en una casilla válida, terminada tras un día.
  await page.evaluate(() => {
    window.__raices?.emitir({
      tipo: 'PintarZona',
      x0: 40,
      y0: 40,
      x1: 55,
      y1: 55,
      zona: 'vivienda',
    })
    const r = window.__raices
    for (let y = 40; y < 56; y++) {
      for (let x = 40; x < 56; x++) {
        if (r?.colocacion('caja-envio', x, y)?.valida) {
          r.emitir({ tipo: 'Construir', tipoEdificio: 'caja-envio', x, y })
          y = 99
          break
        }
      }
    }
    r?.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    r?.emitir({ tipo: 'AvanzarTiempo', minutos: 2000 })
    r?.emitir({ tipo: 'CambiarModo', modo: 'plano' })
  })
  await expect
    .poll(() => page.evaluate(() => window.__raices?.edificios()[0]?.enObra), LENTO)
    .toBe(false)
  expect(await page.evaluate(() => window.__raices?.dinero())).toBe(1050)
  const id = await page.evaluate(() => window.__raices?.edificios()[0]?.id)
  await page.evaluate((i) => window.__raices?.seleccionarEdificio(i ?? -1), id)
  const panel = page.getByRole('region', { name: 'Caja de envío' })
  await panel.getByRole('button', { name: 'Demoler' }).click(LENTO)
  await expect(panel.getByRole('alertdialog')).toContainText('Recuperas: 25 monedas y 10 de madera')
  await panel.getByRole('button', { name: 'Sí, demoler' }).click(LENTO)
  await expect.poll(() => page.evaluate(() => window.__raices?.dinero()), LENTO).toBe(1075)
  await expect.poll(() => page.evaluate(() => window.__raices?.edificios().length), LENTO).toBe(0)
})
