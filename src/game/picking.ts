import { RESERVAS_HUD_POR_DEFECTO, type ReservasHud } from './areaHud'
import { CONFIG_CAMARA } from './camara/config'
import type { Pantalla, Punto } from './camara/matematica'
import type { RectPantalla } from './seleccion'

/** Geometría del valle que necesita el picking (px del mundo). */
export interface GeometriaValle {
  readonly parcelasPorLado: number
  /** Lado de una parcela en px del mundo. */
  readonly ladoParcelaPx: number
}

export interface VistaCamara {
  readonly zoom: number
  readonly cx: number
  readonly cy: number
}

/**
 * Píxel del mundo a índice de parcela (fila * lado + columna). Las parcelas son semiabiertas
 * [inicio, fin): el borde compartido pertenece a la siguiente. Fuera del valle, o con
 * coordenadas no finitas, devuelve undefined.
 */
export function parcelaEnPunto(g: GeometriaValle, x: number, y: number): number | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(g.ladoParcelaPx > 0)) return undefined
  const columna = Math.floor(x / g.ladoParcelaPx)
  const fila = Math.floor(y / g.ladoParcelaPx)
  const n = g.parcelasPorLado
  if (columna < 0 || fila < 0 || columna >= n || fila >= n) return undefined
  return fila * n + columna
}

/** Rectángulo de una parcela en px del mundo. */
export function rectParcela(g: GeometriaValle, indice: number): RectPantalla {
  const n = g.parcelasPorLado
  return {
    x: (indice % n) * g.ladoParcelaPx,
    y: Math.floor(indice / n) * g.ladoParcelaPx,
    ancho: g.ladoParcelaPx,
    alto: g.ladoParcelaPx,
  }
}

export interface ConfigToque {
  readonly umbralPx: number
  readonly umbralMs: number
}

export const CONFIG_TOQUE_SELECCION: ConfigToque = {
  umbralPx: CONFIG_CAMARA.umbralSeleccionPx,
  umbralMs: CONFIG_CAMARA.umbralSeleccionMs,
}

/**
 * ¿Es un toque corto (selecciona) y no un arrastre? `movidoMax` es el mayor desplazamiento
 * (px de pantalla) respecto al punto de apoyo durante todo el gesto. El tiempo solo cuenta
 * en táctil: un clic largo con ratón sigue siendo un clic.
 */
export function esToqueDeSeleccion(
  movidoMax: number,
  ms: number,
  tactil: boolean,
  config: ConfigToque = CONFIG_TOQUE_SELECCION,
): boolean {
  if (!(movidoMax <= config.umbralPx)) return false
  return !tactil || ms < config.umbralMs
}

/** Zona de la pantalla que queda libre (sin HUD ni panel). */
export function areaLibre(
  pantalla: Pantalla,
  ocupado: RectPantalla | undefined,
  reservas: ReservasHud = RESERVAS_HUD_POR_DEFECTO,
): RectPantalla {
  const { arriba, abajo } = reservas
  let x = 0
  const y = arriba
  let ancho = pantalla.ancho
  let alto = Math.max(0, pantalla.alto - arriba - abajo)
  if (ocupado) {
    if (ocupado.ancho > pantalla.ancho * 0.6) {
      // Hoja inferior: lo libre llega hasta su borde superior.
      alto = Math.max(0, Math.min(ocupado.y, pantalla.alto - abajo) - arriba)
    } else if (ocupado.x + ocupado.ancho / 2 < pantalla.ancho / 2) {
      // Tarjeta a la izquierda: lo libre es lo que queda a su derecha.
      x = Math.min(pantalla.ancho, ocupado.x + ocupado.ancho)
      ancho = pantalla.ancho - x
    } else {
      ancho = Math.max(0, ocupado.x)
    }
  }
  return { x, y, ancho, alto }
}

function rectEnPantalla(vista: VistaCamara, pantalla: Pantalla, mundo: RectPantalla): RectPantalla {
  return {
    x: (mundo.x - vista.cx) * vista.zoom + pantalla.ancho / 2,
    y: (mundo.y - vista.cy) * vista.zoom + pantalla.alto / 2,
    ancho: mundo.ancho * vista.zoom,
    alto: mundo.alto * vista.zoom,
  }
}

/**
 * Si la parcela no se ve entera en la zona libre, el centro de vista (px del mundo) que la deja
 * en el centro de esa zona; undefined si no hace falta mover. Una parcela mayor que la zona
 * libre solo se mueve si su centro queda fuera de ella.
 */
export function centroParaVer(
  vista: VistaCamara,
  pantalla: Pantalla,
  libre: RectPantalla,
  parcelaMundo: RectPantalla,
): Punto | undefined {
  const r = rectEnPantalla(vista, pantalla, parcelaMundo)
  const entera =
    r.x >= libre.x &&
    r.y >= libre.y &&
    r.x + r.ancho <= libre.x + libre.ancho &&
    r.y + r.alto <= libre.y + libre.alto
  if (entera) return undefined
  const centro = { x: r.x + r.ancho / 2, y: r.y + r.alto / 2 }
  const mayor = r.ancho > libre.ancho || r.alto > libre.alto
  const centroLibre =
    centro.x >= libre.x &&
    centro.x <= libre.x + libre.ancho &&
    centro.y >= libre.y &&
    centro.y <= libre.y + libre.alto
  if (mayor && centroLibre) return undefined
  const meta = { x: libre.x + libre.ancho / 2, y: libre.y + libre.alto / 2 }
  return {
    x: vista.cx + (centro.x - meta.x) / vista.zoom,
    y: vista.cy + (centro.y - meta.y) / vista.zoom,
  }
}

/** Punto de pantalla donde pulsar para tocar la parcela: el centro de su parte visible y libre. */
export function puntoDeToque(
  vista: VistaCamara,
  pantalla: Pantalla,
  libre: RectPantalla,
  parcelaMundo: RectPantalla,
): Punto | undefined {
  const r = rectEnPantalla(vista, pantalla, parcelaMundo)
  const x0 = Math.max(libre.x, r.x)
  const y0 = Math.max(libre.y, r.y)
  const x1 = Math.min(libre.x + libre.ancho, r.x + r.ancho)
  const y1 = Math.min(libre.y + libre.alto, r.y + r.alto)
  if (x1 <= x0 || y1 <= y0) return undefined
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
}
