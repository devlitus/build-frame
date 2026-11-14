import { CULTIVOS } from './datos/claves'
import type { EstadoJuego } from './estado'
import { ladoValle } from './mapa'

/**
 * Tierra trabajada (GDD §6.6). Representación compacta, sin una entrada por casilla de valle:
 * - `EstadoJuego.tierra`: cadena de `lado*lado` caracteres (índice y*lado+x), `.` sin labrar y
 *   `a` arada (con o sin planta).
 * - `EstadoJuego.plantas`: una `Planta` por casilla plantada, ordenadas por casilla ascendente
 *   (como mucho una por casilla arada: la lista nunca supera el número de casillas aradas).
 *
 * Invariantes: una planta solo vive en casilla arada (`tierraValida`); la tierra arada está en
 * zona cultivo o huerto, sin edificio, obra, obstáculo ni agua (lo garantizan los comandos).
 */
export const CARACTER_SIN_LABRAR = '.'
export const CARACTER_ARADA = 'a'

/**
 * Planta como tupla (compacta para el guardado):
 * `[casilla, cultivo, dias, regada, diasSinAgua, marchita]`
 * - `casilla`: índice y*lado+x.
 * - `cultivo`: índice en `CULTIVOS`.
 * - `dias`: días de crecimiento acumulados.
 * - `regada`: 1 si se regó hoy (la regadera llega con M5-04).
 * - `diasSinAgua`: días seguidos sin regar (M5-04).
 * - `marchita`: 1 si se marchitó (M5-04).
 */
export type Planta = readonly [
  casilla: number,
  cultivo: number,
  dias: number,
  regada: number,
  diasSinAgua: number,
  marchita: number,
]

/** Vista legible de una `Planta`. */
export interface PlantaVista {
  readonly casilla: number
  readonly cultivo: (typeof CULTIVOS)[number]
  readonly dias: number
  readonly regada: boolean
  readonly diasSinAgua: number
  readonly marchita: boolean
}

export function vistaDePlanta(p: Planta): PlantaVista | undefined {
  const cultivo = CULTIVOS[p[1]]
  if (!cultivo) return undefined
  return {
    casilla: p[0],
    cultivo,
    dias: p[2],
    regada: p[3] === 1,
    diasSinAgua: p[4],
    marchita: p[5] === 1,
  }
}

/** Planta recién sembrada (sin crecer, sin regar). */
export const plantaNueva = (casilla: number, cultivo: number): Planta => [
  casilla,
  cultivo,
  0,
  0,
  0,
  0,
]

/** Cadena de tierra sin labrar para un valle de `lado` casillas por lado. */
export function tierraVacia(lado: number): string {
  return CARACTER_SIN_LABRAR.repeat(lado * lado)
}

type EstadoTierra = Pick<EstadoJuego, 'valle' | 'tierra' | 'plantas'>

function indiceDe(estado: Pick<EstadoJuego, 'valle'>, x: number, y: number): number {
  const lado = ladoValle(estado.valle)
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= lado || y >= lado) {
    return -1
  }
  return y * lado + x
}

/** ¿Está arada la casilla (x, y)? (con o sin planta) */
export function estaArada(estado: EstadoTierra, x: number, y: number): boolean {
  const i = indiceDe(estado, x, y)
  return i >= 0 && estado.tierra[i] === CARACTER_ARADA
}

/** Planta de la casilla (x, y), si hay. */
export function plantaEn(estado: EstadoTierra, x: number, y: number): Planta | undefined {
  const i = indiceDe(estado, x, y)
  return i < 0 ? undefined : estado.plantas.find((p) => p[0] === i)
}

/** Cadena `tierra` con las casillas `indices` sin labrar (la misma cadena si no cambia nada). */
export function sinLabrar(tierra: string, indices: Iterable<number>): string {
  let celdas: string[] | undefined
  for (const i of indices) {
    if (tierra[i] !== CARACTER_ARADA) continue
    celdas ??= tierra.split('')
    celdas[i] = CARACTER_SIN_LABRAR
  }
  return celdas ? celdas.join('') : tierra
}

/** ¿Tiene el estado la forma de tierra y plantas esperada? (un guardado manipulado podría no tenerla) */
export function tierraValida(estado: EstadoTierra): boolean {
  const lado = ladoValle(estado.valle)
  if (typeof estado.tierra !== 'string' || estado.tierra.length !== lado * lado) return false
  if (!Array.isArray(estado.plantas)) return false
  let anterior = -1
  for (const p of estado.plantas as readonly unknown[]) {
    if (!Array.isArray(p) || p.length !== 6) return false
    const [casilla, cultivo, dias, regada, sinAgua, marchita] = p as number[]
    if (
      !Number.isSafeInteger(casilla) ||
      (casilla as number) <= anterior ||
      (casilla as number) >= lado * lado ||
      estado.tierra[casilla as number] !== CARACTER_ARADA ||
      !Number.isSafeInteger(cultivo) ||
      CULTIVOS[cultivo as number] === undefined ||
      !Number.isSafeInteger(dias) ||
      (dias as number) < 0 ||
      (regada !== 0 && regada !== 1) ||
      !Number.isSafeInteger(sinAgua) ||
      (sinAgua as number) < 0 ||
      (marchita !== 0 && marchita !== 1)
    ) {
      return false
    }
    anterior = casilla as number
  }
  return true
}
