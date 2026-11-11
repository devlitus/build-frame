import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

function commitCorto(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'local'
  }
}

export default defineConfig({
  // Rutas relativas: el build funciona en la raíz (Vercel) o en cualquier subruta.
  base: './',
  plugins: [preact()],
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
