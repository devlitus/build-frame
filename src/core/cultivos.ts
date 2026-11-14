import { CULTIVOS } from './datos/claves'
import { CONFIG_CULTIVOS } from './datos/cultivos'
import type { DefCultivo } from './datos/esquemas'
import { CONFIG_TIEMPO } from './datos/tiempo'
import type { EstadoJuego } from './estado'
import { fechaDe } from './tiempo'
import type { ObjetoId } from './inventario'

export { CULTIVOS }
export type Cultivo = (typeof CULTIVOS)[number]

export const esCultivo = (c: unknown): c is Cultivo =>
  typeof c === 'string' && (CULTIVOS as readonly string[]).includes(c)

/** Definición del cultivo en `data/cultivos.json`, o `undefined` si no existe. */
export function defCultivo(cultivo: unknown): DefCultivo | undefined {
  return esCultivo(cultivo) ? CONFIG_CULTIVOS.cultivos[cultivo] : undefined
}

/** Id del objeto «semilla» de un cultivo (`semilla-<cultivo>`). */
export const semillaDe = (cultivo: Cultivo): ObjetoId => `semilla-${cultivo}`

/** Cultivo al que pertenece una semilla (`semilla-<cultivo>`), o `undefined` si no lo es. */
export function cultivoDeSemilla(objeto: unknown): Cultivo | undefined {
  if (typeof objeto !== 'string' || !objeto.startsWith('semilla-')) return undefined
  const c = objeto.slice('semilla-'.length)
  return esCultivo(c) ? c : undefined
}

/** Días de crecimiento hasta madurar (suma de los días de las fases 0 a 2). */
export function diasHastaMadurar(def: Pick<DefCultivo, 'diasPorFase'>): number {
  return def.diasPorFase.reduce((a, b) => a + b, 0)
}

/**
 * Fase de arte de una planta con `dias` días de crecimiento: 0 sembrado, 1 brote, 2 joven y
 * 3 maduro. Cada fase dura `diasPorFase[fase]` días; con todos cumplidos, está madura.
 */
export function faseDe(def: Pick<DefCultivo, 'diasPorFase'>, dias: number): 0 | 1 | 2 | 3 {
  let resto = Math.max(0, dias)
  for (let f = 0; f < def.diasPorFase.length; f++) {
    resto -= def.diasPorFase[f] ?? 0
    if (resto < 0) return f as 0 | 1 | 2
  }
  return 3
}

/** ¿Se puede sembrar el cultivo en la estación en que está el día del estado? */
export function cultivoDeEstacion(cultivo: Cultivo, estado: Pick<EstadoJuego, 'dia'>): boolean {
  const def = CONFIG_CULTIVOS.cultivos[cultivo]
  const estacion = fechaDe(estado, CONFIG_TIEMPO).estacion
  return def.estaciones.some((e) => e === estacion)
}
