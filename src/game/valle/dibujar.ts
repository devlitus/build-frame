import type Phaser from 'phaser'
import type { Valle } from '../../core'
import type { Decoracion } from './decoracion'
import {
  COLOR_ARBOL,
  COLOR_RIO,
  COLOR_ROCA,
  COLOR_TERRENO,
  TAM_CASILLA,
  estiloParcela,
} from './estilo'
import type { Casilla } from './rio'

/*
 * Tres capas independientes (terreno, decoración, parcelas) para poder volcar
 * cada una a RenderTexture por trozos en M1-04.
 */

export function tamanoMundoPx(valle: Valle): number {
  return valle.parcelasPorLado * valle.casillasPorParcela * TAM_CASILLA
}

export function dibujarTerreno(
  escena: Phaser.Scene,
  valle: Valle,
  rio: readonly Casilla[],
): Phaser.GameObjects.Graphics {
  const g = escena.add.graphics().setDepth(0)
  const c = valle.casillasPorParcela
  const lado = c * TAM_CASILLA
  for (const p of valle.parcelas) {
    const color = COLOR_TERRENO[p.terreno]
    g.fillStyle(color.base)
    g.fillRect(p.columna * lado, p.fila * lado, lado, lado)
    g.fillStyle(color.alterno)
    for (let y = 0; y < c; y++) {
      for (let x = (y + 1) % 2; x < c; x += 2) {
        const px = (p.columna * c + x) * TAM_CASILLA
        const py = (p.fila * c + y) * TAM_CASILLA
        g.fillRect(px, py, TAM_CASILLA, TAM_CASILLA)
      }
    }
  }
  for (const { x, y } of rio) {
    g.fillStyle((x + y) % 2 === 0 ? COLOR_RIO.base : COLOR_RIO.alterno)
    g.fillRect(x * TAM_CASILLA, y * TAM_CASILLA, TAM_CASILLA, TAM_CASILLA)
  }
  return g
}

export function dibujarDecoracion(
  escena: Phaser.Scene,
  decoracion: readonly Decoracion[],
): Phaser.GameObjects.Graphics {
  const g = escena.add.graphics().setDepth(1)
  for (const d of decoracion) {
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
