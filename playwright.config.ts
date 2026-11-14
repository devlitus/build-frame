import { createHash } from 'node:crypto'
import { defineConfig, devices, type Project } from '@playwright/test'

/**
 * Tests de tiempo real y rendimiento: miden fps, milisegundos reales o umbrales en ms, así que
 * dependen de la máquina.
 * - En local corren al final y solos (`escritorio-solo` y `movil-solo`, con `workers: 1`):
 *   con workers en paralelo los fps bajan y el delta acotado (100 ms) frena el reloj.
 * - En la CI (`CI` definido) **no se ejecutan**: el runner de GitHub no tiene GPU (12–17 fps)
 *   y darían falsos fallos. Sus aserciones no cambian.
 *
 * Cómo lanzarlos en local:
 * - Todo, incluidos estos: `npm run e2e`.
 * - Solo estos: `npx playwright test --project=escritorio-solo --project=movil-solo --no-deps`
 *   (con `--no-deps` los dos proyectos corren a la vez: mejor uno cada vez si la máquina va justa).
 * - La misma selección que la CI: `CI=1 npx playwright test`.
 */
const SOLO =
  /el reloj avanza ~1,33|umbral de distancia: 10 px es toque|umbral de tiempo: 600 ms quieto|20 clics en 1 s no bloquean|sin costuras ni huecos de fondo|fps de noche andando|un día acelerado con teclado|pintar todo el valle repetidamente no hunde los fps|teclado: el cursor se queda en el borde del valle/

const PROYECTOS_SOLO: Project[] = [
  {
    name: 'escritorio-solo',
    use: { ...devices['Desktop Chrome'] },
    grep: SOLO,
    workers: 1,
    dependencies: ['escritorio', 'movil'],
  },
  {
    name: 'movil-solo',
    use: { ...devices['Pixel 7'] },
    grep: SOLO,
    workers: 1,
    dependencies: ['escritorio-solo'],
  },
]

/** The `@medida` probe only runs on demand (E2E_MEDIDA=1): it measures, it does not check. */
const NO_PROBE = process.env.E2E_MEDIDA ? [] : [/@medida/]

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
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, grepInvert: [SOLO, ...NO_PROBE] },
    { name: 'movil', use: { ...devices['Pixel 7'] }, grepInvert: [SOLO, ...NO_PROBE] },
    ...(process.env.CI ? [] : PROYECTOS_SOLO),
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
