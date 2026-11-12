import {
  casillaBloqueada,
  mapaTransitabilidad,
  type DatosMapa,
  type MapaTransitabilidad,
} from './mapa'

/** Punto en unidades de casilla (el centro de una casilla es `(cx + 0.5, cy + 0.5)`). */
export interface PuntoCamino {
  readonly x: number
  readonly y: number
}

const COSTE_RECTO = 1
const COSTE_DIAGONAL = Math.SQRT2
// Cuatro rectas y luego cuatro diagonales.
const DX = [0, 1, 0, -1, 1, 1, -1, -1]
const DY = [-1, 0, 1, 0, -1, 1, 1, -1]

/** Casilla transitable más cercana (distancia euclídea; empate: la primera en recorrer) a `(cx, cy)`, midiendo hasta el centro de cada casilla. */
function masCercana(mapa: MapaTransitabilidad, cx: number, cy: number): number {
  const { lado } = mapa
  const x0 = Math.min(Math.max(Math.floor(cx), 0), lado - 1)
  const y0 = Math.min(Math.max(Math.floor(cy), 0), lado - 1)
  let mejor = -1
  let mejorD = Infinity
  for (let r = 0; r <= lado; r++) {
    // El centro de toda casilla de un anillo posterior está a más de `r - 0,5` del punto.
    if (mejor >= 0 && r - 0.5 > Math.sqrt(mejorD)) break
    for (let y = y0 - r; y <= y0 + r; y++) {
      for (let x = x0 - r; x <= x0 + r; x++) {
        if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) !== r) continue
        if (casillaBloqueada(mapa, x, y)) continue
        const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2
        if (d < mejorD) {
          mejorD = d
          mejor = y * lado + x
        }
      }
    }
  }
  return mejor
}

/** Montículo binario mínimo de claves con prioridad numérica. */
class Monticulo {
  private readonly claves: number[] = []
  private readonly prioridades: number[] = []
  get tamano(): number {
    return this.claves.length
  }
  meter(clave: number, prioridad: number): void {
    const c = this.claves
    const p = this.prioridades
    let i = c.length
    c.push(clave)
    p.push(prioridad)
    while (i > 0) {
      const padre = (i - 1) >> 1
      if ((p[padre] ?? 0) <= prioridad) break
      c[i] = c[padre] ?? 0
      p[i] = p[padre] ?? 0
      i = padre
    }
    c[i] = clave
    p[i] = prioridad
  }
  sacar(): number {
    const c = this.claves
    const p = this.prioridades
    const primero = c[0] ?? 0
    const clave = c.pop() ?? 0
    const prioridad = p.pop() ?? 0
    const n = c.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let hijo = 2 * i + 1
        if (hijo >= n) break
        if (hijo + 1 < n && (p[hijo + 1] ?? 0) < (p[hijo] ?? 0)) hijo++
        if ((p[hijo] ?? 0) >= prioridad) break
        c[i] = c[hijo] ?? 0
        p[i] = p[hijo] ?? 0
        i = hijo
      }
      c[i] = clave
      p[i] = prioridad
    }
    return primero
  }
}

/** Heurística octil (admisible y consistente con costes 1 y √2). */
function octil(dx: number, dy: number): number {
  const a = Math.abs(dx)
  const b = Math.abs(dy)
  return COSTE_RECTO * (a + b) + (COSTE_DIAGONAL - 2 * COSTE_RECTO) * Math.min(a, b)
}

/**
 * Camino A* sobre el mapa de transitabilidad, 8-conexo sin cortar esquinas (una diagonal exige
 * libres las dos casillas contiguas, así la caja de 0,6 casillas la recorre sin atascarse).
 * `desde` y `hasta` en casillas (continuas). Si el destino está bloqueado o fuera del valle va a
 * la casilla transitable más cercana; si el origen está bloqueado parte de la más cercana.
 * Devuelve los centros de casilla desde la del origen hasta la del destino (siempre incluye
 * ambas; un solo punto si coinciden). Si el destino es libre pero inalcanzable, acaba en la casilla
 * alcanzada más próxima a él. Determinista. Vacío solo si las coordenadas no son finitas
 * o el valle no tiene casilla libre.
 */
export function buscarCamino(
  datos: DatosMapa,
  desde: PuntoCamino,
  hasta: PuntoCamino,
): readonly PuntoCamino[] {
  if (!Number.isFinite(desde.x + desde.y + hasta.x + hasta.y)) return []
  const mapa = mapaTransitabilidad(datos)
  const { lado, bloqueada } = mapa
  const cx0 = Math.floor(desde.x)
  const cy0 = Math.floor(desde.y)
  const cx1 = Math.floor(hasta.x)
  const cy1 = Math.floor(hasta.y)
  const inicio = casillaBloqueada(mapa, cx0, cy0)
    ? masCercana(mapa, desde.x, desde.y)
    : cy0 * lado + cx0
  const meta = casillaBloqueada(mapa, cx1, cy1)
    ? masCercana(mapa, hasta.x, hasta.y)
    : cy1 * lado + cx1
  if (inicio < 0 || meta < 0) return []
  const mx = meta % lado
  const my = Math.floor(meta / lado)

  const g = new Float64Array(lado * lado).fill(Infinity)
  const padre = new Int32Array(lado * lado).fill(-1)
  const cerrada = new Uint8Array(lado * lado)
  const abierta = new Monticulo()
  g[inicio] = 0
  const h0 = octil(mx - (inicio % lado), my - Math.floor(inicio / lado))
  abierta.meter(inicio, h0)
  // Si la meta no se alcanza, se va al nodo cerrado más cercano a ella (menor heurística).
  let mejorNodo = inicio
  let mejorH = h0
  while (abierta.tamano > 0) {
    const actual = abierta.sacar()
    if (cerrada[actual] === 1) continue
    cerrada[actual] = 1
    if (actual === meta) break
    const x = actual % lado
    const y = (actual - x) / lado
    const h = octil(mx - x, my - y)
    if (h < mejorH) {
      mejorH = h
      mejorNodo = actual
    }
    const gActual = g[actual] ?? 0
    for (let k = 0; k < 8; k++) {
      const nx = x + (DX[k] ?? 0)
      const ny = y + (DY[k] ?? 0)
      if (nx < 0 || ny < 0 || nx >= lado || ny >= lado) continue
      const n = ny * lado + nx
      if (bloqueada[n] === 1 || cerrada[n] === 1) continue
      const diagonal = k >= 4
      if (diagonal && (bloqueada[y * lado + nx] === 1 || bloqueada[ny * lado + x] === 1)) continue
      const coste = gActual + (diagonal ? COSTE_DIAGONAL : COSTE_RECTO)
      if (coste < (g[n] ?? Infinity)) {
        g[n] = coste
        padre[n] = actual
        abierta.meter(n, coste + octil(mx - nx, my - ny))
      }
    }
  }
  const fin = cerrada[meta] === 1 ? meta : mejorNodo
  const puntos: PuntoCamino[] = []
  for (let c = fin; c !== -1; c = padre[c] ?? -1) {
    puntos.push({ x: (c % lado) + 0.5, y: Math.floor(c / lado) + 0.5 })
  }
  return puntos.reverse()
}
