import { CARACTER_ZONA, ZONAS, type Zona } from '../../core'

/** Tramo horizontal de casillas contiguas con la misma zona (`x0..x1` inclusive, fila `y`). */
export interface TramoZona {
  readonly y: number
  readonly x0: number
  readonly x1: number
}

/** Ventana de casillas, esquinas inclusivas. */
export interface VentanaCasillas {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/**
 * Agrupa en tramos horizontales las casillas con zona de `ventana` (recortada al valle): así se
 * dibuja un rectángulo por tramo y no uno por casilla. `zonas` es `EstadoJuego.zonas`
 * (un carácter por casilla, filas seguidas).
 */
export function tramosPorZona(
  zonas: string,
  lado: number,
  ventana: VentanaCasillas,
): Record<Zona, TramoZona[]> {
  const salida = { cultivo: [], huerto: [], vivienda: [], almacen: [] } as Record<Zona, TramoZona[]>
  const porCaracter = new Map<string, Zona>(ZONAS.map((z) => [CARACTER_ZONA[z], z]))
  const xa = Math.max(0, ventana.x0)
  const xb = Math.min(lado - 1, ventana.x1)
  const ya = Math.max(0, ventana.y0)
  const yb = Math.min(lado - 1, ventana.y1)
  for (let y = ya; y <= yb; y++) {
    let inicio = -1
    let zona: Zona | undefined
    for (let x = xa; x <= xb + 1; x++) {
      const z = x <= xb ? porCaracter.get(zonas[y * lado + x] ?? '') : undefined
      if (z === zona) continue
      if (zona !== undefined) salida[zona].push({ y, x0: inicio, x1: x - 1 })
      zona = z
      inicio = x
    }
  }
  return salida
}

/** Firma de lo que contiene la ventana: si no cambia, el trozo horneado sigue valiendo. */
export function firmaVentana(zonas: string, lado: number, v: VentanaCasillas): string {
  const filas: string[] = []
  for (let y = Math.max(0, v.y0); y <= Math.min(lado - 1, v.y1); y++) {
    filas.push(zonas.slice(y * lado + Math.max(0, v.x0), y * lado + Math.min(lado - 1, v.x1) + 1))
  }
  return filas.join('|')
}

/** Qué lados de una casilla tienen vecina de otra zona (o el borde del valle): ahí va el borde del arte. */
export interface BordesCasilla {
  readonly arriba: boolean
  readonly derecha: boolean
  readonly abajo: boolean
  readonly izquierda: boolean
}

/** Zona de la casilla `(x, y)`, o undefined si no tiene o cae fuera del valle. */
export function zonaDeCasilla(zonas: string, lado: number, x: number, y: number): Zona | undefined {
  if (x < 0 || y < 0 || x >= lado || y >= lado) return undefined
  const c = zonas[y * lado + x]
  return ZONAS.find((z) => CARACTER_ZONA[z] === c)
}

/** Bordes que se dibujan en la casilla `(x, y)` de la zona `zona`: los lados cuya vecina es de otra zona. */
export function bordesDeCasilla(
  zonas: string,
  lado: number,
  x: number,
  y: number,
  zona: Zona,
): BordesCasilla {
  const otra = (dx: number, dy: number): boolean =>
    zonaDeCasilla(zonas, lado, x + dx, y + dy) !== zona
  return { arriba: otra(0, -1), derecha: otra(1, 0), abajo: otra(0, 1), izquierda: otra(-1, 0) }
}
