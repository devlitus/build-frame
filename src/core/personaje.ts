import { CONFIG_PERSONAJE } from './datos/personaje'
import type { Lado } from './rio'
import {
  casillaBloqueada,
  mapaTransitabilidad,
  type DatosMapa,
  type MapaTransitabilidad,
} from './mapa'

export type Orientacion = Lado

/** Posición continua (centro de la caja) en unidades de casilla, y hacia dónde mira. */
export interface Personaje {
  readonly x: number
  readonly y: number
  readonly orientacion: Orientacion
}

/** Orientación con la que aparece (y reaparece tras un desmayo). */
export const ORIENTACION_INICIAL: Orientacion = 'sur'

/** Margen para no quedar pegado al borde de una casilla bloqueada por redondeo. */
const HOLGURA = 1e-6
/**
 * Avance máximo por subpaso, en casillas. Mientras sea < 1 casilla no se salta una casilla
 * bloqueada entera (efecto túnel); también se acota por la caja por si esta es pequeña.
 */
const PASO_MAXIMO = 0.25

export function personajeEnAparicion(aparicion: DatosMapa['aparicion']): Personaje {
  return { x: aparicion.x, y: aparicion.y, orientacion: ORIENTACION_INICIAL }
}

/** ¿La caja centrada en (x, y), de semilado `m`, toca alguna casilla bloqueada? */
function chocaCaja(mapa: MapaTransitabilidad, x: number, y: number, m: number): boolean {
  const x0 = Math.floor(x - m)
  const x1 = Math.ceil(x + m) - 1
  const y0 = Math.floor(y - m)
  const y1 = Math.ceil(y + m) - 1
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) if (casillaBloqueada(mapa, cx, cy)) return true
  }
  return false
}

/**
 * Mueve al personaje `ms` milisegundos con la intención `(dx, dy)`, ya validada
 * (componentes en [-1, 1], `ms` finito y ≥ 0). Se normaliza si su módulo supera 1 para que la
 * diagonal no sea más rápida. Colisión AABB resolviendo por ejes: al chocar en un eje
 * se pega a la pared y el otro eje sigue, así se desliza.
 */
export function moverPersonaje(
  datos: DatosMapa,
  personaje: Personaje,
  dx: number,
  dy: number,
  ms: number,
  config = CONFIG_PERSONAJE,
): Personaje {
  const largo = Math.sqrt(dx * dx + dy * dy)
  if (largo === 0) return personaje
  const ux = largo > 1 ? dx / largo : dx
  const uy = largo > 1 ? dy / largo : dy
  const orientacion: Orientacion =
    Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'este' : 'oeste') : dy > 0 ? 'sur' : 'norte'
  const mapa = mapaTransitabilidad(datos)
  const m = config.tamanoCaja / 2
  const enMs = Math.min(ms, config.maxMsPorComando)
  const distancia = (config.velocidadCasillasPorSegundo * enMs) / 1000
  const pasos = Math.ceil(distancia / Math.min(PASO_MAXIMO, config.tamanoCaja))
  const avance = pasos > 0 ? distancia / pasos : 0
  let x = personaje.x
  let y = personaje.y
  for (let i = 0; i < pasos; i++) {
    const nx = x + ux * avance
    if (!chocaCaja(mapa, nx, y, m)) x = nx
    else if (ux > 0) x = Math.max(x, Math.floor(nx + m) - m - HOLGURA)
    else if (ux < 0) x = Math.min(x, Math.floor(nx - m) + 1 + m + HOLGURA)
    const ny = y + uy * avance
    if (!chocaCaja(mapa, x, ny, m)) y = ny
    else if (uy > 0) y = Math.max(y, Math.floor(ny + m) - m - HOLGURA)
    else if (uy < 0) y = Math.min(y, Math.floor(ny - m) + 1 + m + HOLGURA)
  }
  return { x, y, orientacion }
}
