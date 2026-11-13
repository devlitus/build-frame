import { ZONAS } from './datos/claves'
import type { EstadoJuego } from './estado'
import { ladoValle } from './mapa'
import { casillasRio } from './rio'

export { ZONAS }
export type Zona = (typeof ZONAS)[number]

/** Un carácter por casilla en `EstadoJuego.zonas`: `.` sin zona; el resto, inicial de la zona. */
export const CARACTER_SIN_ZONA = '.'
export const CARACTER_ZONA: Readonly<Record<Zona, string>> = {
  cultivo: 'c',
  huerto: 'h',
  vivienda: 'v',
  almacen: 'a',
}

/** Cadena de zonas vacía para un valle de `lado` casillas por lado. */
export function zonasVacias(lado: number): string {
  return CARACTER_SIN_ZONA.repeat(lado * lado)
}

/** Zona de la casilla global (x, y), o `undefined` si no tiene o está fuera del valle. */
export function zonaEn(
  estado: Pick<EstadoJuego, 'zonas' | 'valle'>,
  x: number,
  y: number,
): Zona | undefined {
  const lado = ladoValle(estado.valle)
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= lado || y >= lado) {
    return undefined
  }
  const c = estado.zonas[y * lado + x]
  return ZONAS.find((z) => CARACTER_ZONA[z] === c)
}

/**
 * Punto único para saber si una casilla está ocupada por un edificio u obra.
 * TODO(M4-02): rellenar cuando existan los edificios; `PintarZona` y `BorrarZona`
 * no cambian casillas ocupadas.
 */
export function casillaConEdificio(
  estado: Pick<EstadoJuego, 'valle'>,
  x: number,
  y: number,
): boolean {
  void [estado, x, y]
  return false
}

export type ResultadoZonas =
  | { readonly ok: true; readonly zonas: string; readonly cambiadas: number }
  | { readonly ok: false; readonly error: 'parametro-invalido' | 'sin-casillas-validas' }

/**
 * Aplica `caracter` a las casillas válidas del rectángulo (esquinas inclusivas, en cualquier
 * orden, recortado al valle). Válida = en parcela propia, no es río (vados incluidos) y sin
 * edificio. Árboles y rocas no impiden pintar. Pura.
 */
export function aplicarZonas(
  estado: Pick<EstadoJuego, 'zonas' | 'valle' | 'cauce'>,
  rect: { x0: number; y0: number; x1: number; y1: number },
  caracter: string,
): ResultadoZonas {
  const { x0, y0, x1, y1 } = rect
  if (![x0, y0, x1, y1].every((n) => Number.isSafeInteger(n))) {
    return { ok: false, error: 'parametro-invalido' }
  }
  const { valle } = estado
  const lado = ladoValle(valle)
  const c = valle.casillasPorParcela
  const xa = Math.max(0, Math.min(x0, x1))
  const xb = Math.min(lado - 1, Math.max(x0, x1))
  const ya = Math.max(0, Math.min(y0, y1))
  const yb = Math.min(lado - 1, Math.max(y0, y1))
  const agua = new Set(casillasRio(valle, estado.cauce.ancho).map((k) => k.y * lado + k.x))
  const celdas = estado.zonas.split('')
  let validas = 0
  let cambiadas = 0
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const p = valle.parcelas[Math.floor(y / c) * valle.parcelasPorLado + Math.floor(x / c)]
      if (p?.estado !== 'propia' || agua.has(y * lado + x) || casillaConEdificio(estado, x, y)) {
        continue
      }
      validas++
      const i = y * lado + x
      if (celdas[i] !== caracter) {
        celdas[i] = caracter
        cambiadas++
      }
    }
  }
  if (validas === 0) return { ok: false, error: 'sin-casillas-validas' }
  return { ok: true, zonas: cambiadas === 0 ? estado.zonas : celdas.join(''), cambiadas }
}
