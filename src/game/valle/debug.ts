import type { EstadoJuego, Valle } from '../../core'

/**
 * Copia del valle con las parcelas indicadas como propias, SOLO para dibujar la
 * vista de depuración (la compra real llega en M3 como comando del núcleo).
 * Ignora índices fuera de rango.
 */
export function marcarPropias(valle: Valle, indices: readonly number[]): Valle {
  const propias = new Set(indices)
  return {
    ...valle,
    parcelas: valle.parcelas.map((p, i) =>
      propias.has(i) ? { ...p, estado: 'propia' as const } : p,
    ),
  }
}

/**
 * SOLO PARA DEPURACIÓN (`?debug&propias=`): copia del estado con esas parcelas como propias y
 * `comprasHechas` igual al número de propias, para que el panel, el precio y la adyacencia
 * coincidan con lo que se dibuja. No es un comando del núcleo ni pasa por la economía.
 */
export function conPropiasDeDepuracion(
  estado: EstadoJuego,
  indices: readonly number[],
): EstadoJuego {
  const valle = marcarPropias(estado.valle, indices)
  const comprasHechas = valle.parcelas.filter((p) => p.estado === 'propia').length
  return { ...estado, valle, comprasHechas }
}
