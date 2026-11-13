import { CONFIG_PERSONAJE } from './datos/personaje'
import { CONFIG_TIEMPO } from './datos/tiempo'
import { defEdificio, huellaDe, type Edificio, type TipoEdificio } from './edificios'
import type { EstadoJuego } from './estado'
import { casillaBloqueada, mapaTransitabilidad, type MapaTransitabilidad } from './mapa'
import { ORIENTACION_INICIAL, personajeEnAparicion, type Personaje } from './personaje'

/** Hecho de que una obra terminó al empezar un día. */
export interface ObraTerminada {
  readonly tipo: 'obra-terminada'
  readonly id: number
  readonly tipoEdificio: TipoEdificio
}

/**
 * Termina las obras con `diaFin <= estado.dia` (`obra` pasa a `null`). Función pura que se
 * llama en todo cambio de día. Eventos en orden de id ascendente. Si no termina ninguna
 * devuelve el mismo estado.
 */
export function terminarObras(estado: EstadoJuego): {
  readonly estado: EstadoJuego
  readonly eventos: readonly ObraTerminada[]
} {
  const eventos: ObraTerminada[] = []
  const terminadas: Edificio[] = []
  for (const e of estado.edificios) {
    if (e.obra !== null && e.obra.diaFin <= estado.dia) {
      terminadas.push(e)
      eventos.push({ tipo: 'obra-terminada', id: e.id, tipoEdificio: e.tipo })
    }
  }
  if (terminadas.length === 0) return { estado, eventos }
  eventos.sort((a, b) => a.id - b.id)
  const edificios = estado.edificios.map((e) => (terminadas.includes(e) ? { ...e, obra: null } : e))
  return { estado: { ...estado, edificios }, eventos }
}

/**
 * Casilla de la puerta de un edificio con esquina `(x, y)`: la casilla justo debajo del centro
 * del borde inferior de la huella, `(x + floor(ancho / 2), y + alto)`. Casa 4×3 en (x, y) ⇒
 * `(x + 2, y + 3)`.
 */
export function puertaDe(
  def: { readonly ancho: number; readonly alto: number },
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: x + Math.floor(def.ancho / 2), y: y + def.alto }
}

/** ¿Cabe la caja de colisión centrada en la casilla `(cx, cy)` sin tocar nada bloqueado? */
function casillaLibre(mapa: MapaTransitabilidad, cx: number, cy: number): boolean {
  const m = CONFIG_PERSONAJE.tamanoCaja / 2
  const x0 = Math.floor(cx + 0.5 - m)
  const x1 = Math.ceil(cx + 0.5 + m) - 1
  const y0 = Math.floor(cy + 0.5 - m)
  const y1 = Math.ceil(cy + 0.5 + m) - 1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (casillaBloqueada(mapa, x, y)) return false
  }
  return true
}

/**
 * Dónde despierta el personaje al empezar un día, con las obras ya actualizadas: en la puerta
 * de la casa terminada (la de menor id) o, si no hay, en la aparición.
 *
 * Si la puerta (`puertaDe`) no es transitable (el mapa ya marca como bloqueado lo no
 * alcanzable desde la aparición), se busca alrededor de la huella: anillos de distancia
 * Chebyshev 1, 2, 3… al rectángulo de la huella; en el primer anillo con alguna casilla libre,
 * gana la más cercana a la puerta (distancia euclídea al cuadrado), y a igualdad la de menor
 * `y` y luego menor `x`. Si no hay ninguna, la aparición. Siempre centrado y mirando al sur.
 */
export function personajeAlDespertar(estado: EstadoJuego): Personaje {
  const aparicion = personajeEnAparicion(estado.aparicion)
  const casa = estado.edificios
    .filter((e) => e.tipo === 'casa' && e.obra === null)
    .sort((a, b) => a.id - b.id)[0]
  const def = casa && defEdificio(casa.tipo)
  if (!casa || !def) return aparicion
  const mapa = mapaTransitabilidad(estado)
  const en = (x: number, y: number): Personaje => ({
    x: x + 0.5,
    y: y + 0.5,
    orientacion: ORIENTACION_INICIAL,
  })
  const puerta = puertaDe(def, casa.x, casa.y)
  if (casillaLibre(mapa, puerta.x, puerta.y)) return en(puerta.x, puerta.y)
  const h = huellaDe(def, casa.x, casa.y)
  for (let d = 1; d <= mapa.lado; d++) {
    let mejor: { x: number; y: number; dist: number } | null = null
    for (let y = h.y0 - d; y <= h.y1 + d; y++) {
      for (let x = h.x0 - d; x <= h.x1 + d; x++) {
        // Solo el anillo exterior a distancia exacta d.
        if (x > h.x0 - d && x < h.x1 + d && y > h.y0 - d && y < h.y1 + d) continue
        if (!casillaLibre(mapa, x, y)) continue
        const dist = (x - puerta.x) ** 2 + (y - puerta.y) ** 2
        if (
          !mejor ||
          dist < mejor.dist ||
          (dist === mejor.dist && (y < mejor.y || (y === mejor.y && x < mejor.x)))
        ) {
          mejor = { x, y, dist }
        }
      }
    }
    if (mejor) return en(mejor.x, mejor.y)
  }
  return aparicion
}

/**
 * Único punto de cambio de día (desmayo hoy, dormir en M7): pasa al día siguiente a la hora de
 * inicio, termina las obras y coloca al personaje (en la casa si existe). No toca dinero,
 * materiales, zonas ni parcelas. El llamador comprueba antes que `dia + 1` sea seguro.
 */
export function empezarDiaSiguiente(estado: EstadoJuego): {
  readonly estado: EstadoJuego
  readonly eventos: readonly ObraTerminada[]
} {
  const r = terminarObras({
    ...estado,
    dia: estado.dia + 1,
    minutoDelDia: CONFIG_TIEMPO.horaInicio,
  })
  return { estado: { ...r.estado, personaje: personajeAlDespertar(r.estado) }, eventos: r.eventos }
}
