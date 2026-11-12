import Phaser from 'phaser'
import type { Orientacion, Personaje } from '../../core'
import { ESTILO_PERSONAJE as E, TAM_CASILLA } from './estilo'

const DESPLAZAMIENTO: Readonly<Record<Orientacion, { x: number; y: number }>> = {
  norte: { x: 0, y: -1 },
  sur: { x: 0, y: 1 },
  este: { x: 1, y: 0 },
  oeste: { x: -1, y: 0 },
}

/**
 * Personaje provisional: un círculo con un punto que marca hacia dónde mira. Se crea una vez
 * y `colocar` solo mueve los objetos. `depth` = y en píxeles (ADR 0003: ordenar por y).
 */
export class VistaPersonaje {
  private readonly cuerpo: Phaser.GameObjects.Arc
  private readonly indicador: Phaser.GameObjects.Arc

  constructor(escena: Phaser.Scene) {
    this.cuerpo = escena.add.circle(0, 0, E.radio, E.cuerpo).setStrokeStyle(2, E.borde)
    this.indicador = escena.add.circle(0, 0, E.radioIndicador, E.indicador)
  }

  colocar(p: Personaje): void {
    const x = p.x * TAM_CASILLA
    const y = p.y * TAM_CASILLA
    this.cuerpo.setPosition(x, y).setDepth(y)
    const d = DESPLAZAMIENTO[p.orientacion]
    // El indicador queda por delante del cuerpo.
    this.indicador
      .setPosition(x + d.x * E.distanciaIndicador, y + d.y * E.distanciaIndicador)
      .setDepth(y + 0.5)
  }

  destruir(): void {
    this.cuerpo.destroy()
    this.indicador.destroy()
  }
}
