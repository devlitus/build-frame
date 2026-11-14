/**
 * Matemática pura de la cámara (sin Phaser). La vista se describe con el zoom y el
 * centro de la pantalla expresado en coordenadas del mundo: el punto del mundo bajo
 * un punto de pantalla (px, py) es `centro + (p - tamañoPantalla / 2) / zoom`.
 */
export interface Vista {
  readonly zoom: number
  readonly cx: number
  readonly cy: number
}

export interface Pantalla {
  readonly ancho: number
  readonly alto: number
}

export interface Punto {
  readonly x: number
  readonly y: number
}

export interface LimitesZoom {
  readonly min: number
  readonly max: number
}

export function limitarZoom(zoom: number, l: LimitesZoom): number {
  return Math.min(l.max, Math.max(l.min, zoom))
}

/** Punto del mundo que está bajo el punto de pantalla `p`. */
export function puntoMundo(v: Vista, pantalla: Pantalla, p: Punto): Punto {
  return {
    x: v.cx + (p.x - pantalla.ancho / 2) / v.zoom,
    y: v.cy + (p.y - pantalla.alto / 2) / v.zoom,
  }
}

const ZOOM_EPSILON = 1e-6

/** Zoom mínimo: el mundo cuadrado entero cabe en la pantalla (contener). */
export function zoomEncuadrado(pantalla: Pantalla, mundo: number): number {
  // Suelo de épsilon: con una pantalla de 0 px el zoom no llega a 0.
  return Math.max(ZOOM_EPSILON, Math.min(pantalla.ancho, pantalla.alto) / mundo)
}

/**
 * Extensión opcional por eje: un centro objetivo (px del mundo) que amplía el rango permitido
 * del centro hasta incluirlo, aunque quede fuera de los límites normales del valle.
 */
export interface Extension {
  readonly x?: number | undefined
  readonly y?: number | undefined
  /** Márgenes permanentes del Modo Plano (ver `Margenes`). */
  readonly margenes?: Margenes | undefined
}

/**
 * Lo que la interfaz tapa en cada lado de la pantalla (px de pantalla). Permite que el borde del
 * valle llegue hasta el borde de la zona libre y que cualquier casilla pueda quedar en el centro.
 */
export interface Margenes {
  readonly arriba: number
  readonly abajo: number
  readonly izq: number
  readonly der: number
  /**
   * Vida: el rango del centro solo se amplía en el extremo tapado (`lo -= izq/zoom`,
   * `hi += der/zoom`), sin abrirlo a `[0, mundo]`. Sin esto (Plano) cualquier casilla puede
   * quedar en el centro.
   */
  readonly soloExtremos?: boolean
}

export function limitarEje(
  centro: number,
  pantalla: number,
  zoom: number,
  mundo: number,
  extension?: number,
  margenLo = 0,
  margenHi = 0,
  soloExtremos = false,
): number {
  const visible = pantalla / zoom
  let lo = visible >= mundo ? mundo / 2 : visible / 2
  let hi = visible >= mundo ? mundo / 2 : mundo - visible / 2
  if (visible < mundo && (margenLo > 0 || margenHi > 0)) {
    // El borde del valle llega al borde de la zona libre (se ve lo que tapan HUD y paneles) y
    // cualquier casilla del valle puede quedar en el centro.
    if (soloExtremos) {
      lo -= Math.max(0, margenLo) / zoom
      hi += Math.max(0, margenHi) / zoom
    } else {
      lo = Math.min(lo - Math.max(0, margenLo) / zoom, 0)
      hi = Math.max(hi + Math.max(0, margenHi) / zoom, mundo)
    }
  }
  if (extension !== undefined) {
    lo = Math.min(lo, extension)
    hi = Math.max(hi, extension)
  }
  return Math.min(hi, Math.max(lo, centro))
}

