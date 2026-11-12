import type { ComprabilidadParcela, Fertilidad, Terreno, Agua } from '../core'
import type { ErrorComando } from '../core'
import { formatearDinero } from './formatoDinero'
import es from './textos/es.json'
import { t, tp, type ClaveTexto } from './textos'

/** Nombre amable de una parcela: columna en letras (A, B...) y fila en números desde 1: «B3». */
export function nombreParcela(fila: number, columna: number): string {
  // Más de 26 columnas no hay; si las hubiera se sigue con AA, AB...
  let letras = ''
  let c = columna
  do {
    letras = String.fromCharCode(65 + (c % 26)) + letras
    c = Math.floor(c / 26) - 1
  } while (c >= 0)
  return `${letras}${fila + 1}`
}

/** Símbolos decorativos (siempre acompañados de texto, para no depender solo del icono ni del color). */
export const SIMBOLO_TERRENO: Readonly<Record<Terreno, string>> = {
  prado: '🌿',
  bosque: '🌲',
  rocoso: '⛰️',
}
export const SIMBOLO_AGUA: Readonly<Record<Agua, string>> = {
  rio: '🌊',
  pozo: '💧',
  seca: '☀️',
}
/** Medidor de fertilidad en puntos (●●○): también se lee sin color. */
export const SIMBOLO_FERTILIDAD: Readonly<Record<Fertilidad, string>> = {
  baja: '●○○',
  media: '●●○',
  alta: '●●●',
}

export function textoTerreno(v: Terreno): string {
  return t(`terreno_${v}` as ClaveTexto)
}
export function textoFertilidad(v: Fertilidad): string {
  return t(`fertilidad_${v}` as ClaveTexto)
}
export function textoAgua(v: Agua): string {
  return t(`agua_${v}` as ClaveTexto)
}

export function textoPrecio(precio: number): string {
  return tp(precio === 1 ? 'precioMoneda' : 'precioMonedas', { n: formatearDinero(precio) })
}

/** Motivo, en texto, de que el núcleo rechazara `ComprarParcela`. */
export function textoErrorCompra(error: ErrorComando): string {
  const clave = `errorCompra_${error}`
  return clave in es ? t(clave as ClaveTexto) : t('errorCompra_otro')
}

export type TonoCompra = 'ok' | 'no' | 'propia'

/** Estado de compra para el panel: texto del motivo (de `parcelaComprable`) y un tono para el símbolo. */
export function estadoDeCompra(
  c: ComprabilidadParcela,
  dinero: number,
): { texto: string; tono: TonoCompra } {
  if (c.comprable) return { texto: t('compraSePuede'), tono: 'ok' }
  switch (c.motivo) {
    case 'ya-propia':
      return { texto: t('compraPropia'), tono: 'propia' }
    case 'no-adyacente':
      return { texto: t('compraNoAdyacente'), tono: 'no' }
    case 'fondos-insuficientes': {
      const faltan = Math.max(0, Math.ceil((c.precio ?? 0) - dinero))
      return { texto: tp('compraFondos', { n: formatearDinero(faltan) }), tono: 'no' }
    }
    default:
      return { texto: t('compraNoDisponible'), tono: 'no' }
  }
}
