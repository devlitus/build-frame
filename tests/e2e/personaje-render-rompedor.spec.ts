/* eslint-disable @typescript-eslint/no-non-null-assertion -- código dentro de page.evaluate, sin tipos de ayuda */
import { expect, test, type Page } from '@playwright/test'
import { target } from './apoyo/rendimiento.ts'

test.skip(({ isMobile }) => isMobile, 'solo escritorio')

async function abrir(page: Page, query = '?semilla=42&debug&en=vado'): Promise<void> {
  await page.goto(`./${query}`)
  await expect.poll(() => page.evaluate(() => window.__raices?.escenaActiva())).toBe('valle')
  await expect
    .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
    .toBe(true)
  await page.locator('canvas').click({ position: { x: 5, y: 5 } })
}

test(
  'medida: velocidad efectiva y fps (informativo)',
  { tag: '@medida' },
  async ({ page }, info) => {
    await abrir(page)
    // Se prueba cada dirección: se mide la mejor (la menos bloqueada).
    const res: string[] = []
    for (const tecla of ['d', 'a', 's', 'w']) {
      const m = await page.evaluate(async (t) => {
        const p0 = window.__raices!.personaje()!
        const r0 = window.__raices!.reloj()!
        const t0 = performance.now()
        let frames = 0
        const contar = () => void frames++
        let activo = true
        const bucle = () => {
          contar()
          if (activo) requestAnimationFrame(bucle)
        }
        requestAnimationFrame(bucle)
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: t,
            code: 'Key' + t.toUpperCase(),
            keyCode: t.toUpperCase().charCodeAt(0),
            bubbles: true,
          }),
        )
        await new Promise((r) => setTimeout(r, 1000))
        window.dispatchEvent(
          new KeyboardEvent('keyup', {
            key: t,
            code: 'Key' + t.toUpperCase(),
            keyCode: t.toUpperCase().charCodeAt(0),
            bubbles: true,
          }),
        )
        activo = false
        const t1 = performance.now()
        const p1 = window.__raices!.personaje()!
        const r1 = window.__raices!.reloj()!
        return {
          dx: p1.x - p0.x,
          dy: p1.y - p0.y,
          s: (t1 - t0) / 1000,
          fps: frames / ((t1 - t0) / 1000),
          dmin: r1.minutoDelDia - r0.minutoDelDia,
        }
      }, tecla)
      res.push(
        `${tecla}: dx=${m.dx.toFixed(2)} dy=${m.dy.toFixed(2)} fps=${m.fps.toFixed(0)} dmin=${m.dmin}`,
      )
    }
    console.log(res.join('\n'))
    info.annotations.push({ type: 'medida', description: res.join(' | ') })
  },
)

test('las teclas de movimiento no bloquean atajos del navegador (Ctrl+L, F5)', async ({ page }) => {
  await abrir(page)
  const r = await page.evaluate(() => {
    const prueba = (init: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    return {
      ctrlL: prueba({ key: 'l', code: 'KeyL', keyCode: 76, ctrlKey: true }),
      f5: prueba({ key: 'F5', code: 'F5', keyCode: 116 }),
      ctrlD: prueba({ key: 'd', code: 'KeyD', keyCode: 68, ctrlKey: true }),
    }
  })
  expect(r.ctrlL).toBe(false)
  expect(r.f5).toBe(false)
  // Ctrl+D (marcador) no debe mover al personaje ni capturarse.
  expect(r.ctrlD).toBe(false)
})

test('reiniciar la escena varias veces no duplica el zoom de la rueda ni los objetos', async ({
  page,
}) => {
  await abrir(page)
  const objetos0 = await page.evaluate(() => window.__raices?.objetosValle())
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__raices?.reiniciarValle())
    await expect
      .poll(() => page.evaluate(() => window.__raices?.personaje() !== undefined))
      .toBe(true)
    await page.waitForTimeout(150)
  }
  expect(await page.evaluate(() => window.__raices?.objetosValle())).toBe(objetos0)
  await page.mouse.move(640, 360)
  const z0 = (await page.evaluate(() => window.__raices?.camara()?.zoom)) ?? 1
  await page.mouse.wheel(0, -100)
  await page.waitForTimeout(200)
  const z1 = (await page.evaluate(() => window.__raices?.camara()?.zoom)) ?? 1
  // Un solo oyente: zoom = exp(100 * 0.0015) ~ 1.162 (si hay 2 sería ~1.35).
  expect(z1 / z0).toBeLessThan(1.2)
})

test('mantener una tecla al reiniciar la escena no deja al personaje andando solo', async ({
  page,
}) => {
  await abrir(page)
  await page.keyboard.down('s')
  await page.waitForTimeout(200)
  await page.evaluate(() => window.__raices?.reiniciarValle())
  await page.keyboard.up('s')
  await page.waitForTimeout(300)
  const a = await page.evaluate(() => window.__raices?.personaje())
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.__raices?.personaje())).toEqual(a)
})

test('dos teclas opuestas se anulan', async ({ page }) => {
  await abrir(page)
  const a = await page.evaluate(() => window.__raices?.personaje())
  await page.keyboard.down('a')
  await page.keyboard.down('d')
  await page.waitForTimeout(600)
  const b = await page.evaluate(() => window.__raices?.personaje())
  await page.keyboard.up('a')
  await page.keyboard.up('d')
  expect(b?.x).toBeCloseTo(a?.x ?? 0, 0)
})

test('la cámara se mantiene dentro del valle caminando mucho y al redimensionar', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await abrir(page)
  const dentro = async () => {
    const c = await page.evaluate(() => window.__raices?.camara())
    if (!c) throw new Error('sin cámara')
    const vx = c.ancho / c.zoom
    const vy = c.alto / c.zoom
    const cx = c.scrollX + c.ancho / 2
    const cy = c.scrollY + c.alto / 2
    if (vx < 3072) {
      expect(cx - vx / 2).toBeGreaterThanOrEqual(-0.5)
      expect(cx + vx / 2).toBeLessThanOrEqual(3072.5)
    }
    if (vy < 3072) {
      expect(cy - vy / 2).toBeGreaterThanOrEqual(-0.5)
      expect(cy + vy / 2).toBeLessThanOrEqual(3072.5)
    }
  }
  for (const t of ['a', 'w', 'd', 's']) {
    await page.keyboard.down(t)
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250)
      if (i === 2) await page.setViewportSize({ width: 700 + i * 100, height: 500 })
      if (i === 3) await page.mouse.wheel(0, 300)
      await dentro()
    }
    await page.keyboard.up(t)
  }
})

test(
  'el reloj avanza ~1,33 min de juego por segundo real a x1 (día = 15 min)',
  { tag: '@rendimiento' },
  async ({ page }) => {
    await abrir(page)
    const r0 = await page.evaluate(() => window.__raices?.reloj())
    const t0 = Date.now()
    await page.waitForTimeout(9000)
    const r1 = await page.evaluate(() => window.__raices?.reloj())
    const s = (Date.now() - t0) / 1000
    const min = (r1?.minutoDelDia ?? 0) - (r0?.minutoDelDia ?? 0)
    // Target (noted only): 1.1..1.5 game min per real s. Floor (hard): >= 60 % of the lower
    // bound and <= 2x the upper one (a clock that stalls or races).
    target(min / s > 1.1 && min / s < 1.5, `clock rate ${(min / s).toFixed(2)} outside 1.1..1.5`)
    expect(min / s, 'floor').toBeGreaterThan(0.66)
    expect(min / s, 'ceiling').toBeLessThan(3)
  },
)
