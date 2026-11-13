import type Phaser from 'phaser'
import type { Silueta } from '../construir'
import { ESTILO_SILUETA as E, PROFUNDIDAD_TINTE, TAM_CASILLA as T } from './estilo'

/**
 * Silueta del edificio que se va a colocar: su huella, verde azulada si se puede colocar y bermellón
 * con un aspa si no (así se distingue sin depender del color). Doble contorno tinta/crema, por
 * encima del tinte día/noche. Un `Graphics` que solo se redibuja cuando cambia la silueta.
 */
export class VistaSilueta {
  private g: Phaser.GameObjects.Graphics | undefined
  private clave = ''
  private _repintados = 0

  constructor(escena: Phaser.Scene) {
    this.g = escena.add.graphics().setDepth(PROFUNDIDAD_TINTE + 2)
  }

  get repintados(): number {
    return this._repintados
  }

  actualizar(s: Silueta | undefined): void {
    const g = this.g
    if (!g) return
    const clave = s ? `${s.tipo}|${s.x},${s.y}|${s.resultado.valida ? 'v' : 'x'}` : ''
    if (clave === this.clave) return
    this.clave = clave
    this._repintados++
    g.clear()
    if (!s) return
    const valida = s.resultado.valida
    const x = s.x * T
    const y = s.y * T
    const ancho = s.ancho * T
    const alto = s.alto * T
    g.fillStyle(valida ? E.valida : E.invalida, E.alfaRelleno)
    g.fillRect(x, y, ancho, alto)
    const m = E.grosorTinta / 2
    g.lineStyle(E.grosorTinta, E.tinta, 1)
    g.strokeRect(x + m, y + m, ancho - E.grosorTinta, alto - E.grosorTinta)
    g.lineStyle(E.grosorCrema, E.crema, 1)
    g.strokeRect(x + m, y + m, ancho - E.grosorTinta, alto - E.grosorTinta)
    if (!valida) {
      const a = E.grosorTinta + 4
      const aspa = (grosor: number, color: number): void => {
        g.lineStyle(grosor, color, 1)
        g.beginPath()
        g.moveTo(x + a, y + a)
        g.lineTo(x + ancho - a, y + alto - a)
        g.moveTo(x + ancho - a, y + a)
        g.lineTo(x + a, y + alto - a)
        g.strokePath()
      }
      aspa(E.grosorTinta, E.tinta)
      aspa(E.grosorCrema, E.crema)
    }
  }

  destruir(): void {
    this.g?.destroy()
    this.g = undefined
  }
}
