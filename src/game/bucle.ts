import { CONFIG_PERSONAJE, minutosDeJuegoPorMs, type Comando } from '../core'
import type { Intencion } from './entrada'

/** Máximo de ms reales que cuenta un fotograma: una pestaña en segundo plano no salta de golpe. */
export const DELTA_MAXIMO_MS = 100

export function acotarDelta(delta: number): number {
  return Number.isFinite(delta) ? Math.min(Math.max(delta, 0), DELTA_MAXIMO_MS) : 0
}

/**
 * Acumula los minutos de juego fraccionarios y devuelve los enteros ya cumplidos
 * (quedándose con el resto). A x1 un día (1200 min de juego) dura ~15 min reales.
 */
export class AcumuladorTiempo {
  private resto = 0

  /** `delta` ya acotado; devuelve los minutos enteros a avanzar (0 si en pausa). */
  acumular(delta: number, velocidad: number, pausado: boolean): number {
    if (pausado) return 0
    this.resto += minutosDeJuegoPorMs(delta, velocidad)
    const enteros = Math.floor(this.resto)
    this.resto -= enteros
    return enteros
  }
}

/** Comandos de movimiento de un fotograma, troceados para respetar `maxMsPorComando`. */
export function comandosMovimiento(
  intencion: Intencion,
  delta: number,
  maxMs: number = CONFIG_PERSONAJE.maxMsPorComando,
): Comando[] {
  if ((intencion.dx === 0 && intencion.dy === 0) || !(delta > 0) || !(maxMs > 0)) return []
  const comandos: Comando[] = []
  for (let resto = delta; resto > 0; resto -= maxMs) {
    comandos.push({
      tipo: 'MoverPersonaje',
      dx: intencion.dx,
      dy: intencion.dy,
      ms: Math.min(resto, maxMs),
    })
  }
  return comandos
}
