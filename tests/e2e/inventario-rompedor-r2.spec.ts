/* eslint-disable @typescript-eslint/no-non-null-assertion -- valores conocidos en tests */
/**
 * Rompedor · M5-01, ronda 2 (arreglos de 110546e y 6f79a6e). Ver docs/informes/M5-01-rompedor.md.
 * - Listener de teclado en `window` y `pointerdown` del lienzo: dobles disparos, foco robado, Plano.
 * - Márgenes de la cámara en Vida: franja fuera del valle, esquinas, giro.
 * - Panel compacto en pantallas verticales bajas y pista «▼».
 * - Iconos `iconos/semilla-<id>` según el DPR.
 */
import { devices, expect, test, type Page } from '@playwright/test'

const HOLGURA = 24 // CONFIG_CAMARA.holguraBordePx

async function abrir(page: Page, query = '?semilla=42&debug'): Promise<string[]> {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await camaraQuieta(page)
  return errores
}

async function camaraQuieta(page: Page): Promise<void> {
  let anterior: number[] = []
  await expect
    .poll(
      async () => {
        const c = await page.evaluate(() => window.__raices?.camara())
        const ahora = [c?.scrollX ?? NaN, c?.scrollY ?? NaN, c?.zoom ?? NaN, c?.ancho ?? 0]
        const quieta =
          anterior.length > 0 && ahora.every((v, i) => Math.abs(v - anterior[i]!) * ahora[2]! < 0.2)
        anterior = ahora
        return quieta
      },
      { timeout: 20_000, intervals: [250] },
    )
    .toBe(true)
}

const herramienta = (p: Page) => p.evaluate(() => window.__raices?.herramienta()?.herramienta)
const ultimoUso = (p: Page) => p.evaluate(() => window.__raices?.ultimoUso())
const modo = (p: Page) => p.evaluate(() => window.__raices?.modo())
const activo = (p: Page) =>
  p.evaluate(() => {
    const a = document.activeElement
    return a === document.body ? 'BODY' : a?.id ? `#${a.id}` : (a?.className ?? a?.tagName)
  })
const panel = (p: Page) => p.getByRole('region', { name: 'Inventario' })

/**
 * Lleva al personaje, casilla a casilla por un camino libre (BFS con `bloqueada`), a la casilla
 * alcanzable más cercana a (tx, ty). Mueve con `MoverPersonaje` de 16 ms (sin saltar obstáculos).
 */
async function irA(p: Page, tx: number, ty: number): Promise<void> {
  await p.evaluate(
    ([tx, ty]) => {
      const R = window.__raices!
      const L = R.mundoPx()! / 32
      const q0 = R.personaje()!
      const sx = Math.floor(q0.x)
      const sy = Math.floor(q0.y)
      const k = (x: number, y: number) => `${x},${y}`
      const prev = new Map<string, [number, number] | null>([[k(sx, sy), null]])
      const cola: [number, number][] = [[sx, sy]]
      let mejor: [number, number] = [sx, sy]
      let dm = Infinity
      while (cola.length > 0) {
        const [x, y] = cola.shift()!
        const d = Math.hypot(x - tx!, y - ty!)
        if (d < dm) {
          dm = d
          mejor = [x, y]
        }
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= L || ny >= L || prev.has(k(nx, ny))) continue
          if (R.bloqueada(nx, ny)) continue
          prev.set(k(nx, ny), [x, y])
          cola.push([nx, ny])
        }
      }
      const camino: [number, number][] = []
      for (let c: [number, number] | null | undefined = mejor; c; c = prev.get(k(c[0], c[1])))
        camino.unshift(c)
      for (const [cx, cy] of camino.slice(1)) {
        for (let i = 0; i < 200; i++) {
          const q = R.personaje()!
          const ex = cx + 0.5 - q.x
          const ey = cy + 0.5 - q.y
          if (Math.abs(ex) < 0.08 && Math.abs(ey) < 0.08) break
          R.emitir({
            tipo: 'MoverPersonaje',
            dx: Math.abs(ex) < 0.08 ? 0 : Math.sign(ex),
            dy: Math.abs(ey) < 0.08 ? 0 : Math.sign(ey),
            ms: 16,
          })
        }
      }
    },
    [tx, ty],
  )
}

