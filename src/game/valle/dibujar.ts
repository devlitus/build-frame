import type Phaser from 'phaser'
import { claveCasilla, type Casilla, type Decoracion, type Valle } from '../../core'
import {
  COLOR_ARBOL,
  COLOR_RIO,
  COLOR_ROCA,
  COLOR_VADO,
  COLOR_TERRENO,
  TAM_CASILLA,
  ESTILO_RESALTE,
  estiloParcela,
} from './estilo'

/*
 * Tres capas independientes (terreno, decoración, parcelas) para poder volcar
 * cada una a RenderTexture por trozos en M1-04.
 */

export function tamanoMundoPx(valle: Valle): number {
  return valle.parcelasPorLado * valle.casillasPorParcela * TAM_CASILLA
}

/** Rectángulo del mundo (px) al que se limita el dibujo al hornear un trozo. */
export interface Region {
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

function cruza(r: Region | undefined, x: number, y: number, ancho: number, alto: number): boolean {
  return !r || (x < r.x + r.ancho && x + ancho > r.x && y < r.y + r.alto && y + alto > r.y)
}

/** Con `region`, solo dibuja las parcelas y casillas que la tocan. */
export function dibujarTerreno(
  escena: Phaser.Scene,
  valle: Valle,
  rio: readonly Casilla[],
  vados: ReadonlySet<number>,
  region?: Region,
): Phaser.GameObjects.Graphics {
  const g = escena.add.graphics().setDepth(0)
  const c = valle.casillasPorParcela
  const lado = c * TAM_CASILLA
  const ladoCasillas = valle.parcelasPorLado * c
  for (const p of valle.parcelas) {
    if (!cruza(region, p.columna * lado, p.fila * lado, lado, lado)) continue
    const color = COLOR_TERRENO[p.terreno]
    g.fillStyle(color.base)
    g.fillRect(p.columna * lado, p.fila * lado, lado, lado)
    g.fillStyle(color.alterno)
    for (let y = 0; y < c; y++) {
      for (let x = (y + 1) % 2; x < c; x += 2) {
        const px = (p.columna * c + x) * TAM_CASILLA
        const py = (p.fila * c + y) * TAM_CASILLA
        if (!cruza(region, px, py, TAM_CASILLA, TAM_CASILLA)) continue
        g.fillRect(px, py, TAM_CASILLA, TAM_CASILLA)
      }
    }
  }
  for (const { x, y } of rio) {
    if (!cruza(region, x * TAM_CASILLA, y * TAM_CASILLA, TAM_CASILLA, TAM_CASILLA)) continue
    const px = x * TAM_CASILLA
    const py = y * TAM_CASILLA
    if (vados.has(claveCasilla(ladoCasillas, x, y))) {
      g.fillStyle(COLOR_VADO.agua)
      g.fillRect(px, py, TAM_CASILLA, TAM_CASILLA)
      g.fillStyle(COLOR_VADO.piedra)
      g.lineStyle(1, COLOR_VADO.piedraBorde)
      for (const [fx, fy] of [
        [0.3, 0.3],
        [0.7, 0.65],
      ] as const) {
        g.fillCircle(px + fx * TAM_CASILLA, py + fy * TAM_CASILLA, 6)
        g.strokeCircle(px + fx * TAM_CASILLA, py + fy * TAM_CASILLA, 6)
      }
      continue
    }
    g.fillStyle((x + y) % 2 === 0 ? COLOR_RIO.base : COLOR_RIO.alterno)
    g.fillRect(px, py, TAM_CASILLA, TAM_CASILLA)
  }
  return g
}

export function dibujarDecoracion(
  escena: Phaser.Scene,
  decoracion: readonly Decoracion[],
  region?: Region,
): Phaser.GameObjects.Graphics {
  const g = escena.add.graphics().setDepth(1)
  for (const d of decoracion) {
    // Cada objeto cabe en su casilla (ver abajo), así que basta con comprobar la casilla.
    if (!cruza(region, d.x * TAM_CASILLA, d.y * TAM_CASILLA, TAM_CASILLA, TAM_CASILLA)) continue
    const cx = d.x * TAM_CASILLA + TAM_CASILLA / 2
    const cy = d.y * TAM_CASILLA + TAM_CASILLA / 2
    if (d.tipo === 'arbol') {
      const r = 8 + d.variante * 4
      // Todo cabe en la casilla: vértice a cy-r-3 ≥ -15 y tronco hasta cy+0.4r+8 ≤ 13.
      g.fillStyle(COLOR_ARBOL.tronco)
      g.fillRect(cx - 2, cy + r * 0.4, 4, 8)
      g.fillStyle(d.variante < 0.5 ? COLOR_ARBOL.copa : COLOR_ARBOL.copaClara)
      if (d.variante < 0.5) g.fillCircle(cx, cy, r)
      else g.fillTriangle(cx, cy - r - 3, cx - r, cy + r * 0.6, cx + r, cy + r * 0.6)
    } else {
      const r = 8 + d.variante * 6
      const pts = [
        { x: cx - r, y: cy + r * 0.5 },
        { x: cx - r * 0.6, y: cy - r * 0.5 },
        { x: cx + r * 0.2, y: cy - r * 0.8 },
        { x: cx + r, y: cy - r * 0.1 },
        { x: cx + r * 0.7, y: cy + r * 0.6 },
      ]
      g.fillStyle(COLOR_ROCA.relleno)
      g.fillPoints(pts, true)
      g.lineStyle(1.5, COLOR_ROCA.borde)
      g.strokePoints(pts, true)
    }
  }
  return g
}

export function dibujarParcelas(escena: Phaser.Scene, valle: Valle): Phaser.GameObjects.Graphics {
  const g = escena.add.graphics().setDepth(2)
  const lado = valle.casillasPorParcela * TAM_CASILLA
  // Las propias van al final para que su borde grueso no quede recortado por las vecinas.
  const orden = [...valle.parcelas].sort(
    (a, b) => Number(a.estado === 'propia') - Number(b.estado === 'propia'),
  )
  for (const p of orden) {
    const e = estiloParcela(p.estado)
    const x = p.columna * lado
    const y = p.fila * lado
    g.fillStyle(e.tinte, e.alfaTinte)
    g.fillRect(x, y, lado, lado)
    g.lineStyle(e.grosorBorde, e.borde, 1)
    const m = e.grosorBorde / 2
    g.strokeRect(x + m, y + m, lado - e.grosorBorde, lado - e.grosorBorde)
  }
  return g
}

/** Redibuja el contorno de la parcela seleccionada (o lo borra si `indice` es undefined). */
export function dibujarResalte(
  g: Phaser.GameObjects.Graphics,
  valle: Valle,
  indice: number | undefined,
): void {
  g.clear()
  if (indice === undefined) return
  const lado = valle.casillasPorParcela * TAM_CASILLA
  const n = valle.parcelasPorLado
  const x = (indice % n) * lado
  const y = Math.floor(indice / n) * lado
  const e = ESTILO_RESALTE
  g.fillStyle(e.crema, e.alfaRelleno)
  g.fillRect(x, y, lado, lado)
  const m = e.grosorTinta / 2
  g.lineStyle(e.grosorTinta, e.tinta, 1)
  g.strokeRect(x + m, y + m, lado - e.grosorTinta, lado - e.grosorTinta)
  g.lineStyle(e.grosorCrema, e.crema, 1)
  g.strokeRect(x + m, y + m, lado - e.grosorTinta, lado - e.grosorTinta)
}
