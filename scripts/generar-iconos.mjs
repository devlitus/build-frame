// Genera los PNG del manifiesto a partir de public/icons/icono.svg.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/icons/icono.svg', 'utf8')
const navegador = await chromium.launch()
for (const tam of [192, 512]) {
  const pagina = await navegador.newPage({ viewport: { width: tam, height: tam } })
  await pagina.setContent(
    `<style>html,body{margin:0}svg{width:${tam}px;height:${tam}px;display:block}</style>${svg}`,
  )
  await pagina.screenshot({ path: `public/icons/icono-${tam}.png`, omitBackground: true })
}
await navegador.close()
