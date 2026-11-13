import type Phaser from 'phaser'
import type { Pincel } from '../pincel'
import { ESTILO_PREVIA, ESTILO_ZONAS, PROFUNDIDAD_TINTE, TAM_CASILLA } from './estilo'
import { segmentosDiscontinuos } from './trazos'

/**
 * Vista previa del pincel: el rectángulo que se va a pintar (arrastre o esquinas del teclado) y el
 * cursor de casilla. Un `Graphics` pequeño que se redibuja solo cuando cambia lo que muestra, por
 * encima del tinte día/noche para que se vea igual de noche. El borrador va con borde discontinuo y
 * color distinto: se distingue sin depender del color.
 */
export class VistaPincel {
  private g: Phaser.GameObjects.Graphics | undefined
  private clave = ''
  private _repintados = 0

  constructor(escena: Phaser.Scene) {
    this.g = escena.add.graphics().setDepth(PROFUNDIDAD_TINTE + 2)
  }

  get repintados(): number {
    return this._repintados
  }

  actualizar(p: Pincel): void {
    const g = this.g
    if (!g) return
    const r = p.rectanguloPrevio
    const c = p.cursor
    const a = p.ancla
    const h = p.herramienta
    const clave = `${h ?? ''}|${r ? `${r.x0},${r.y0},${r.x1},${r.y1}` : ''}|${c ? `${c.x},${c.y}` : ''}|${a ? `${a.x},${a.y}` : ''}`
    if (clave === this.clave) return
    this.clave = clave
    this._repintados++
    g.clear()
    if (!r || !h) return
    const T = TAM_CASILLA
    const e = ESTILO_PREVIA
    const x = r.x0 * T
    const y = r.y0 * T
    const ancho = (r.x1 - r.x0 + 1) * T
    const alto = (r.y1 - r.y0 + 1) * T
    const color = h === 'borrar' ? e.borrar : ESTILO_ZONAS[h].color
    g.fillStyle(color, e.alfaRelleno)
    g.fillRect(x, y, ancho, alto)
    const m = e.grosorTinta / 2
    const trazar = (grosor: number, col: number): void => {
      g.lineStyle(grosor, col, 1)
      if (h === 'borrar') {
        g.beginPath()
        for (const [x1, y1, x2, y2] of segmentosDiscontinuos(
          x + m,
          y + m,
          ancho - e.grosorTinta,
          alto - e.grosorTinta,
          18,
          10,
        )) {
          g.moveTo(x1, y1)
          g.lineTo(x2, y2)
        }
        g.strokePath()
      } else g.strokeRect(x + m, y + m, ancho - e.grosorTinta, alto - e.grosorTinta)
    }
    trazar(e.grosorTinta, e.tinta)
    trazar(e.grosorCrema, e.crema)
    if (c) {
      // Cursor: la casilla con doble contorno; la esquina ya marcada, con un cuadrito lleno.
      g.lineStyle(6, e.tinta, 1)
      g.strokeRect(c.x * T + 3, c.y * T + 3, T - 6, T - 6)
      g.lineStyle(3, e.crema, 1)
      g.strokeRect(c.x * T + 3, c.y * T + 3, T - 6, T - 6)
    }
    if (a) {
      g.fillStyle(e.tinta, 1)
      g.fillRect(a.x * T + 10, a.y * T + 10, T - 20, T - 20)
      g.fillStyle(e.crema, 1)
      g.fillRect(a.x * T + 13, a.y * T + 13, T - 26, T - 26)
    }
  }

  destruir(): void {
    this.g?.destroy()
    this.g = undefined
  }
}