/**
 * Mantiene la vista dentro del mundo; si el mundo cabe en un eje, lo centra en él. Con
 * `extension` el rango del centro se amplía para incluir ese objetivo.
 */
export function limitarVista(
  v: Vista,
  pantalla: Pantalla,
  mundo: number,
  extension?: Extension,
): Vista {
  return {
    zoom: v.zoom,
    cx: limitarEje(
      v.cx,
      pantalla.ancho,
      v.zoom,
      mundo,
      extension?.x,
      extension?.margenes?.izq,
      extension?.margenes?.der,
      extension?.margenes?.soloExtremos,
    ),
    cy: limitarEje(
      v.cy,
      pantalla.alto,
      v.zoom,
      mundo,
      extension?.y,
      extension?.margenes?.arriba,
      extension?.margenes?.abajo,
      extension?.margenes?.soloExtremos,
    ),
  }
}

/**
 * Transformación general de un gesto: el punto del mundo que estaba bajo `desde`
 * pasa a estar bajo `hasta`, con el zoom multiplicado por `factor`.
 * Arrastre: factor 1. Rueda: desde = hasta = cursor. Pellizco: puntos medios y
 * factor = distancia nueva / distancia anterior.
 */
export function transformar(
  v: Vista,
  pantalla: Pantalla,
  desde: Punto,
  hasta: Punto,
  factor: number,
  zoomLim: LimitesZoom,
  mundo: number,
  extension?: Extension,
): Vista {
  const w = puntoMundo(v, pantalla, desde)
  const zoom = limitarZoom(v.zoom * factor, zoomLim)
  const nueva: Vista = {
    zoom,
    cx: w.x - (hasta.x - pantalla.ancho / 2) / zoom,
    cy: w.y - (hasta.y - pantalla.alto / 2) / zoom,
  }
  return limitarVista(nueva, pantalla, mundo, extension)
}

/** Zoom alrededor de un punto de pantalla (el punto del mundo bajo él no se mueve). */
export function zoomEn(
  v: Vista,
  pantalla: Pantalla,
  punto: Punto,
  factor: number,
  zoomLim: LimitesZoom,
  mundo: number,
): Vista {
  return transformar(v, pantalla, punto, punto, factor, zoomLim, mundo)
}

export interface DosDedos {
  readonly distancia: number
  readonly medio: Punto
}

export function medirDedos(a: Punto, b: Punto): DosDedos {
  return {
    distancia: Math.hypot(a.x - b.x, a.y - b.y),
    medio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  }
}

/** Razón de zoom de un pellizco; 1 si algún dedo está superpuesto (distancia 0). */
export function factorPellizco(antes: DosDedos, ahora: DosDedos): number {
  return antes.distancia > 0 && ahora.distancia > 0 ? ahora.distancia / antes.distancia : 1
}

/** Paso de pellizco entre dos mediciones consecutivas (distancia y punto medio). */
export function pasoPellizco(
  v: Vista,
  pantalla: Pantalla,
  antes: DosDedos,
  ahora: DosDedos,
  zoomLim: LimitesZoom,
  mundo: number,
): Vista {
  return transformar(
    v,
    pantalla,
    antes.medio,
    ahora.medio,
    factorPellizco(antes, ahora),
    zoomLim,
    mundo,
  )
}

/**
 * Seguimiento suave: acerca el centro de la vista a `objetivo` con una exponencial de
 * constante de tiempo `constanteMs` (independiente de los fps). Converge sin pasarse; con
 * `delta` ≤ 0 o no finito no cambia la vista.
 */
export function acercar(vista: Vista, objetivo: Punto, delta: number, constanteMs: number): Vista {
  if (!Number.isFinite(delta) || delta <= 0) return vista
  const k = constanteMs > 0 ? 1 - Math.exp(-delta / constanteMs) : 1
  return {
    ...vista,
    cx: vista.cx + (objetivo.x - vista.cx) * k,
    cy: vista.cy + (objetivo.y - vista.cy) * k,
  }
}
