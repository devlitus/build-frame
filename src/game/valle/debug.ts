import type { Valle } from '../../core'

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
