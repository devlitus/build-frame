import { defEdificio, edificiosValidos } from './edificios'
import { energiaValida } from './energia'
import type { EstadoJuego } from './estado'
import { casaTerminada, personajeAlDespertar, puertaDe } from './obras'

/** Motivos por los que `Dormir` se rechaza (los textos están en `src/ui/textos/es.json`). */
export type ErrorDormir =
  | 'estado-invalido'
  /** Solo se duerme en el Modo Vida. */
  | 'solo-en-vida'
  /** El personaje no está junto a la puerta de la casa terminada (o de la aparición si no hay casa). */
  | 'lejos-de-la-cama'
  /** `dia + 1` no sería un entero seguro. */
  | 'limite-de-dia'

/**
 * Todas las comprobaciones de `Dormir`, en su orden y sin aplicar nada: `undefined` si se puede
 * dormir o el motivo del rechazo. La interfaz usa esta misma función para mostrar la acción solo
 * donde se puede dormir. La pausa del jugador no lo impide.
 */
export function comprobarDormir(estado: EstadoJuego): ErrorDormir | undefined {
  if (estado.modo !== 'vida') return 'solo-en-vida'
  const p = estado.personaje
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !energiaValida(estado.energia)) {
    return 'estado-invalido'
  }
  if (!edificiosValidos(estado.edificios)) return 'estado-invalido'
  if (!juntoALaCama(estado)) return 'lejos-de-la-cama'
  if (!Number.isSafeInteger(estado.dia + 1)) return 'limite-de-dia'
  return undefined
}

/**
 * Casilla de la cama: donde despierta el personaje (la puerta de la casa terminada o, si no hay,
 * la aparición).
 */
export function casillaDeCama(estado: EstadoJuego): { x: number; y: number } {
  const p = personajeAlDespertar(estado)
  return { x: Math.floor(p.x), y: Math.floor(p.y) }
}

/** Casilla de la puerta de la casa terminada de menor id (sin casa, la de la aparición). */
export function casillaDePuerta(estado: EstadoJuego): { x: number; y: number } {
  const casa = casaTerminada(estado)
  const def = casa && defEdificio(casa.tipo)
  if (!casa || !def) return casillaDeCama(estado)
  const puerta = puertaDe(def, casa.x, casa.y)
  return { x: puerta.x, y: puerta.y }
}

/**
 * ¿Está el personaje a Chebyshev <= 1 de la casilla de despertar (la cama) o de la puerta de la
 * casa? Si la puerta está tapada, la cama se desplaza y valen ambas.
 */
export function juntoALaCama(estado: EstadoJuego): boolean {
  const p = estado.personaje
  const px = Math.floor(p.x)
  const py = Math.floor(p.y)
  return [casillaDeCama(estado), casillaDePuerta(estado)].some(
    (c) => Math.max(Math.abs(px - c.x), Math.abs(py - c.y)) <= 1,
  )
}
