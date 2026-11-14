/**
 * Variante de una casilla (0 a `n - 1`) elegida con la semilla del valle: determinista y sin
 * estado, así que el terreno y las zonas se ven igual al recargar o rehornear (biblia §9).
 * `sal` separa usos distintos (terreno, zonas) para que sus variantes no vayan a la par.
 */
export function varianteDeCasilla(semilla: number, x: number, y: number, n = 4, sal = 0): number {
  let h = (semilla ^ Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b) ^ sal) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h % n
}
