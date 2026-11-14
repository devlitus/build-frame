import { test } from '@playwright/test'

/**
 * Measurement probe (`@medida`): excluded from the normal run (see playwright.config.ts) and only
 * executed with E2E_MEDIDA=1 (`E2E_MEDIDA=1 npx playwright test sonda --grep @medida`). Records startup time, WebGL renderer and mean
 * fps so the effect of the worker count can be compared. Results go to the annotations
 * (`probe`) so the JSON reporter and scripts/e2e-tiempos.mjs can read them.
 */
test('probe: startup, renderer and fps @medida', async ({ page }, info) => {
  test.setTimeout(120_000)
  const t0 = Date.now()
  await page.goto('./?semilla=42&debug')
  await page.waitForFunction(() => window.__raices?.escenaActiva() === 'valle', undefined, {
    timeout: 90_000,
    polling: 50,
  })
  const tScene = Date.now() - t0
  // Camera still: same scroll/zoom for 15 consecutive frames.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __sonda?: { k: string; n: number } }
      const c = window.__raices?.camara()
      if (!c) return false
      const k = `${c.scrollX}|${c.scrollY}|${c.zoom}`
      const s = (w.__sonda ??= { k: '', n: 0 })
      s.n = s.k === k ? s.n + 1 : 0
      s.k = k
      return s.n >= 15
    },
    undefined,
    { timeout: 90_000, polling: 'raf' },
  )
  const tStill = Date.now() - t0
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'no-webgl'
  })
  const samples: number[] = []
  const end = Date.now() + 2000
  while (Date.now() < end) {
    samples.push((await page.evaluate(() => window.__raices?.fps())) ?? 0)
    await page.waitForTimeout(100) // real-wait: sampling interval of the fps probe
  }
  const fps = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length)
  const data = {
    project: info.project.name,
    startupSceneMs: tScene,
    startupStillMs: tStill,
    renderer,
    fps: Number(fps.toFixed(1)),
  }
  info.annotations.push({ type: 'probe', description: JSON.stringify(data) })
  console.log(`PROBE ${JSON.stringify(data)}`)
})
