/** Segmento `[x1, y1, x2, y2]`. */
export type Segmento = readonly [number, number, number, number]

/**
 * Trazos de un rectángulo discontinuo (Phaser no dibuja líneas discontinuas): recorre los
 * cuatro lados en orden, `trazo` px de línea y `hueco` px de vacío, con las esquinas siempre
 * dentro de un trazo para que el cuadrado se lea cerrado.
 */
export function segmentosDiscontinuos(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  trazo: number,
  hueco: number,
): Segmento[] {
  const lados: Segmento[] = [
    [x, y, x + ancho, y],
    [x + ancho, y, x + ancho, y + alto],
    [x + ancho, y + alto, x, y + alto],
    [x, y + alto, x, y],
  ]
  const salida: Segmento[] = []
  const paso = trazo + hueco
  for (const [x1, y1, x2, y2] of lados) {
    const largo = Math.hypot(x2 - x1, y2 - y1)
    if (largo === 0 || paso <= 0) continue
    const ux = (x2 - x1) / largo
    const uy = (y2 - y1) / largo
    // Se reparte el sobrante para que ambos extremos del lado terminen en trazo.
    const n = Math.max(1, Math.round((largo + hueco) / paso))
    const trazoReal = (largo - (n - 1) * hueco) / n
    for (let k = 0; k < n; k++) {
      const a = k * (trazoReal + hueco)
      const b = a + trazoReal
      salida.push([x1 + ux * a, y1 + uy * a, x1 + ux * b, y1 + uy * b])
    }
  }
  return salida
}

/**
 * Rayas diagonales (de abajo-izquierda a arriba-derecha) que cubren un cuadrado de `lado`
 * con `paso` px entre rayas, recortadas al cuadrado.
 */
export function rayasDiagonales(x: number, y: number, lado: number, paso: number): Segmento[] {
  const salida: Segmento[] = []
  if (paso <= 0 || lado <= 0) return salida
  for (let d = paso; d < 2 * lado; d += paso) {
    // La raya x + y' = d (en coordenadas locales) entra por el borde izquierdo/inferior.
    const x1 = Math.min(d, lado)
    const y1 = d - x1
    const y2 = Math.min(d, lado)
    const x2 = d - y2
    salida.push([x + x2, y + y2, x + x1, y + y1])
  }
  return salida
}
