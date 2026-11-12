// Capturas de verificación visual en escritorio, móvil horizontal y móvil vertical.
// Uso: npm run capturas -- [ruta ...]   (p. ej. "/" "/?semilla=42")
// En Windows npm ejecuta el script con cmd.exe, que corta la orden en cada `&` aunque vaya entre
// comillas (se perdía todo lo que seguía al primer parámetro). Dentro de una ruta se puede
// escribir `;` en lugar de `&`: "/?semilla=42;modo=plano".
// Requiere un build previo (el script npm lo hace). Deja los PNG en capturas/.
import { chromium, devices } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

// Puerto propio con PUERTO_CAPTURAS=NNNN si otra sesión ya usa el 4175.
const PUERTO = Number(process.env.PUERTO_CAPTURAS ?? 4175)
const args = process.argv.slice(2).map((r) => r.replaceAll(';', '&'))
const rutas = args.length ? args : ['/']
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
      await pagina.waitForTimeout(3000)
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
