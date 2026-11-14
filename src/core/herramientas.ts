import type { EstadoJuego } from './estado'
import { tiempoDetenido } from './estado'
import { costeEnergia, energiaValida, gastarEnergia } from './energia'
import { ladoValle } from './mapa'
import {
  cantidadDe,
  esHerramienta,
  esSemilla,
  inventarioValido,
  type Herramienta,
} from './inventario'
import {
  arar,
  plantar,
  type ErrorLabranza,
  type EventoPlantaSembrada,
  type EventoTierraArada,
} from './labranza'

/** Motivos por los que `UsarHerramienta` se rechaza (los textos están en `src/ui/textos/es.json`). */
export type ErrorUsoHerramienta =
  | 'parametro-invalido'
  | 'estado-invalido'
  /** Las herramientas solo se usan en el Modo Vida. */
  | 'solo-en-vida'
  /** El reloj está en pausa (pausa del jugador): como el personaje, las herramientas esperan. */
  | 'en-pausa'
  /** La casilla no es la del personaje ni una de sus 8 vecinas. */
  | 'fuera-de-alcance'
  | 'fuera-del-valle'
  /** «Semillas» sin ninguna semilla elegida. */
  | 'sin-semilla-elegida'
  /** «Semillas» con una semilla elegida que ya no queda en el inventario. */
  | 'sin-semillas'
  /** No queda energía para el coste de la herramienta (nunca bloquea moverse ni cambiar de modo). */
  | 'sin-energia'
  /** Motivos propios de la azada y las semillas (`labranza.ts`). */
  | ErrorLabranza

/** Hecho que anuncia que la herramienta se aceptó (el efecto concreto llega con sus propios eventos). */
export interface EventoHerramientaUsada {
  readonly tipo: 'herramienta-usada'
  readonly herramienta: Herramienta
  readonly x: number
  readonly y: number
}

export type EventoHerramienta = EventoHerramientaUsada | EventoTierraArada | EventoPlantaSembrada

export type ResultadoEfecto =
  | {
      readonly ok: true
      readonly estado: EstadoJuego
      readonly eventos: readonly EventoHerramienta[]
    }
  | { readonly ok: false; readonly error: ErrorUsoHerramienta }

/**
 * Efecto de una herramienta sobre la casilla (x, y), que ya pasó `comprobarUsarHerramienta`
 * (modo Vida, alcance y semilla elegida). Función pura: devuelve el estado nuevo y los eventos
 * propios, o el motivo del rechazo (el estado no cambia).
 */
export type EfectoHerramienta = (estado: EstadoJuego, x: number, y: number) => ResultadoEfecto

/** Efecto vacío: la herramienta se acepta pero no hace nada (hasta que su historia lo implemente). */
const sinEfecto: EfectoHerramienta = (estado) => ({ ok: true, estado, eventos: [] })

/**
 * PUNTO DE ENGANCHE de los efectos de las herramientas. Cada historia sustituye aquí su entrada:
 * M5-03 azada (arar) y semillas (plantar) ya están; faltan M5-04 regadera, M5-05 mano
 * (cosechar) y M5-06 hacha y pico (talar y picar).
 */
export const EFECTOS_HERRAMIENTA: Readonly<Record<Herramienta, EfectoHerramienta>> = {
  azada: arar,
  regadera: sinEfecto,
  semillas: plantar,
  mano: sinEfecto,
  hacha: sinEfecto,
  pico: sinEfecto,
}

/** ¿Está la casilla (x, y) en la del personaje o en una de sus 8 vecinas? (distancia de Chebyshev ≤ 1) */
export function casillaAlAlcance(
  p: Pick<EstadoJuego['personaje'], 'x' | 'y'>,
  x: number,
  y: number,
): boolean {
  return Math.max(Math.abs(x - Math.floor(p.x)), Math.abs(y - Math.floor(p.y))) <= 1
}

const entero = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)

/**
 * Todas las comprobaciones de `UsarHerramienta`, en su orden y sin aplicar nada: `undefined` si
 * se puede usar o el motivo del rechazo. La interfaz usa esta misma función para no mentir.
 */
export function comprobarUsarHerramienta(
  estado: EstadoJuego,
  x: unknown,
  y: unknown,
): ErrorUsoHerramienta | undefined {
  if (!entero(x) || !entero(y)) return 'parametro-invalido'
  if (estado.modo !== 'vida') return 'solo-en-vida'
  const p = estado.personaje
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !esHerramienta(estado.herramienta)) {
    return 'estado-invalido'
  }
  if (tiempoDetenido(estado)) return 'en-pausa'
  const lado = ladoValle(estado.valle)
  if (x < 0 || y < 0 || x >= lado || y >= lado) return 'fuera-del-valle'
  if (!casillaAlAlcance(p, x, y)) return 'fuera-de-alcance'
  if (!energiaValida(estado.energia)) return 'estado-invalido'
  if (estado.herramienta === 'semillas') {
    if (estado.semillaElegida === null) return 'sin-semilla-elegida'
    if (!inventarioValido(estado.inventario)) return 'estado-invalido'
    if (
      !esSemilla(estado.semillaElegida) ||
      cantidadDe(estado.inventario, estado.semillaElegida) < 1
    ) {
      return 'sin-semillas'
    }
  }
  // La energía se mira la última: cualquier otro rechazo gana y nunca gasta.
  if (estado.energia < costeEnergia(estado.herramienta)) return 'sin-energia'
  return undefined
}

/**
 * Despacha el uso de la herramienta activa sobre (x, y) tras validar (incluida la energía). Un uso
 * aceptado gasta el coste de la herramienta aunque su efecto esté vacío o no llegue a talar del
 * todo; un rechazo (de cualquier motivo) deja el estado intacto. Cada historia posterior enchufa
 * su efecto en `EFECTOS_HERRAMIENTA`.
 */
export function usarHerramienta(estado: EstadoJuego, x: number, y: number): ResultadoEfecto {
  const error = comprobarUsarHerramienta(estado, x, y)
  if (error) return { ok: false, error }
  const r = EFECTOS_HERRAMIENTA[estado.herramienta](estado, x, y)
  if (!r.ok) return r
  const nx = x + 0 // -0 se normaliza a 0
  const ny = y + 0
  return {
    ok: true,
    estado: gastarEnergia(r.estado, costeEnergia(estado.herramienta)),
    eventos: [
      { tipo: 'herramienta-usada', herramienta: estado.herramienta, x: nx, y: ny },
      ...r.eventos,
    ],
  }
}
