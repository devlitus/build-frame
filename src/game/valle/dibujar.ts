import type Phaser from 'phaser'
import type { Valle } from '../../core'
import {
  TAM_CASILLA,
  ESTILO_PLANO,
  ESTILO_RESALTE,
  ESTILO_RESALTE_EDIFICIO,
  estiloParcela,
} from './estilo'
import type { EstadoVisualParcela } from './estadoVisual'
import { rayasDiagonales, segmentosDiscontinuos } from './trazos'

/*
 * Dibujo de las parcelas y de los resaltes (el terreno y los objetos viven en `terrenoArte.ts`).
 */

export function tamanoMundoPx(valle: Valle): number {
  return valle.parcelasPorLado * valle.casillasPorParcela * TAM_CASILLA
}

/**
 * Borra y vuelve a pintar las 36 parcelas (sin tocar el valle horneado). Con `visuales` (Modo
 * Plano) usa los tres estados de `ESTILO_PLANO`; sin él (Modo Vida) el estilo de siempre:
 * propias doradas y el resto en venta.
 */
export function redibujarParcelas(
  g: Phaser.GameObjects.Graphics,
  valle: Valle,
  visuales?: readonly EstadoVisualParcela[],
): void {
  g.clear()
  const lado = valle.casillasPorParcela * TAM_CASILLA
  // Las propias van al final para que su borde grueso no quede recortado por las vecinas.
  const orden = valle.parcelas
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.estado === 'propia') - Number(b.p.estado === 'propia'))
  for (const { p, i } of orden) {
    const x = p.columna * lado
    const y = p.fila * lado
    if (visuales === undefined) {
      const e = estiloParcela(p.estado)
      g.fillStyle(e.tinte, e.alfaTinte)
      g.fillRect(x, y, lado, lado)
      g.lineStyle(e.grosorBorde, e.borde, 1)
      const m = e.grosorBorde / 2
      g.strokeRect(x + m, y + m, lado - e.grosorBorde, lado - e.grosorBorde)
      continue
    }
    const e = ESTILO_PLANO[visuales[i] ?? 'no-comprable']
    g.fillStyle(e.tinte, e.alfaTinte)
    g.fillRect(x, y, lado, lado)
    if (e.rayado) {
      g.lineStyle(e.rayado.grosor, e.rayado.color, e.rayado.alfa)
      // Todas las rayas de la parcela en un solo trazo (un `strokePath`, no uno por raya).
      g.beginPath()
      for (const [x1, y1, x2, y2] of rayasDiagonales(x, y, lado, e.rayado.paso)) {
        g.moveTo(x1, y1)
        g.lineTo(x2, y2)
      }
      g.strokePath()
    }
    g.lineStyle(e.grosorBorde, e.borde, 1)
    const m = e.grosorBorde / 2
    const ancho = lado - e.grosorBorde
    if (e.discontinuo) {
      // Todos los trazos del borde en un solo `strokePath`.
      g.beginPath()
      for (const [x1, y1, x2, y2] of segmentosDiscontinuos(
        x + m,
        y + m,
        ancho,
        ancho,
        e.discontinuo.trazo,
        e.discontinuo.hueco,
      )) {
        g.moveTo(x1, y1)
        g.lineTo(x2, y2)
      }
      g.strokePath()
    } else g.strokeRect(x + m, y + m, ancho, ancho)
    if (e.moneda) {
      const c = e.moneda
      // En el centro: las esquinas y los bordes de arriba los puede tapar el HUD.
      const cx = x + lado / 2
      const cy = y + lado / 2
      g.fillStyle(c.relleno, 1)
      g.fillCircle(cx, cy, c.radio)
      g.lineStyle(8, c.borde, 1)
      g.strokeCircle(cx, cy, c.radio)
      g.lineStyle(6, c.borde, 1)
      g.strokeCircle(cx, cy, c.radio * 0.5)
    }
  }
}

/** Rectángulo de resalte (relleno crema suave y doble contorno tinta/crema), en px del mundo. */
function resaltarRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  ancho: number,
  alto: number,
): void {
  const e = ESTILO_RESALTE
  g.fillStyle(e.crema, e.alfaRelleno)
  g.fillRect(x, y, ancho, alto)
  const m = e.grosorTinta / 2
  g.lineStyle(e.grosorTinta, e.tinta, 1)
  g.strokeRect(x + m, y + m, ancho - e.grosorTinta, alto - e.grosorTinta)
  g.lineStyle(e.grosorCrema, e.crema, 1)
  g.strokeRect(x + m, y + m, ancho - e.grosorTinta, alto - e.grosorTinta)
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
  resaltarRect(g, (indice % n) * lado, Math.floor(indice / n) * lado, lado, lado)
}

/** Redibuja el contorno de la huella de un edificio (casillas) seleccionado; lo borra si `huella` es undefined. */
export function dibujarResalteEdificio(
  g: Phaser.GameObjects.Graphics,
  huella: { x0: number; y0: number; x1: number; y1: number } | undefined,
): void {
  g.clear()
  if (!huella) return
  // Contorno por fuera de la huella: el tejado (que sobresale por arriba) y el edificio quedan a la vista,
  // y una obra de 1×1 se distingue por el aro tinta + amarillo + crema que la rodea.
  const e = ESTILO_RESALTE_EDIFICIO
  const x = huella.x0 * TAM_CASILLA
  const y = huella.y0 * TAM_CASILLA
  const ancho = (huella.x1 - huella.x0 + 1) * TAM_CASILLA
  const alto = (huella.y1 - huella.y0 + 1) * TAM_CASILLA
  const aro = (grosor: number, color: number, desde: number): void => {
    // Trazo del grosor dado que empieza `desde` px fuera del borde de la huella.
    const d = desde + grosor / 2
    g.lineStyle(grosor, color, 1)
    g.strokeRect(x - d, y - d, ancho + 2 * d, alto + 2 * d)
  }
  aro(e.grosorTinta, e.tinta, 0)
  aro(e.grosorAcento, e.acento, (e.grosorTinta - e.grosorAcento) / 2)
  aro(e.grosorCrema, e.crema, (e.grosorTinta - e.grosorCrema) / 2)
}
