import type Phaser from 'phaser'
import {
  CULTIVOS,
  ZONAS,
  type Cultivo,
  type Terreno,
  type TipoEdificio,
  type Zona,
} from '../../core'
import { dprActual, escalaArte, sufijoArte } from '../resolucion'
import {
  ANIMACIONES_PERSONAJE,
  CLAVE_PROTAGONISTA,
  nombreFotograma,
  type AccionPersonaje,
} from './animacionPersonaje'
import { TAM_CASILLA } from './estilo'

/*
 * Arte final (estilo B, M5-00): claves de textura, carga y animaciones. Los archivos viven en
 * `public/assets/` a @1x y @2x; se carga uno u otro según el DPR (`resolucion.ts`) y el resto del
 * juego pinta cada textura a su tamaño nominal con `escalaNominal`, así que da igual cuál se cargó.
 */

/** Tipos de terreno de las tiras de `public/assets/terreno` (4 variantes de una casilla cada una). */
export type TileTerreno = 'hierba' | 'tierra' | 'camino' | 'agua'
export const TILES_TERRENO: readonly TileTerreno[] = ['hierba', 'tierra', 'camino', 'agua']
export const VARIANTES_TILE = 4

/**
 * Tile con que se pinta cada terreno de parcela. No hay tile propio de bosque ni de roca: el bosque
 * se distingue por sus árboles y lo rocoso usa el camino (arena y guijarros) hasta que llegue el
 * arte que falta. La tierra (arada) queda para los cultivos de M5.
 */
export const TILE_DE_TERRENO: Readonly<Record<Terreno, TileTerreno>> = {
  prado: 'hierba',
  bosque: 'hierba',
  rocoso: 'camino',
}
export const TILE_RIO: TileTerreno = 'agua'
/** El vado se pinta como camino: un paso de arena que cruza el agua. */
export const TILE_VADO: TileTerreno = 'camino'

export const claveTile = (t: TileTerreno): string => `tile-${t}`
export const claveZona = (z: Zona): string => `zona-${z}`
export const CLAVE_TIERRA_ARADA = 'tierra-arada-seca'
export const CLAVE_TIERRA_MOJADA = 'tierra-arada-mojada'
export const claveCultivo = (c: Cultivo): string => `cultivo-${c}`
/** Marco de un cultivo en px @1x (pivote en el centro del borde inferior). */
export const MARCO_CULTIVO = { ancho: 32, alto: 48 } as const
/** Fotogramas de la tierra arada: 0 a 3 relleno y 4 a 7 borde arriba, derecha, abajo, izquierda. */
export const FOTOGRAMAS_TIERRA = {
  rellenos: 4,
  arriba: 4,
  derecha: 5,
  abajo: 6,
  izquierda: 7,
} as const
/** Fotograma de un cultivo marchito (los 0 a 3 son las fases de crecimiento). */
export const FOTOGRAMA_MARCHITO = 4
export const CLAVE_COLOCACION = 'colocacion'
export const CLAVE_ARBOL = 'arbol'
export const CLAVE_ROCA = 'roca'
export const CLAVE_PLANTON = 'planton'

/** Fotogramas de la tira de una zona: 0 a 3 relleno y 4 a 7 borde arriba, derecha, abajo, izquierda. */
export const FOTOGRAMAS_ZONA = {
  rellenos: 4,
  bordeArriba: 4,
  bordeDerecha: 5,
  bordeAbajo: 6,
  bordeIzquierda: 7,
} as const

/** Archivo de cada edificio (la caja de envío se llama `caja`). */
const ARCHIVO_EDIFICIO: Readonly<Record<TipoEdificio, string>> = {
  casa: 'casa',
  'caja-envio': 'caja',
  cobertizo: 'cobertizo',
}

export type EstadoEdificio = 'terminado' | 'obra' | 'cimientos'

/** Estados con arte de cada edificio (la caja no tiene cimientos). */
const ESTADOS_EDIFICIO: Readonly<Record<TipoEdificio, readonly EstadoEdificio[]>> = {
  casa: ['terminado', 'obra', 'cimientos'],
  cobertizo: ['terminado', 'obra', 'cimientos'],
  'caja-envio': ['terminado', 'obra'],
}

/** Clave de textura de un edificio; si no tiene arte para ese estado usa el de obra. */
export function claveEdificio(tipo: TipoEdificio, estado: EstadoEdificio): string {
  const e = ESTADOS_EDIFICIO[tipo].includes(estado) ? estado : 'obra'
  return `${ARCHIVO_EDIFICIO[tipo]}-${e}`
}

/**
 * Qué estado del edificio se ve: terminado sin obra; con obra, los cimientos el primer día de una
 * obra de varios días y el andamio el resto (la caja, de un día, siempre andamio).
 */
export function estadoDeEdificio(
  obra: { readonly diaInicio: number; readonly diaFin: number } | null,
  dia: number,
): EstadoEdificio {
  if (obra === null) return 'terminado'
  return obra.diaFin - obra.diaInicio > 1 && dia <= obra.diaInicio ? 'cimientos' : 'obra'
}

/**
 * Marco de cada edificio en px @1x y cuánto sobresale de su huella por la izquierda y por arriba
 * (`docs/informes/arte-m4.md`): el sprite se coloca con la esquina en `(32x - izquierda, 32y - arriba)`.
 */
export const MARCO_EDIFICIO: Readonly<
  Record<
    TipoEdificio,
    {
      readonly ancho: number
      readonly alto: number
      readonly izquierda: number
      readonly arriba: number
    }
  >
