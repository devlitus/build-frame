// Genera las versiones WebP de la portada a partir de la fuente de ComfyUI.
// Uso: node scripts/optimizar-portada.mjs
import sharp from 'sharp'

const fuente = 'assets-src/portada/portada-fuente.png'
const destino = 'public/assets/portada'

for (const ancho of [1664, 960]) {
  const info = await sharp(fuente)
    .resize({ width: ancho })
    .webp({ quality: 82 })
    .toFile(`${destino}/portada-${ancho}.webp`)
  console.log(
    `portada-${ancho}.webp`,
    info.width,
    'x',
    info.height,
    Math.round(info.size / 1024),
    'KB',
  )
}