/** Px de pantalla que la vista enseña fuera del valle por cada lado (0 si el valle llega al borde). */
async function franjas(p: Page) {
  return p.evaluate(() => {
    const c = window.__raices!.camara()!
    const mundo = window.__raices!.mundoPx()!
    const izqMundo = c.scrollX + c.ancho / 2 - c.ancho / 2 / c.zoom
    const arribaMundo = c.scrollY + c.alto / 2 - c.alto / 2 / c.zoom
    const derMundo = izqMundo + c.ancho / c.zoom
    const abajoMundo = arribaMundo + c.alto / c.zoom
    return {
      izq: Math.max(0, -izqMundo) * c.zoom,
      arriba: Math.max(0, -arribaMundo) * c.zoom,
      der: Math.max(0, derMundo - mundo) * c.zoom,
      abajo: Math.max(0, abajoMundo - mundo) * c.zoom,
    }
  })
}

/** Lo máximo que la cámara de Vida debería enseñar fuera del valle: lo que tapa la barra, más la holgura. */
async function franjasPermitidas(p: Page) {
  const barra = (await p.locator('.barra-herramientas-caja').boundingBox())!
  const vp = p.viewportSize()!
  const columna = barra.width < barra.height
  return {
    izq: columna ? barra.x + barra.width + HOLGURA : 0,
    // Orquestador (M5-01, ronda 3): con los pies en la fila 0 la cabeza sobresale del valle; el
    // test de «cabeza visible» manda, así que arriba se tolera lo que sobresale el sprite (≤ 16 px).
    arriba: 16,
    der: 0,
    abajo: columna ? 0 : vp.height - barra.y + HOLGURA,
  }
}

const VISTAS = [
  ['escritorio', devices['Desktop Chrome']],
  ['móvil vertical', devices['Pixel 7']],
  ['móvil horizontal', { ...devices['Pixel 7'], viewport: { width: 915, height: 412 } }],
] as const

const ESQUINAS = [
  ['suroeste', 0, 95],
  ['sureste', 95, 95],
  ['noroeste', 0, 0],
  ['noreste', 95, 0],
] as const

