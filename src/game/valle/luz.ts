import { MINUTOS_POR_DIA } from '../../core'
import { PUNTOS_LUZ, type PuntoLuz } from './estilo'

export interface Luz {
  readonly color: number
  /** Opacidad del tinte, 0 (pleno día) a 1. */
  readonly alfa: number
}

function mezclar(a: number, b: number, k: number): number {
  const canal = (c: number, desp: number) => (c >> desp) & 0xff
  const mezcla = (desp: number) =>
    Math.round(canal(a, desp) + (canal(b, desp) - canal(a, desp)) * k)
  return (mezcla(16) << 16) | (mezcla(8) << 8) | mezcla(0)
}

/**
 * Tinte del valle según el minuto del día (el reloj puede pasar de 1440 en la madrugada: se
 * reduce). Función pura; los puntos de control están en `estilo.ts`.
 */
export function luzDelMinuto(minutoDelDia: number, puntos: readonly PuntoLuz[] = PUNTOS_LUZ): Luz {
  const bruto = Number.isFinite(minutoDelDia) ? minutoDelDia : 0
  const m = ((bruto % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA
  let previo = puntos[0]
  for (const siguiente of puntos) {
    if (!previo) break
    if (m <= siguiente.minuto) {
      const span = siguiente.minuto - previo.minuto
      const k = span > 0 ? (m - previo.minuto) / span : 1
      return {
        color: mezclar(previo.color, siguiente.color, k),
        alfa: previo.alfa + (siguiente.alfa - previo.alfa) * k,
      }
    }
    previo = siguiente
  }
  return previo ? { color: previo.color, alfa: previo.alfa } : { color: 0xffffff, alfa: 0 }
}
