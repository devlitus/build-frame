import type { EstadoJuego } from './estado'
import { tiempoDetenido } from './estado'
import { ladoValle } from './mapa'
import {
  cantidadDe,
  esHerramienta,
  esSemilla,
  inventarioValido,
  type Herramienta,
} from './inventario'

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

/** Hecho que anuncia que la herramienta se aceptó (aún sin efecto en el mundo; lo darán M5-03 a M5-06). */
export interface EventoHerramientaUsada {
  readonly tipo: 'herramienta-usada'
  readonly herramienta: Herramienta
  readonly x: number
  readonly y: number
}

export type EventoHerramienta = EventoHerramientaUsada

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
 * M5-02 (energía, en el despachador), M5-03 azada (arar), M5-04 regadera, M5-05 semillas
 * (plantar) y mano (cosechar), M5-06 hacha y pico (talar y picar).
 */
export const EFECTOS_HERRAMIENTA: Readonly<Record<Herramienta, EfectoHerramienta>> = {
  azada: sinEfecto,
  regadera: sinEfecto,
  semillas: sinEfecto,
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
  return undefined
}

/**
 * Despacha el uso de la herramienta activa sobre (x, y) tras validar. Hoy todas se aceptan sin
 * efecto y solo anuncian `herramienta-usada`; cada historia posterior enchufa su efecto en
 * `EFECTOS_HERRAMIENTA`.
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
    estado: r.estado,
    eventos: [
      { tipo: 'herramienta-usada', herramienta: estado.herramienta, x: nx, y: ny },
      ...r.eventos,
    ],
  }
}