test.describe('cámara de Vida con margen bajo la barra', () => {
  // Contextos propios por vista: basta con correr en un proyecto.
  test.skip(({ isMobile }) => isMobile, 'cada test crea sus vistas')

  for (const [vista, disp] of VISTAS) {
    for (const [esquina, tx, ty] of ESQUINAS) {
      test(`${vista}, esquina ${esquina}: la vista no enseña más fuera del valle que lo que tapa la barra`, async ({
        browser,
        baseURL,
      }) => {
        const ctx = await browser.newContext({ ...disp, baseURL: baseURL! })
        const page = await ctx.newPage()
        try {
          await abrir(page)
          await irA(page, tx, ty)
          await page.waitForTimeout(600) // el margen se mide cada 15 fotogramas
          await camaraQuieta(page)
          const f = await franjas(page)
          const max = await franjasPermitidas(page)
          for (const lado of ['izq', 'arriba', 'der', 'abajo'] as const)
            expect(
              f[lado],
              `franja ${lado} fuera del valle: ${Math.round(f[lado])} px (máximo ${Math.round(max[lado])})`,
            ).toBeLessThanOrEqual(max[lado] + 2)
        } finally {
          await ctx.close()
        }
      })
    }
  }

  test('ninguna esquina deja al personaje bajo el HUD ni fuera de la pantalla (las tres vistas)', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(240_000)
    const malos: string[] = []
    for (const [vista, disp] of VISTAS) {
      for (const [esquina, tx, ty] of ESQUINAS) {
        const ctx = await browser.newContext({ ...disp, baseURL: baseURL! })
        const page = await ctx.newPage()
        try {
          await abrir(page)
          await irA(page, tx, ty)
          await page.waitForTimeout(600)
          await camaraQuieta(page)
          const r = await page.evaluate(() => {
            const c = window.__raices!.camara()!
            const q = window.__raices!.personaje()!
            // Cuerpo del personaje: de 1 casilla por encima de los pies hasta los pies.
            const x = (q.x * 32 - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2
            const pies = (q.y * 32 - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2
            const cabeza = pies - 32 * c.zoom
            const puntos = [
              [x, cabeza + 2],
              [x, (cabeza + pies) / 2],
              [x, pies - 2],
            ]
            const fuera = puntos.some(
              ([px, py]) => px! < 0 || py! < 0 || px! > c.ancho || py! > c.alto,
            )
            const tapado = puntos.some(
              ([px, py]) => document.elementFromPoint(px!, py!)?.tagName !== 'CANVAS',
            )
            return {
              x: Math.round(x),
              cabeza: Math.round(cabeza),
              pies: Math.round(pies),
              fuera,
              tapado,
            }
          })
          if (r.fuera || r.tapado) malos.push(`${vista} ${esquina}: ${JSON.stringify(r)}`)
        } finally {
          await ctx.close()
        }
      }
    }
    expect(malos).toEqual([])
  })

  test('al girar el móvil en el borde oeste, la franja fuera del valle se ajusta a la barra', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], baseURL: baseURL! })
    const page = await ctx.newPage()
    try {
      await abrir(page)
      await irA(page, 0, 48)
      for (const [w, h] of [
        [412, 839],
        [839, 412],
        [412, 839],
      ] as const) {
        await page.setViewportSize({ width: w, height: h })
        await page.waitForTimeout(700)
        await camaraQuieta(page)
        const f = await franjas(page)
        const max = await franjasPermitidas(page)
        expect(f.izq, `${w}×${h}: franja izquierda ${Math.round(f.izq)} px`).toBeLessThanOrEqual(
          max.izq + 2,
        )
      }
    } finally {
      await ctx.close()
    }
  })
})

test.describe('inventario abierto en el borde oeste', () => {
  test.skip(({ isMobile }) => isMobile, 'cada test crea sus vistas')

  for (const [vista, disp] of VISTAS.filter(([v]) => v !== 'móvil vertical')) {
    test(`${vista}: con el personaje pegado al borde oeste, el panel abierto no lo tapa`, async ({
      browser,
      baseURL,
    }) => {
      const ctx = await browser.newContext({ ...disp, baseURL: baseURL! })
      const page = await ctx.newPage()
      try {
        await abrir(page)
        await irA(page, 0, 48)
        await page.waitForTimeout(600)
        await camaraQuieta(page)
        await page.getByRole('button', { name: 'Inventario', exact: true }).click()
        await expect(panel(page)).toBeVisible()
        const r = await page.evaluate(() => {
          const c = window.__raices!.camara()!
          const q = window.__raices!.personaje()!
          const x = (q.x * 32 - (c.scrollX + c.ancho / 2)) * c.zoom + c.ancho / 2
          const y = ((q.y - 0.5) * 32 - (c.scrollY + c.alto / 2)) * c.zoom + c.alto / 2
          const encima = document.elementFromPoint(x, y)
          return { x: Math.round(x), y: Math.round(y), lienzo: encima?.tagName === 'CANVAS' }
        })
        expect(r.lienzo, `personaje en (${r.x}, ${r.y}) bajo el panel`).toBe(true)
      } finally {
        await ctx.close()
      }
    })
  }
})

