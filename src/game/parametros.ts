import { CONFIG_TIEMPO, type ModoJuego } from '../core'

export interface ParametrosUrl {
  /** Semilla fijada con `?semilla=N`; si no, se genera una nueva. */
  readonly semilla?: number
  readonly debug: boolean
  /**
   * Modo con el que empieza la partida (`?modo=plano`). Vale siempre, sin `debug`: es un modo
   * legítimo del juego y no da ventaja. Empieza en Plano con la vista centrada en el valle.
   */
  readonly modo?: ModoJuego
  /** Índices de parcela a marcar como propias; solo con `debug`. */
  readonly propias: readonly number[]
  /** Solo con `debug`: dónde empieza el personaje (`?debug&en=vado`). */
  readonly en?: 'vado'
  /** Solo con `debug`: multiplicador del tiempo de juego para pruebas (`?debug&acelerar=200`). */
  readonly acelerar?: number
  /** Solo con `debug`: minuto del día con el que empieza (`?debug&hora=22:00`; 02:00 es 1560). */
  readonly hora?: number
}

/** Máximo de `?acelerar`: más allá no aporta nada y solo agranda los saltos de reloj. */
export const ACELERAR_MAXIMO = 2000

/**
 * `HH:MM` a minuto del día del juego (la madrugada 00:00-02:00 cuenta como 24:00-26:00).
 * Fuera de la jornada (06:00 a 02:00) devuelve undefined.
 */
export function minutoDeHora(texto: string | null): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec((texto ?? '').trim())
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  const minuto = (h < 6 ? h + 24 : h) * 60 + min
  return minuto >= CONFIG_TIEMPO.horaInicio && minuto <= CONFIG_TIEMPO.horaFin ? minuto : undefined
}

function entero(texto: string | null): number | undefined {
  if (texto === null || !/^\d+$/.test(texto.trim())) return undefined
  const n = Number(texto)
  return Number.isSafeInteger(n) ? n : undefined
}

/** Semilla válida: entero de 0 a 2^32 − 1; fuera de rango se ignora (no se reduce). */
function semillaUint32(texto: string | null): number | undefined {
  const n = entero(texto)
  return n !== undefined && n <= 0xffffffff ? n : undefined
}

/** Interpreta `?semilla=123&debug&propias=0,1,7`. Ignora lo inválido. */
export function leerParametros(busqueda: string): ParametrosUrl {
  const q = new URLSearchParams(busqueda)
  const semilla = semillaUint32(q.get('semilla'))
  // `?debug` se activa con cualquier valor (incluso vacío) salvo 0, false, off o no (sin distinguir mayúsculas).
  const valorDebug = q.get('debug')?.trim().toLowerCase()
  const debug = valorDebug !== undefined && !['0', 'false', 'off', 'no'].includes(valorDebug)
  const propias = debug
    ? [
        ...new Set(
          (q.get('propias') ?? '')
            .split(',')
            .map((s) => entero(s))
            .filter((n): n is number => n !== undefined),
        ),
      ]
    : []
  const en = debug && q.get('en')?.trim().toLowerCase() === 'vado' ? ('vado' as const) : undefined
  const modo: ModoJuego | undefined =
    q.get('modo')?.trim().toLowerCase() === 'plano' ? 'plano' : undefined
  const acelerar = debug ? entero(q.get('acelerar')) : undefined
  const hora = debug ? minutoDeHora(q.get('hora')) : undefined
  return {
    ...(semilla === undefined ? {} : { semilla }),
    debug,
    ...(modo === undefined ? {} : { modo }),
    propias,
    ...(en === undefined ? {} : { en }),
    ...(acelerar === undefined || acelerar < 1
      ? {}
      : { acelerar: Math.min(acelerar, ACELERAR_MAXIMO) }),
    ...(hora === undefined ? {} : { hora }),
  }
}

/** Semilla nueva; vive en la capa de juego, nunca en `core/` (ADR 0004). */
export function semillaNueva(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
}
