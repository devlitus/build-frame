import { defineConfig, devices } from '@playwright/test'

/** Tests sensibles a la carga de la máquina (ver `projects`): miden tiempo real o umbrales en ms. */
const SOLO =
  /el reloj avanza ~1,33|umbral de distancia: 10 px es toque|umbral de tiempo: 600 ms quieto|20 clics en 1 s no bloquean|sin costuras ni huecos de fondo/

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
    // Los tests que miden tiempo real corren solos, después del resto: con workers en paralelo
    // los fps bajan y el delta acotado (100 ms) hace que el reloj vaya más lento.
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
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
