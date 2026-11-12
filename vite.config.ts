import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as v from 'valibot'
// Con extensión .ts: Vite carga la config con el cargador nativo (sin ella avisa).
import { EsquemaConfigEconomia, EsquemaConfigValle } from './src/core/datos/esquemas.ts'
import pkg from './package.json' with { type: 'json' }

function commitCorto(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'local'
  }
}

/**
 * Aborta el build si data/valle.json o data/economia.json no cumplen su esquema (ADR 0006).
 * Las rutas se resuelven desde la raíz del proyecto, no desde el cwd.
 */
export function validarDatos(
  ruta = resolve(import.meta.dirname, 'data/valle.json'),
  rutaEconomia = resolve(import.meta.dirname, 'data/economia.json'),
): Plugin {
  return {
    name: 'validar-datos',
    buildStart() {
      const comprobar = (r: string, esquema: v.GenericSchema) => {
        const json: unknown = JSON.parse(readFileSync(r, 'utf8'))
        const res = v.safeParse(esquema, json)
        if (!res.success) {
          const fallos = res.issues
            .map((i) => `${v.getDotPath(i) ?? '(raíz)'}: ${i.message}`)
            .join('; ')
          this.error(`${r} inválido: ${fallos}`)
        }
      }
      comprobar(ruta, EsquemaConfigValle)
      comprobar(rutaEconomia, EsquemaConfigEconomia)
    },
  }
}

export default defineConfig({
  // Rutas relativas: el build funciona en la raíz (Vercel) o en cualquier subruta.
  base: './',
  plugins: [preact(), validarDatos()],
  define: { __VERSION__: JSON.stringify(`${pkg.version}+${commitCorto()}`) },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
    chunkSizeWarningLimit: 1600,
  },
})
