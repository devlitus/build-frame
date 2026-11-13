import { MATERIALES, TIPOS_EDIFICIO } from './datos/claves'
import { CONFIG_EDIFICIOS } from './datos/edificios'
import type { DefEdificio } from './datos/esquemas'

export { MATERIALES, TIPOS_EDIFICIO }
export type TipoEdificio = (typeof TIPOS_EDIFICIO)[number]
export type Material = (typeof MATERIALES)[number]

/** Materiales de construcción en poder del jugador (enteros ≥ 0). */
export type Materiales = Readonly<Record<Material, number>>

/** Obra en curso: días de partida de inicio y de fin (M4-03 la hará avanzar). */
export interface Obra {
  readonly diaInicio: number
  readonly diaFin: number
}

/**
 * Edificio colocado. `(x, y)` es la esquina superior izquierda de la huella (casillas globales).
 * `obra` es la obra mientras se construye y `null` cuando está terminado.
 */
export interface Edificio {
  readonly id: number
  readonly tipo: TipoEdificio
  readonly x: number
  readonly y: number
  readonly obra: Obra | null
}

/** Definición del catálogo para `tipo`, o `undefined` si no existe (incluye claves heredadas como `constructor`). */
export function defEdificio(tipo: unknown): DefEdificio | undefined {
  return typeof tipo === 'string' && (TIPOS_EDIFICIO as readonly string[]).includes(tipo)
    ? CONFIG_EDIFICIOS.edificios[tipo as TipoEdificio]
    : undefined
}

/** Rectángulo de casillas que cubre un edificio con esquina `(x, y)`; ambos extremos inclusivos. */
export function huellaDe(
  def: Pick<DefEdificio, 'ancho' | 'alto'>,
  x: number,
  y: number,
): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: x, y0: y, x1: x + def.ancho - 1, y1: y + def.alto - 1 }
}

const cacheOcupadas = new WeakMap<readonly Edificio[], Map<number, ReadonlyMap<number, number>>>()

/**
 * Casillas ocupadas por edificios y obras: índice `y*lado+x` → id del edificio. Memoizado por
 * referencia de la lista (puro); descarta casillas fuera del valle y tipos desconocidos.
 */
export function casillasOcupadas(
  edificios: readonly Edificio[],
  lado: number,
): ReadonlyMap<number, number> {
  let porLado = cacheOcupadas.get(edificios)
  if (!porLado) cacheOcupadas.set(edificios, (porLado = new Map()))
  let mapa = porLado.get(lado)
  if (!mapa) {
    const nuevo = new Map<number, number>()
    for (const e of edificios) {
      const def = defEdificio(e.tipo)
      if (!def) continue
      const h = huellaDe(def, e.x, e.y)
      for (let y = Math.max(h.y0, 0); y <= Math.min(h.y1, lado - 1); y++) {
        for (let x = Math.max(h.x0, 0); x <= Math.min(h.x1, lado - 1); x++) {
          nuevo.set(y * lado + x, e.id)
        }
      }
    }
    porLado.set(lado, (mapa = nuevo))
  }
  return mapa
}
