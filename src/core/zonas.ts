import { ZONAS } from './datos/claves'
import type { EstadoJuego } from './estado'
import { casillasOcupadas, edificiosValidos } from './edificios'
import { ladoValle } from './mapa'
import { casillasRio } from './rio'
import { sinLabrar } from './tierra'

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
 * Punto único para saber si una casilla está ocupada por un edificio u obra;
 * `PintarZona` y `BorrarZona` no cambian casillas ocupadas.
 */
export function casillaConEdificio(
  estado: Pick<EstadoJuego, 'valle' | 'edificios'>,
  x: number,
  y: number,
): boolean {
  const lado = ladoValle(estado.valle)
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= lado || y >= lado) {
    return false
  }
  return casillasOcupadas(estado.edificios, lado).has(y * lado + x)
}

export type ResultadoZonas =
  | {
      readonly ok: true
      readonly zonas: string
      /** `tierra` tras limpiar la arada vacía que deja de ser de cultivo u huerto (la misma cadena si no cambia). */
      readonly tierra: string
      readonly cambiadas: number
    }
  | {
      readonly ok: false
      readonly error: 'parametro-invalido' | 'estado-invalido' | 'sin-casillas-validas'
    }

const cacheAgua = new WeakMap<object, Map<number, ReadonlySet<number>>>()

/** Índices de casillas de río; memoizado por referencia de valle y ancho de cauce (puro). */
export function aguaDe(
  valle: EstadoJuego['valle'],
  ancho: number,
  lado: number,
): ReadonlySet<number> {
  let porAncho = cacheAgua.get(valle)
  if (!porAncho) cacheAgua.set(valle, (porAncho = new Map()))
  let agua = porAncho.get(ancho)
  if (!agua) {
    agua = new Set(casillasRio(valle, ancho).map((k) => k.y * lado + k.x))
    porAncho.set(ancho, agua)
  }
  return agua
}

/**
 * Aplica `caracter` a las casillas válidas del rectángulo (esquinas inclusivas, en cualquier
 * orden, recortado al valle). Válida = en parcela propia, no es río (vados incluidos) y sin
 * edificio. Árboles y rocas no impiden pintar. Pura.
 *
 * Tierra trabajada (M5-03): una casilla con planta cuenta como válida pero se deja como está
 * (si la zona nueva no es cultivo ni huerto, ni se cambia ni se borra su zona, sin error). Si la zona de una casilla arada vacía pasa a
 * ser otra que cultivo o huerto (o se borra), la tierra se limpia.
 */
export function aplicarZonas(
  estado: Pick<EstadoJuego, 'zonas' | 'valle' | 'cauce' | 'edificios'> &
    Partial<Pick<EstadoJuego, 'tierra' | 'plantas'>>,
  rect: { x0: number; y0: number; x1: number; y1: number },
  caracter: string,
): ResultadoZonas {
  const { x0, y0, x1, y1 } = rect
  if (![x0, y0, x1, y1].every((n) => Number.isSafeInteger(n))) {
    return { ok: false, error: 'parametro-invalido' }
  }
  const { valle } = estado
  const lado = ladoValle(valle)
  // Estado corrupto: `zonas` debe ser una cadena de exactamente lado² caracteres.
  if (
    typeof estado.zonas !== 'string' ||
    estado.zonas.length !== lado * lado ||
    !edificiosValidos(estado.edificios)
  ) {
    return { ok: false, error: 'estado-invalido' }
  }
  const c = valle.casillasPorParcela
  const xa = Math.max(0, Math.min(x0, x1))
  const xb = Math.min(lado - 1, Math.max(x0, x1))
  const ya = Math.max(0, Math.min(y0, y1))
  const yb = Math.min(lado - 1, Math.max(y0, y1))
  const agua = aguaDe(valle, estado.cauce.ancho, lado)
  const celdas = estado.zonas.split('')
  const conPlanta = new Set((estado.plantas ?? []).map((p) => p[0]))
  const limpiar: number[] = []
  const sigueLabrable = caracter === CARACTER_ZONA.cultivo || caracter === CARACTER_ZONA.huerto
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
      if (conPlanta.has(i) && !sigueLabrable) continue
      if (celdas[i] !== caracter) {
        celdas[i] = caracter
        cambiadas++
        if (!sigueLabrable) limpiar.push(i)
      }
    }
  }
  if (validas === 0) return { ok: false, error: 'sin-casillas-validas' }
  const tierra = estado.tierra === undefined ? '' : sinLabrar(estado.tierra, limpiar)
  return {
    ok: true,
    zonas: cambiadas === 0 ? estado.zonas : celdas.join(''),
    tierra,
    cambiadas,
  }
}
