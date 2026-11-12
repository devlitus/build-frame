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
  /el reloj avanza ~1,33|umbral de distancia: 10 px es toque|umbral de tiempo: 600 ms quieto|20 clics en 1 s no bloquean|sin costuras ni huecos de fondo|fps de noche andando|un día acelerado con teclado/

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

const PORT = Number(process.env.PUERTO_E2E ?? 4173)

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, grepInvert: SOLO },
    { name: 'movil', use: { ...devices['Pixel 7'] }, grepInvert: SOLO },
    ...(process.env.CI ? [] : PROYECTOS_SOLO),
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
