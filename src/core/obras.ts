import { CONFIG_PERSONAJE } from './datos/personaje'
import { CONFIG_TIEMPO } from './datos/tiempo'
import { defEdificio, huellaDe, type Edificio, type Obra, type TipoEdificio } from './edificios'
import { energiaAlEmpezarDia, type MotivoCambioDeDia } from './energia'
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
 * Días que le quedan a una obra el día `dia`: `diaFin - dia`, nunca negativo (una obra vencida
 * se termina al empezar el día, así que mientras se ve en obra siempre queda al menos 1).
 */
export function diasRestantes(obra: Obra, dia: number): number {
  return Math.max(0, obra.diaFin - dia)
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
  const edificios = estado.edificios.map((e) =>
    e.obra !== null && e.obra.diaFin <= estado.dia ? { ...e, obra: null } : e,
  )
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
 * ¿Despierta el personaje junto a su casa? Es lo que decide `personajeAlDespertar`: hay una casa
 * terminada (despierta en su puerta o, si está bloqueada, en la casilla libre más cercana) y no
 * en la aparición.
 */
export function despiertaEnCasa(estado: EstadoJuego): boolean {
  const p = personajeAlDespertar(estado)
  const a = personajeEnAparicion(estado.aparicion)
  return p.x !== a.x || p.y !== a.y
}

/** La casa terminada de menor id (la que hace de hogar), si hay alguna. */
export function casaTerminada(estado: EstadoJuego): Edificio | undefined {
  return estado.edificios
    .filter((e) => e.tipo === 'casa' && e.obra === null)
    .sort((a, b) => a.id - b.id)[0]
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
  const casa = casaTerminada(estado)
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
  // Defensa en profundidad: nunca más allá del valle, pase lo que pase con x, y.
  for (let d = 1; d <= mapa.lado; d++) {
    let mejor = null as { x: number; y: number; dist: number } | null
    const probar = (x: number, y: number): void => {
      if (!casillaLibre(mapa, x, y)) return
      const dist = (x - puerta.x) ** 2 + (y - puerta.y) ** 2
      if (
        !mejor ||
        dist < mejor.dist ||
        (dist === mejor.dist && (y < mejor.y || (y === mejor.y && x < mejor.x)))
      ) {
        mejor = { x, y, dist }
      }
    }
    // Solo el perímetro del anillo a distancia exacta d, recortado al valle.
    const xa = Math.max(h.x0 - d, 0)
    const xb = Math.min(h.x1 + d, mapa.lado - 1)
    for (let y = Math.max(h.y0 - d, 0); y <= Math.min(h.y1 + d, mapa.lado - 1); y++) {
      if (y === h.y0 - d || y === h.y1 + d) {
        for (let x = xa; x <= xb; x++) probar(x, y)
      } else {
        if (h.x0 - d >= 0) probar(h.x0 - d, y)
        if (h.x1 + d <= mapa.lado - 1) probar(h.x1 + d, y)
      }
    }
    if (mejor) return en(mejor.x, mejor.y)
  }
  return aparicion
}

/**
 * Único punto de cambio de día (desmayo y dormir; M5-04 enganchará aquí el crecimiento): pasa al
 * día siguiente a la hora de inicio, termina las obras, repone la energía según el `motivo`
 * (dormir: al máximo; desmayo: la fracción de `data/energia.json`) y coloca al personaje (en la
 * casa si existe). No toca dinero, materiales, zonas ni parcelas. El llamador debe haber
 * comprobado antes que `dia + 1` es un entero seguro y que `edificiosValidos(estado.edificios)`.
 */
export function empezarDiaSiguiente(
  estado: EstadoJuego,
  motivo: MotivoCambioDeDia,
): {
  readonly estado: EstadoJuego
  readonly eventos: readonly ObraTerminada[]
} {
  const r = terminarObras({
    ...estado,
    dia: estado.dia + 1,
    minutoDelDia: CONFIG_TIEMPO.horaInicio,
    energia: energiaAlEmpezarDia(motivo),
  })
  return { estado: { ...r.estado, personaje: personajeAlDespertar(r.estado) }, eventos: r.eventos }
}