test.describe('foco y teclas tras el listener en window (escritorio)', () => {
  test.skip(({ isMobile }) => isMobile, 'el teclado es de escritorio')

  test('con el foco en <body>, cada tecla actúa una sola vez (2, E, I)', async ({ page }) => {
    await abrir(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    expect(await activo(page)).toBe('BODY')
    await page.keyboard.press('2')
    await expect.poll(() => herramienta(page)).toBe('regadera')
    await page.keyboard.press('e')
    await expect.poll(async () => (await ultimoUso(page))?.n).toBe(1)
    await page.waitForTimeout(200)
    expect((await ultimoUso(page))?.n).toBe(1)
    await page.keyboard.press('i')
    await page.waitForTimeout(200)
    await expect(panel(page)).toBeVisible()
    await page.keyboard.press('i')
    await expect(panel(page)).toHaveCount(0)
  })

  test('con el foco en el lienzo, E usa una vez e I abre (sin doble disparo con window)', async ({
    page,
  }) => {
    await abrir(page)
    expect(await activo(page)).toBe('#juego')
    await page.keyboard.press('Space')
    await page.waitForTimeout(200)
    expect((await ultimoUso(page))?.n).toBe(1)
    await page.keyboard.press('i')
    await page.waitForTimeout(200)
    await expect(panel(page)).toBeVisible()
    await expect(panel(page)).toBeFocused()
    // I dentro del panel lo cierra y el foco vuelve: la misma pulsación no lo reabre.
    await page.keyboard.press('i')
    await page.waitForTimeout(200)
    await expect(panel(page)).toHaveCount(0)
    expect(await activo(page)).toBe('#juego')
  })

  test('en el Plano, con el foco en <body>, 1–6, E e I no hacen nada', async ({ page }) => {
    await abrir(page)
    await page.keyboard.press('m')
    await expect.poll(() => modo(page)).toBe('plano')
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('3')
    await page.keyboard.press('e')
    await page.keyboard.press('i')
    await page.waitForTimeout(200)
    expect(await herramienta(page)).toBe('azada')
    expect(await ultimoUso(page)).toBeUndefined()
    await expect(panel(page)).toHaveCount(0)
  })

  test('con el foco en un botón del HUD (Hacha), 1 y E no actúan sobre el juego', async ({
    page,
  }) => {
    await abrir(page)
    await page.getByRole('button', { name: 'Hacha', exact: true }).focus()
    await page.keyboard.press('1')
    await page.keyboard.press('e')
    await page.waitForTimeout(200)
    expect(await herramienta(page)).toBe('azada')
    expect(await ultimoUso(page)).toBeUndefined()
  })

  test('en el Plano, un clic en el lienzo no roba el foco de la barra de zonas', async ({
    page,
  }) => {
    await abrir(page)
    await page.keyboard.press('m')
    await expect.poll(() => modo(page)).toBe('plano')
    await page.locator('.boton-zonas').click()
    const boton = page.locator('.barra-zonas .herramienta-zona').first()
    test.skip((await boton.count()) === 0, 'sin barra de zonas')
    await boton.focus()
    const antes = await activo(page)
    await page.mouse.click(640, 300)
    await page.waitForTimeout(150)
    expect(await activo(page)).not.toBe('#juego')
    expect(antes).not.toBe('#juego')
  })

  test('Tab desde el lienzo recorre el HUD y vuelve a funcionar tras un clic en el valle', async ({
    page,
  }) => {
    await abrir(page)
    await page.keyboard.press('Tab')
    const primero = await activo(page)
    expect(primero).not.toBe('#juego')
    expect(primero).not.toBe('BODY')
    await page.mouse.click(640, 250)
    await page.waitForTimeout(150)
    expect(await activo(page)).toBe('#juego')
    await page.keyboard.press('Tab')
    expect(await activo(page)).toBe(primero)
  })
})

test.describe('panel compacto en pantallas verticales bajas', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil')

  for (const [w, h] of [
    [360, 640],
    [320, 568],
  ] as const) {
    const abrirPanel = async (page: Page) => {
      await page.setViewportSize({ width: w, height: h })
      await abrir(page)
      await page.getByRole('button', { name: 'Inventario', exact: true }).click()
      await expect(panel(page)).toBeVisible()
      const caja = page.locator('.panel-inventario-caja')
      return { caja, cc: (await caja.boundingBox())! }
    }

    test(`${w}×${h}: el texto de «Cerrar» cabe en su botón y el botón en el panel`, async ({
      page,
    }) => {
      const { cc } = await abrirPanel(page)
      const cerrar = panel(page).getByRole('button', { name: 'Cerrar el inventario' })
      const desborde = await cerrar.evaluate((b) => b.scrollWidth - b.clientWidth)
      const bc = (await cerrar.boundingBox())!
      expect(desborde, `texto de «Cerrar» desborda ${desborde} px`).toBeLessThanOrEqual(0)
      expect(bc.x + bc.width).toBeLessThanOrEqual(cc.x + cc.width)
    })

    test(`${w}×${h}: la pista «▼» no tapa la cantidad de la primera fila de ranuras`, async ({
      page,
    }) => {
      const { caja, cc } = await abrirPanel(page)
      await expect(caja).toHaveClass(/hay-mas/)
      // La pista ocupa los 26 px pegados al borde inferior de la caja.
      const cantidad = panel(page)
        .getByRole('button', { name: /^Semillas de rábano/ })
        .locator('.ranura-cantidad')
      const bq = (await cantidad.boundingBox())!
      expect(
        bq.y + bq.height,
        `la cantidad (${Math.round(bq.y)}–${Math.round(bq.y + bq.height)}) cae bajo la pista (desde ${Math.round(cc.y + cc.height - 26)})`,
      ).toBeLessThanOrEqual(cc.y + cc.height - 26)
    })

    test(`${w}×${h}: tocar una ranura justo bajo la pista «▼» la elige`, async ({ page }) => {
      const { cc } = await abrirPanel(page)
      const ranura = panel(page).getByRole('button', { name: /^Semillas de patata/ })
      const br = (await ranura.boundingBox())!
      const y = Math.min(br.y + br.height - 4, cc.y + cc.height - 6)
      await page.touchscreen.tap(br.x + br.width / 2, y)
      await expect
        .poll(() => page.evaluate(() => window.__raices?.herramienta()?.semilla))
        .toBe('semilla-patata')
    })
  }

  test('320×568: la pista desaparece al llegar al final y vuelve al subir', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await abrir(page)
    await page.getByRole('button', { name: 'Inventario', exact: true }).click()
    const caja = page.locator('.panel-inventario-caja')
    await expect(caja).toHaveClass(/hay-mas/)
    await caja.evaluate((c) => c.scrollTo({ top: c.scrollHeight }))
    await expect(caja).not.toHaveClass(/hay-mas/)
    await caja.evaluate((c) => c.scrollTo({ top: 0 }))
    await expect(caja).toHaveClass(/hay-mas/)
  })
})

