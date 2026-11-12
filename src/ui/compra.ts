import type { Partida } from '../game/partida'
import { textoErrorCompra } from './parcelaTextos'

/**
 * Ventana (ms) tras abrir la confirmación de compra o tras comprar en la que se ignora el
 * segundo toque de un doble toque o doble clic: caería sobre el botón que acaba de aparecer o,
 * tras comprar, sobre el lienzo (y seleccionaría otra parcela).
 */
export const MS_VENTANA_ANTIDOBLE = 400

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
