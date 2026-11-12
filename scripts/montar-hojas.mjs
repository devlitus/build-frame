// Monta hojas de sprites @1x y @2x (WebP + JSON Hash de Phaser) a partir de fotogramas renderizados.
//
// Uso:
//   node scripts/montar-hojas.mjs <dir-fotogramas> <destino> [--origen 8] [--estira 1] [--sombra]
//
// - <dir-fotogramas>: PNG con nombre `<anim>-<dir>-<n>.png` (p. ej. `caminar-abajo-3.png`), todos
//   del mismo tamaño, renderizados a `--origen` veces la escala @1x (8 = @8x).
// - <destino>: ruta sin extensión; escribe `<destino>@1x.webp`, `@2x.webp` y sus `.json`.
// - --estira: factor del eje vertical (biblia §2): 1 para personajes (cámara a 30°) y √2 ≈ 1.4142
//   para objetos con huella renderizados a 45°.
// - --sombra: añade la sombra de contacto de la biblia §3 bajo el pivote (elipse #5A5470 al 35 %).
//
// Filas: una por animación y dirección, en orden alfabético de animación y en el orden
// abajo, arriba, derecha. La izquierda es el espejo de la derecha (`flipX` en el juego).
import { readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const ORDEN_DIR = ['abajo', 'arriba', 'derecha', 'sin-dir']

function leerArgs(argv) {
  const pos = []
  const op = { origen: 8, estira: 1, sombra: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--origen') op.origen = Number(argv[++i])
    else if (a === '--estira') op.estira = Number(argv[++i])
    else if (a === '--sombra') op.sombra = true
    else pos.push(a)
  }
  if (pos.length !== 2) {
    console.error(
      'Uso: node scripts/montar-hojas.mjs <dir> <destino> [--origen 8] [--estira 1] [--sombra]',
    )
    process.exit(1)
  }
  return { dir: pos[0], destino: pos[1], ...op }
}

async function fotogramas(dir) {
  const re = /^([a-z]+)-([a-z-]+)-(\d+)\.png$/
  const filas = new Map()
  for (const nombre of await readdir(dir)) {
    const m = re.exec(nombre)
    if (!m) continue
    const clave = `${m[1]}-${m[2]}`
    if (!filas.has(clave)) filas.set(clave, { anim: m[1], dir: m[2], marcos: [] })
    filas.get(clave).marcos[Number(m[3])] = join(dir, nombre)
  }
  return [...filas.values()].sort(
    (a, b) => a.anim.localeCompare(b.anim) || ORDEN_DIR.indexOf(a.dir) - ORDEN_DIR.indexOf(b.dir),
  )
}

function sombraSvg(ancho, alto, pivX, pivY) {
  const rx = ancho * 0.3
  const ry = rx / 2
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">` +
      `<defs><radialGradient id="g"><stop offset="0.55" stop-color="#5A5470" stop-opacity="0.35"/>` +
      `<stop offset="1" stop-color="#5A5470" stop-opacity="0"/></radialGradient></defs>` +
      `<ellipse cx="${pivX}" cy="${pivY}" rx="${rx}" ry="${ry}" fill="url(#g)"/></svg>`,
  )
}

async function montar({ dir, destino, origen, estira, sombra }) {
  const filas = await fotogramas(dir)
  if (filas.length === 0) throw new Error(`No hay fotogramas en ${dir}`)
  const meta = await sharp(filas[0].marcos[0]).metadata()
  const ancho1 = Math.round(meta.width / origen)
  const alto1 = Math.round((meta.height * estira) / origen)
  const columnas = Math.max(...filas.map((f) => f.marcos.length))
  await mkdir(dirname(destino), { recursive: true })

  for (const k of [1, 2]) {
    const w = ancho1 * k
    const h = alto1 * k
    const capas = []
    const frames = {}
    for (const [fila, f] of filas.entries()) {
      for (const [col, ruta] of f.marcos.entries()) {
        let img = sharp(ruta).resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
        if (sombra) {
          // Pivote a 6/64 del borde inferior (biblia §1), sombra debajo del personaje.
          const fondo = sharp(sombraSvg(w, h, w / 2, h - (h * 6) / 64)).png()
          img = sharp(await fondo.toBuffer()).composite([{ input: await img.png().toBuffer() }])
        }
        capas.push({ input: await img.png().toBuffer(), left: col * w, top: fila * h })
        frames[`${f.anim}-${f.dir}-${col}`] = {
          frame: { x: col * w, y: fila * h, w, h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w, h },
          sourceSize: { w, h },
        }
      }
    }
    const archivo = `${destino}@${k}x.webp`
    const info = await sharp({
      create: { width: columnas * w, height: filas.length * h, channels: 4, background: '#0000' },
    })
      .composite(capas)
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(archivo)
    const atlas = {
      frames,
      meta: {
        app: 'scripts/montar-hojas.mjs',
        image: basename(archivo),
        size: { w: info.width, h: info.height },
        scale: String(k),
      },
    }
    await writeFile(`${destino}@${k}x.json`, JSON.stringify(atlas, null, 2) + '\n')
    console.log(basename(archivo), info.width, 'x', info.height, Math.round(info.size / 1024), 'KB')
  }
}

await montar(leerArgs(process.argv.slice(2)))
