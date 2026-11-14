import { edificiosValidos } from './edificios'
import { energiaValida } from './energia'
import type { EstadoJuego } from './estado'
import { juntoALaCama } from './obras'

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
