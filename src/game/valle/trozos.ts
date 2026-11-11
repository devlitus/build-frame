/**
 * Rejilla de trozos en que se hornea la capa de terreno y decoración (M1-04).
 * Función pura: sin Phaser, para poder probarla con Vitest.
 */

/** Lado máximo de un trozo (px). 1024 es seguro como textura en móviles. */
export const TAM_TROZO = 1024

export interface Trozo {
  readonly columna: number
  readonly fila: number
  /** Esquina superior izquierda en el mundo; siempre entera. */
  readonly x: number
  readonly y: number
  /** Tamaño en píxeles; el último trozo de cada eje puede ser menor que `tam`. */
  readonly ancho: number
  readonly alto: number
}

/** Divide un mundo cuadrado de `mundoPx` en trozos de como mucho `tam`, por filas. */
export function rejillaTrozos(mundoPx: number, tam: number = TAM_TROZO): readonly Trozo[] {
  if (!Number.isInteger(mundoPx) || mundoPx <= 0) throw new RangeError('mundoPx inválido')
  if (!Number.isInteger(tam) || tam <= 0) throw new RangeError('tam inválido')
  const n = Math.ceil(mundoPx / tam)
  const trozos: Trozo[] = []
  for (let fila = 0; fila < n; fila++) {
    for (let columna = 0; columna < n; columna++) {
      const x = columna * tam
      const y = fila * tam
      trozos.push({
        columna,
        fila,
        x,
        y,
        ancho: Math.min(tam, mundoPx - x),
        alto: Math.min(tam, mundoPx - y),
      })
    }
  }
  return trozos
}
