import { createHash } from 'node:crypto'
import { defineConfig, devices, type Project } from '@playwright/test'

/**
 * Test batches by Playwright tags (`{ tag }`):
 * - `@rendimiento`: measures fps or real time against a threshold, so it depends on the machine.
 *   Runs last and alone (`rendimiento-*` projects, no dependencies; scripts/e2e.mjs launches it with
 *   --workers=1 after the functional batch, always, even if that one failed). With parallel workers fps
 *   drop and the clamped delta (100 ms) slows the game clock. Not run in CI (no GPU: 12-17 fps).
 * - `@medida`: only records numbers, checks nothing. Off by default (E2E_MEDIDA=1 to run it).
 * - `@capturas`: only writes PNGs to capturas/. Outside `npm run e2e` (`npm run e2e:capturas`).
 * - `@humo`: the CI smoke batch (`npm run e2e:humo`).
 * - `@movil` / `@lento`: reserved (E2E-08 / E2E-05..07); not applied or filtered yet.
 * Never run the two batches together with a bare `playwright test`: use `npm run e2e`.
 */
const EXCLUDED_FROM_FUNCTIONAL: RegExp[] = [
  /@rendimiento/,
  ...(process.env.E2E_MEDIDA ? [] : [/@medida/]),
  ...(process.env.E2E_CAPTURAS ? [] : [/@capturas/]),
  // TODO(E2E-07): m1-global-rompedor is not tagged yet (pending refactor); remove with the tag.
  ...(process.env.E2E_MEDIDA
    ? []
    : [/rendimiento: fps medias durante 5 s de arrastre y zoom continuos/]),
]
const PERFORMANCE_PROJECTS: Project[] = [
  {
    name: 'rendimiento-escritorio',
    use: { ...devices['Desktop Chrome'] },
    grep: /@rendimiento/,
    workers: 1,
  },
  {
    name: 'rendimiento-movil',
    use: { ...devices['Pixel 7'] },
    grep: /@rendimiento/,
    workers: 1,
  },
]

/**
 * Port per worktree (4200..4899), so two worktrees never share a server or a stale build.
 * PUERTO_E2E overrides it. Never 4173 (vite's default preview port).
 */
function worktreePort(): number {
  const hash = createHash('md5').update(process.cwd()).digest().readUInt32BE(0)
  return 4200 + (hash % 700)
}
const PORT = Number(process.env.PUERTO_E2E ?? worktreePort())

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: EXCLUDED_FROM_FUNCTIONAL,
    },
    { name: 'movil', use: { ...devices['Pixel 7'] }, grepInvert: EXCLUDED_FROM_FUNCTIONAL },
    ...(process.env.CI ? [] : PERFORMANCE_PROJECTS),
  ],
  globalSetup: './tests/e2e/apoyo/check-dist.ts',
  // Preview only: the build is done beforehand (npm run e2e / e2e:humo) and globalSetup checks it.
  webServer: {
    command: `node tests/e2e/apoyo/check-dist.ts && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