> = {
  casa: { ancho: 192, alto: 192, izquierda: 16, arriba: 80 },
  cobertizo: { ancho: 160, alto: 160, izquierda: 16, arriba: 80 },
  'caja-envio': { ancho: 80, alto: 64, izquierda: 16, arriba: 16 },
}

/** Marcos nominales (px @1x) de árbol y roca, con el pivote en la base, centrado. */
export const MARCO_ARBOL = { ancho: 64, alto: 96 } as const
export const MARCO_ROCA = { ancho: 32, alto: 32 } as const
/** Plantón de árbol: tira de 2 marcos (0 recién plantado, 1 arbolito). */
export const MARCO_PLANTON = { ancho: 32, alto: 48 } as const
/** Marco del protagonista y pivote en los pies (biblia §1). */
export const MARCO_PERSONAJE = { ancho: 48, alto: 64, pivoteX: 24, pivoteY: 58 } as const

const ruta = (carpeta: string, nombre: string, sufijo: string): string =>
  `assets/${carpeta}/${nombre}${sufijo}.webp`

/** Ruta de la tira de una zona: la usan el lienzo y las muestras de la barra de zonas (una sola fuente). */
export const rutaTiraZona = (z: Zona, sufijo: '@1x' | '@2x'): string =>
  ruta('zonas', `zona-${z}`, sufijo)

/** Carga todo el arte del valle con la escala que toca por el DPR; Phaser salta lo que ya está en caché. */
export function cargarArte(escena: Phaser.Scene): void {
  const dpr = dprActual()
  const s = sufijoArte(dpr)
  const e = escalaArte(dpr)
  const c = TAM_CASILLA * e
  const l = escena.load
  l.atlas(
    CLAVE_PROTAGONISTA,
    ruta('protagonista', 'protagonista', s),
    `assets/protagonista/protagonista${s}.json`,
  )
  for (const t of TILES_TERRENO) {
    l.spritesheet(claveTile(t), ruta('terreno', `tile-${t}`, s), { frameWidth: c, frameHeight: c })
  }
  l.image(CLAVE_ARBOL, ruta('objetos', 'arbol', s))
  l.image(CLAVE_ROCA, ruta('objetos', 'roca', s))
  l.spritesheet(CLAVE_PLANTON, ruta('objetos', 'planton', s), {
    frameWidth: MARCO_PLANTON.ancho * e,
    frameHeight: MARCO_PLANTON.alto * e,
  })
  for (const tipo of Object.keys(ARCHIVO_EDIFICIO) as TipoEdificio[]) {
    for (const estado of ESTADOS_EDIFICIO[tipo]) {
      l.image(
        claveEdificio(tipo, estado),
        ruta('edificios', `${ARCHIVO_EDIFICIO[tipo]}-${estado}`, s),
      )
    }
  }
  for (const z of ZONAS) {
    l.spritesheet(claveZona(z), rutaTiraZona(z, s), { frameWidth: c, frameHeight: c })
  }
  l.spritesheet(CLAVE_TIERRA_ARADA, ruta('terreno', 'tierra-arada-seca', s), {
    frameWidth: c,
    frameHeight: c,
  })
  l.spritesheet(CLAVE_TIERRA_MOJADA, ruta('terreno', 'tierra-arada-mojada', s), {
    frameWidth: c,
    frameHeight: c,
  })
  for (const cultivo of CULTIVOS) {
    l.spritesheet(claveCultivo(cultivo), ruta('cultivos', cultivo, s), {
      frameWidth: c,
      frameHeight: MARCO_CULTIVO.alto * e,
    })
  }
  l.spritesheet(CLAVE_COLOCACION, ruta('zonas', 'colocacion', s), { frameWidth: c, frameHeight: c })
}

/** Crea (una vez para todo el juego) las animaciones del protagonista a partir del atlas. */
export function crearAnimacionesPersonaje(escena: Phaser.Scene): void {
  const anims = escena.anims
  for (const accion of Object.keys(ANIMACIONES_PERSONAJE) as AccionPersonaje[]) {
    const { fotogramas, fps } = ANIMACIONES_PERSONAJE[accion]
    for (const dir of ['abajo', 'arriba', 'derecha']) {
      const clave = `${accion}-${dir}`
      if (anims.exists(clave)) continue
      anims.create({
        key: clave,
        frames: Array.from({ length: fotogramas }, (_, n) => ({
          key: CLAVE_PROTAGONISTA,
          frame: nombreFotograma(clave, n),
        })),
        frameRate: fps,
        repeat: -1,
      })
    }
  }
}

/**
 * Escala con la que pintar una textura para que mida `anchoNominal` px del mundo: 1 si se cargó
 * @1x y 0,5 si se cargó @2x. Se lee de la textura (no del DPR actual) para no desajustarse si
 * cambia el DPR tras cargar. En una tira (tiles, zonas) hay que indicar un `fotograma`.
 */
export function escalaNominal(
  escena: Phaser.Scene,
  clave: string,
  anchoNominal: number,
  fotograma: string | number = '__BASE',
): number {
  const real = escena.textures.getFrame(clave, fotograma).realWidth
  return real > 0 ? anchoNominal / real : 1
}

/** Un sello reutilizable para estampar fotogramas en las texturas horneadas (no está en la escena). */
export function crearSello(escena: Phaser.Scene): Phaser.GameObjects.Image {
  return escena.make.image({ x: 0, y: 0, key: CLAVE_ARBOL }, false).setOrigin(0, 0)
}