test('iconos de semilla: @1x con DPR 1 y @2x con DPR 2 o más, sin errores de carga', async ({
  browser,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'crea sus contextos')
  for (const dpr of [1, 2, 3]) {
    const ctx = await browser.newContext({
      ...devices['Desktop Chrome'],
      deviceScaleFactor: dpr,
      baseURL: baseURL!,
    })
    const page = await ctx.newPage()
    const fallos: string[] = []
    page.on('response', (r) => {
      if (r.status() >= 400) fallos.push(`${r.status()} ${r.url()}`)
    })
    try {
      await abrir(page)
      await page.keyboard.press('i')
      await expect(panel(page)).toBeVisible()
      const imgs = await panel(page)
        .locator('img')
        .evaluateAll((l) =>
          (l as HTMLImageElement[]).map((i) => ({ src: i.currentSrc, w: i.naturalWidth })),
        )
      expect(imgs.length).toBeGreaterThanOrEqual(3)
      for (const i of imgs) {
        expect(i.src).toMatch(/iconos\/semilla-(rabano|patata|fresa)@[12]x\.webp$/)
        expect(i.src).toContain(dpr === 1 ? '@1x' : '@2x')
        expect(i.w).toBeGreaterThan(0)
      }
      expect(fallos).toEqual([])
    } finally {
      await ctx.close()
    }
  }
})
