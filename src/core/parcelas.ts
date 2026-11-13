import { precioParcela } from './economia'
import type { EstadoJuego } from './estado'

export type MotivoNoComprable =
  'parametro-invalido' | 'ya-propia' | 'no-adyacente' | 'fondos-insuficientes' | 'precio-invalido'

export type ComprabilidadParcela =
  | { readonly comprable: true; readonly precio: number }
  | { readonly comprable: false; readonly motivo: MotivoNoComprable; readonly precio?: number }

/**
 * Única fuente de las reglas de compra de parcelas (GDD §6.2). Pura.
 * Prioridad de motivos cuando hay varios:
 * parametro-invalido > ya-propia > precio-invalido > no-adyacente > fondos-insuficientes.
 * Sin parcelas propias vale cualquier parcela en venta; con propias, solo las 4-adyacentes
 * a alguna propia (la diagonal no cuenta). `precio` se incluye en `no-adyacente` y
 * `fondos-insuficientes` (no en `parametro-invalido`, `ya-propia` ni `precio-invalido`).
 * Si `dinero` no es un entero seguro >= 0 (estado corrupto) cuenta como `fondos-insuficientes`.
 */
export function parcelaComprable(
  estado: Pick<EstadoJuego, 'valle' | 'comprasHechas' | 'dinero'>,
  indice: number,
): ComprabilidadParcela {
  const { valle } = estado
  const parcela = Number.isInteger(indice) ? valle.parcelas[indice] : undefined
  if (typeof indice !== 'number' || parcela === undefined) {
    return { comprable: false, motivo: 'parametro-invalido' }
  }
  if (parcela.estado === 'propia') return { comprable: false, motivo: 'ya-propia' }
  const precio = precioParcela(estado, indice)
  if (precio === undefined) return { comprable: false, motivo: 'precio-invalido' }
  const n = valle.parcelasPorLado
  const propia = (f: number, c: number): boolean =>
    f >= 0 && c >= 0 && f < n && c < n && valle.parcelas[f * n + c]?.estado === 'propia'
  const hayPropias = valle.parcelas.some((p) => p.estado === 'propia')
  const { fila, columna } = parcela
  if (
    hayPropias &&
    !(
      propia(fila - 1, columna) ||
      propia(fila + 1, columna) ||
      propia(fila, columna - 1) ||
      propia(fila, columna + 1)
    )
  ) {
    return { comprable: false, motivo: 'no-adyacente', precio }
  }
  if (!Number.isSafeInteger(estado.dinero) || estado.dinero < precio)
    return { comprable: false, motivo: 'fondos-insuficientes', precio }
  return { comprable: true, precio }
}
