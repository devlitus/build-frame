import type { EstadoJuego } from './estado'
import { tiempoDetenido } from './estado'
import { costeEnergia, energiaValida, gastarEnergia } from './energia'
import { ladoValle } from './mapa'
import { efectoHacha, efectoPico, efectoPlantarPlanton } from './recursos'
import {
  cantidadDe,
  esHerramienta,
  esSemilla,
  inventarioValido,
  type Herramienta,
} from './inventario'
import {
  arar,
  motivoNoArar,
  motivoNoSembrar,
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
  /** Motivos propios de la azada y las semillas (`labranza.ts`); incluye `no-propia`. */
  | ErrorLabranza
  /** El botín desbordaría los materiales (enteros seguros). */
  | 'limite-de-recursos'

/** Hecho que anuncia que la herramienta se aceptó; los efectos en el mundo llegan en sus propios eventos. */
export interface EventoHerramientaUsada {
  readonly tipo: 'herramienta-usada'
  readonly herramienta: Herramienta
  readonly x: number
  readonly y: number
}

/** Un golpe de hacha o pico que aún no acaba con el obstáculo; quedan `restantes` golpes. */
export interface EventoObstaculoGolpeado {
  readonly tipo: 'obstaculo-golpeado'
  readonly obstaculo: 'arbol' | 'roca' | 'planton'
  readonly x: number
  readonly y: number
  readonly restantes: number
}

/** El obstáculo de (x, y) se quitó y dio `madera`, `piedra` y `plantones` (los que cupieron en el inventario). */
export interface EventoObstaculoQuitado {
  readonly tipo: 'obstaculo-quitado'
  readonly obstaculo: 'arbol' | 'roca' | 'planton'
  readonly x: number
  readonly y: number
  readonly madera: number
  readonly piedra: number
  readonly plantones: number
}

/** Se plantó un plantón de árbol en (x, y). */
export interface EventoPlantonPlantado {
  readonly tipo: 'planton-plantado'
  readonly x: number
  readonly y: number
}

/** Talar dejó un plantón pero no cupo en el inventario: se perdió (la madera sí se dio). */
export interface EventoPlantonPerdido {
  readonly tipo: 'planton-perdido'
  readonly x: number
  readonly y: number
}

export type EventoHerramienta =
  | EventoHerramientaUsada
  | EventoTierraArada
  | EventoPlantaSembrada
  | EventoObstaculoGolpeado
  | EventoObstaculoQuitado
  | EventoPlantonPlantado
  | EventoPlantonPerdido

export type ResultadoEfecto =
  | {
      readonly ok: true
      readonly estado: EstadoJuego
      readonly eventos: readonly EventoHerramienta[]
    }
  | { readonly ok: false; readonly error: ErrorUsoHerramienta }

/**
 * Efecto de una herramienta sobre la casilla (x, y). `comprobar` dice, sin aplicar nada, por qué
 * el efecto se rechazaría (`undefined` si no): se consulta tras las comprobaciones comunes y antes
 * de la energía. `aplicar` solo se llama con `comprobar` en `undefined`; es una función pura que
 * devuelve el estado nuevo y los eventos propios (sin gastar energía: eso lo hace `usarHerramienta`).
 */
export interface EfectoHerramienta {
  readonly comprobar: (estado: EstadoJuego, x: number, y: number) => ErrorUsoHerramienta | undefined
  readonly aplicar: (estado: EstadoJuego, x: number, y: number) => ResultadoEfecto
}

/** Efecto vacío: la herramienta se acepta pero no hace nada (hasta que su historia lo implemente). */
const sinEfecto: EfectoHerramienta = {
  comprobar: () => undefined,
  aplicar: (estado) => ({ ok: true, estado, eventos: [] }),
}

/**
 * Prueba los efectos en orden y se queda con el primero que cambia algo (estado o eventos); si
 * ninguno lo hace, la herramienta no hace nada. Un rechazo corta la cadena.
 */
export function encadenar(...efectos: readonly EfectoHerramienta[]): EfectoHerramienta {
  return {
    comprobar: (estado, x, y) => {
      for (const efecto of efectos) {
        const motivo = efecto.comprobar(estado, x, y)
        if (motivo) return motivo
      }
      return undefined
    },
    aplicar: (estado, x, y) => {
      for (const efecto of efectos) {
        const r = efecto.aplicar(estado, x, y)
        if (!r.ok || r.estado !== estado || r.eventos.length > 0) return r
      }
      return { ok: true, estado, eventos: [] }
    },
  }
}

/**
 * PUNTO DE ENGANCHE de los efectos de las herramientas. Cada historia sustituye aquí su entrada:
 * M5-03 azada (arar) y semillas (plantar) ya están; faltan M5-04 regadera, M5-05 mano
 * (cosechar) y M5-06 hacha y pico (talar y picar).
 */
export const EFECTOS_HERRAMIENTA: Readonly<Record<Herramienta, EfectoHerramienta>> = {
  azada: { comprobar: motivoNoArar, aplicar: arar },
  regadera: sinEfecto,
  semillas: { comprobar: motivoNoSembrar, aplicar: plantar },
  // Mano: cosechar tiene prioridad (M5-05 lo antepondrá aquí) y, si no hay nada que cosechar,
  // planta un plantón del inventario (M5-06).
  mano: encadenar(efectoPlantarPlanton),
  hacha: efectoHacha,
  pico: efectoPico,
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
  // Orden: comunes, motivo propio del efecto y, la última, la energía; un rechazo nunca gasta.
  const motivo = EFECTOS_HERRAMIENTA[estado.herramienta].comprobar(estado, x, y)
  if (motivo) return motivo
  if (estado.energia < costeEnergia(estado.herramienta)) return 'sin-energia'
  return undefined
}

/**
 * Despacha el uso de la herramienta activa sobre (x, y) tras validar (incluida la energía). Un uso
 * aceptado gasta el coste de la herramienta aunque su efecto esté vacío; un rechazo (de cualquier motivo) deja el estado intacto. Cada historia posterior enchufa
 * su efecto en `EFECTOS_HERRAMIENTA`.
 */
export function usarHerramienta(estado: EstadoJuego, x: number, y: number): ResultadoEfecto {
  const error = comprobarUsarHerramienta(estado, x, y)
  if (error) return { ok: false, error }
  const nx = x + 0 // -0 se normaliza a 0 antes de que ningún efecto lo copie a eventos o estado
  const ny = y + 0
  const r = EFECTOS_HERRAMIENTA[estado.herramienta].aplicar(estado, nx, ny)
  if (!r.ok) return r
  return {
    ok: true,
    estado: gastarEnergia(r.estado, costeEnergia(estado.herramienta)),
    eventos: [
      { tipo: 'herramienta-usada', herramienta: estado.herramienta, x: nx, y: ny },
      ...r.eventos,
    ],
  }
}
