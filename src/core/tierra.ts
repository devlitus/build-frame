import { CULTIVOS } from './datos/claves'
import type { EstadoJuego } from './estado'
import { ladoValle } from './mapa'

/**
 * Tierra trabajada (GDD §6.6). Representación compacta, sin una entrada por casilla de valle:
 * - `EstadoJuego.tierra`: cadena de `lado*lado` caracteres (índice y*lado+x):
 *   `.` sin labrar; `a` arada y seca (recién arada o regada ayer); `1`..`9` arada y seca desde
 *   hace ese número de días sin regar (solo cuenta si no hay planta); `A` arada y regada hoy.
 * - `EstadoJuego.plantas`: una `Planta` por casilla plantada, ordenadas por casilla ascendente
 *   (como mucho una por casilla arada: la lista nunca supera el número de casillas aradas).
 *
 * El riego vive solo en `tierra` (`A`): lo mojado se dibuja desde la tierra. Invariantes: una
 * planta solo vive en casilla arada (`tierraValida`); la tierra arada está en zona cultivo o
 * huerto, sin edificio, obra, obstáculo ni agua (lo garantizan los comandos).
 */
export const CARACTER_SIN_LABRAR = '.'
export const CARACTER_ARADA = 'a'
export const CARACTER_REGADA = 'A'
/** Máximo de días secos que cabe en un carácter (`1`..`9`). */
export const MAX_DIAS_SECA = 9

/** Convierte -0 (p. ej. de `Math.floor(-0.5) + 1`) en 0 para que los eventos sean estables. */
export const sinCeroNegativo = (n: number): number => n + 0

/** ¿Es el carácter de una casilla arada (seca, con días secos o regada)? */
export const esCaracterArada = (c: string | undefined): boolean =>
  c === CARACTER_ARADA || c === CARACTER_REGADA || (c !== undefined && /^[1-9]$/.test(c))

/** Carácter de una casilla arada y seca desde hace `dias` días sin regar. */
export const caracterSeca = (dias: number): string =>
  dias <= 0 ? CARACTER_ARADA : String(Math.min(dias, MAX_DIAS_SECA))

/** Días secos que codifica un carácter de arada seca (0 si es `a`, regada o no arada). */
export const diasSecaDe = (c: string | undefined): number =>
  c !== undefined && /^[1-9]$/.test(c) ? Number(c) : 0

/**
 * Planta como tupla (compacta para el guardado):
 * `[casilla, cultivo, dias, regada, diasSinAgua, marchita]`
 * - `casilla`: índice y*lado+x.
 * - `cultivo`: índice en `CULTIVOS`.
 * - `dias`: días de crecimiento acumulados.
 * - `regada`: reservado, siempre 0 (el riego vive en `tierra`, carácter `A`).
 * - `diasSinAgua`: días seguidos sin regar.
 * - `marchita`: 1 si se marchitó.
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
  return i >= 0 && esCaracterArada(estado.tierra[i])
}

/** ¿Está regada hoy la casilla (x, y)? */
export function estaRegada(
  estado: Pick<EstadoJuego, 'valle' | 'tierra'>,
  x: number,
  y: number,
): boolean {
  const i = indiceDe(estado, x, y)
  return i >= 0 && estado.tierra[i] === CARACTER_REGADA
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
    if (!esCaracterArada(tierra[i])) continue
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
      !esCaracterArada(estado.tierra[casilla as number]) ||
      !Number.isSafeInteger(cultivo) ||
      CULTIVOS[cultivo as number] === undefined ||
      !Number.isSafeInteger(dias) ||
      (dias as number) < 0 ||
      regada !== 0 ||
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
