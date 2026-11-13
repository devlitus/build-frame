import type { GeometriaValle, VistaCamara } from './picking'

/** Dirección de una flecha del teclado sobre la cuadrícula de parcelas. */
export type DireccionParcela = 'arriba' | 'abajo' | 'izquierda' | 'derecha'

/**
 * Parcela vecina en la dirección dada (índice = fila * lado + columna). En el borde del valle no
 * hay vecina: se devuelve la misma parcela (la selección no sale ni da la vuelta).
 */
export function parcelaVecina(
  parcelasPorLado: number,
  indice: number,
  direccion: DireccionParcela,
): number {
  const n = parcelasPorLado
  const fila = Math.floor(indice / n)
  const columna = indice % n
  const dc = direccion === 'derecha' ? 1 : direccion === 'izquierda' ? -1 : 0
  const df = direccion === 'abajo' ? 1 : direccion === 'arriba' ? -1 : 0
  const f = fila + df
  const c = columna + dc
  if (f < 0 || c < 0 || f >= n || c >= n) return indice
  return f * n + c
}

/**
 * Parcela que está en el centro de la vista. Si el centro cae fuera del valle (cámara en una
 * esquina o muy alejada), se toma la parcela más cercana: la del borde.
 */
export function parcelaEnCentroDeVista(g: GeometriaValle, vista: VistaCamara): number {
  const n = g.parcelasPorLado
  const limitar = (v: number) => {
    const k = Number.isFinite(v) ? Math.floor(v / g.ladoParcelaPx) : 0
    return Math.min(n - 1, Math.max(0, k))
  }
  return limitar(vista.cy) * n + limitar(vista.cx)
}
