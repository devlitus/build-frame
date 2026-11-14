import { emit, expect, goTo, openValley, poll, test, unchanged, waitFrames } from './apoyo/game'

test('support helpers: open, ready, emit, goTo and unchanged', async ({ page }) => {
  await openValley(page, { seed: 42, money: 123 })
  expect(await page.evaluate(() => window.__raices?.dinero())).toBe(123)

  // A free tile two steps to the west with a clear straight path (walk is axis by axis).
  const target = await page.evaluate(() => {
    const r = window.__raices
    const p = r?.personaje()
    if (!r || !p) return undefined
    const x = Math.floor(p.x)
    const y = Math.floor(p.y)
    for (const dx of [-1, -2, -3, 1, 2, 3]) {
      const free = [0, 1].every((i) => !r.bloqueada(x + Math.sign(dx) * (Math.abs(dx) - i), y))
      if (free && !r.bloqueada(x + dx, y)) return { x: x + dx, y }
    }
    return undefined
  })
  expect(target).toBeDefined()
  if (!target) return
  await goTo(page, target)
  const end = await page.evaluate(() => window.__raices?.personaje())
  expect(Math.floor(end?.x ?? -1)).toBe(target.x)

  await emit(page, { tipo: 'Pausar' })
  await poll(() => page.evaluate(() => window.__raices?.reloj()?.pausado)).toBe(true)

  // Negative wait: standing still, the position does not change over 10 frames.
  const still = await unchanged(page, () => window.__raices?.personaje())
  expect(Math.floor(still?.x ?? -1)).toBe(target.x)
  await waitFrames(page, 3)
})
