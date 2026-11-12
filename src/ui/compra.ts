import type { Partida } from '../game/partida'
import { textoErrorCompra } from './parcelaTextos'

/** Distancia (px) bajo la cual dos toques o clics cuentan como el mismo sitio (doble toque). */
export const RADIO_MISMO_TOQUE_PX = 48

/**
 * Pide al núcleo comprar la parcela `indice`. Si lo rechaza (p. ej. porque el estado cambió
 * entre mostrar la confirmación y confirmarla) devuelve el motivo en texto y no cambia nada.
 */
export function intentarCompra(
  partida: Partida,
  indice: number,
): { readonly ok: true } | { readonly ok: false; readonly texto: string } {
  const r = partida.emitir({ tipo: 'ComprarParcela', indice })
  return r.ok ? { ok: true } : { ok: false, texto: textoErrorCompra(r.error) }
}
