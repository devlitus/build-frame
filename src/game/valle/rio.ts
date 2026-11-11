import type { Valle } from '../../core'
import { ANCHO_RIO } from './estilo'

export interface Casilla {
  readonly x: number
  readonly y: number
}

export type Lado = 'norte' | 'sur' | 'este' | 'oeste'

const OPUESTO: Readonly<Record<Lado, Lado>> = {
  norte: 'sur',
  sur: 'norte',
  este: 'oeste',
  oeste: 'este',
}

/** Lado de la parcela `a` que mira a la parcela contigua `b` (4-conexas). */
function ladoHacia(
  a: { fila: number; columna: number },
  b: { fila: number; columna: number },
): Lado {
  if (b.fila > a.fila) return 'sur'
  if (b.fila < a.fila) return 'norte'
  return b.columna > a.columna ? 'este' : 'oeste'
}

/** Clave única de una casilla global en un valle de `lado` casillas por lado. */
export function claveCasilla(lado: number, x: number, y: number): number {
  return y * lado + x
}

/**
 * Casillas del cauce como una banda continua de `ANCHO_RIO` casillas: cada parcela
 * del río lleva un bloque central y un brazo hacia el lado por el que entra y el
 * lado por el que sale. Los brazos de parcelas contiguas coinciden en la frontera.
 * Devuelve coordenadas globales de casilla (sin duplicados).
 */
export function casillasRio(valle: Valle): Casilla[] {
  const c = valle.casillasPorParcela
  const n = valle.parcelasPorLado
  const ancho = Math.min(ANCHO_RIO, c)
  const lo = Math.floor((c - ancho) / 2)
  const hi = lo + ancho - 1
  const cauce = valle.rio.map((i) => {
    const p = valle.parcelas[i]
    if (!p) throw new Error(`Parcela de río inexistente: ${i}`)
    return p
  })
  const primera = cauce[0]
  const ultima = cauce[cauce.length - 1]
  if (!primera || !ultima) return []
  // El río recorre el valle en vertical si entra por la fila 0 y sale por la última.
  const vertical = primera.fila === 0 && ultima.fila === n - 1
  const entradaBorde: Lado = vertical ? 'norte' : 'oeste'

  const resultado: Casilla[] = []
  const vistas = new Set<number>()
  const lado = n * c
  const poner = (x: number, y: number): void => {
    const k = claveCasilla(lado, x, y)
    if (vistas.has(k)) return
    vistas.add(k)
    resultado.push({ x, y })
  }

  cauce.forEach((p, k) => {
    const previa = cauce[k - 1]
    const siguiente = cauce[k + 1]
    const entra = previa ? ladoHacia(p, previa) : entradaBorde
    const sale = siguiente ? ladoHacia(p, siguiente) : OPUESTO[entradaBorde]
    const ox = p.columna * c
    const oy = p.fila * c
    for (let y = lo; y <= hi; y++) for (let x = lo; x <= hi; x++) poner(ox + x, oy + y)
    for (const l of new Set<Lado>([entra, sale])) {
      for (let a = lo; a <= hi; a++) {
        if (l === 'norte') for (let y = 0; y < lo; y++) poner(ox + a, oy + y)
        if (l === 'sur') for (let y = hi + 1; y < c; y++) poner(ox + a, oy + y)
        if (l === 'oeste') for (let x = 0; x < lo; x++) poner(ox + x, oy + a)
        if (l === 'este') for (let x = hi + 1; x < c; x++) poner(ox + x, oy + a)
      }
    }
  })
  return resultado
}
