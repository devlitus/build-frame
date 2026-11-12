export interface ParametrosUrl {
  /** Semilla fijada con `?semilla=N`; si no, se genera una nueva. */
  readonly semilla?: number
  readonly debug: boolean
  /** Índices de parcela a marcar como propias; solo con `debug`. */
  readonly propias: readonly number[]
  /** Solo con `debug`: dónde empieza el personaje (`?debug&en=vado`). */
  readonly en?: 'vado'
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
  return {
    ...(semilla === undefined ? {} : { semilla }),
    debug,
    propias,
    ...(en === undefined ? {} : { en }),
  }
}

/** Semilla nueva; vive en la capa de juego, nunca en `core/` (ADR 0004). */
export function semillaNueva(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
}
