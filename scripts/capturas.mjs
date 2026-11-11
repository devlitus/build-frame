// Capturas de verificación visual en escritorio, móvil horizontal y móvil vertical.
// Uso: npm run capturas -- [ruta ...]   (p. ej. "/" "/?semilla=42")
// Requiere un build previo (el script npm lo hace). Deja los PNG en capturas/.
import { chromium, devices } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const PUERTO = 4175
const rutas = process.argv.slice(2).length ? process.argv.slice(2) : ['/']
const vistas = [
  ['escritorio', { viewport: { width: 1280, height: 720 } }],
  ['movil-horizontal', { ...devices['Pixel 7'], viewport: { width: 915, height: 412 } }],
  ['movil-vertical', { ...devices['Pixel 7'] }],
]

mkdirSync('capturas', { recursive: true })
// Se lanza Vite directamente con Node (sin shell) para poder cerrarlo de forma fiable,
// también en Windows, donde matar el shell dejaba el servidor huérfano.
const vite = join(
  dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin/vite.js',
)
const servidor = spawn(
  process.execPath,
  [vite, 'preview', '--port', String(PUERTO), '--strictPort'],
  {
    stdio: 'ignore',
  },
)

try {
  await esperarServidor(`http://localhost:${PUERTO}/`)
  const navegador = await chromium.launch()
  for (const ruta of rutas) {
    const nombreRuta = ruta.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'inicio'
    for (const [nombre, opciones] of vistas) {
      const pagina = await (await navegador.newContext(opciones)).newPage()
      const errores = []
      pagina.on('pageerror', (e) => errores.push(e.message))
      await pagina.goto(`http://localhost:${PUERTO}${ruta}`)
      await pagina.waitForTimeout(1500)
      const archivo = `capturas/${nombreRuta}--${nombre}.png`
      await pagina.screenshot({ path: archivo })
      console.log(archivo, errores.length ? `ERRORES: ${errores.join(' | ')}` : '')
    }
  }
  await navegador.close()
} finally {
  servidor.kill()
}

async function esperarServidor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`El servidor de vista previa no arrancó en ${url}`)
}
