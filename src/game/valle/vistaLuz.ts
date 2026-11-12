import Phaser from 'phaser'
import { PROFUNDIDAD_TINTE } from './estilo'
import { luzDelMinuto } from './luz'

/** Lado del rectángulo del tinte: cubre cualquier pantalla incluso con el zoom mínimo. */
const LADO = 40_000
/**
 * Por debajo de este alfa el tinte no se nota y se oculta: un rectángulo a pantalla completa
 * con mezcla cuesta relleno en cada fotograma (se nota en GPU por software).
 */
const ALFA_MINIMO = 0.04

/**
 * Tinte del ciclo día/noche: un único rectángulo fijo a la cámara (`scrollFactor` 0) centrado en
 * ella. Solo se vuelve a pintar cuando cambia el minuto de juego, no en cada fotograma.
 */
export class VistaLuz {
  private readonly rect: Phaser.GameObjects.Rectangle
  private minuto = Number.NaN

  constructor(private readonly escena: Phaser.Scene) {
    this.rect = escena.add
      .rectangle(0, 0, LADO, LADO, 0xffffff, 0)
      .setScrollFactor(0)
      .setDepth(PROFUNDIDAD_TINTE)
    this.centrar()
    escena.scale.on(Phaser.Scale.Events.RESIZE, this.centrar, this)
  }

  /** El zoom de la cámara escala respecto a su centro: el rectángulo va en ese centro. */
  private centrar(): void {
    const c = this.escena.cameras.main
    this.rect.setPosition(c.width / 2, c.height / 2)
  }

  actualizar(minutoDelDia: number): void {
    const m = Math.floor(minutoDelDia)
    if (m === this.minuto) return
    this.minuto = m
    const { color, alfa } = luzDelMinuto(m)
    this.rect.setFillStyle(color, alfa).setVisible(alfa >= ALFA_MINIMO)
  }

  /** Opacidad vigente del tinte (para los ganchos de prueba). */
  get alfa(): number {
    return this.rect.visible ? this.rect.fillAlpha : 0
  }

  destruir(): void {
    this.escena.scale.off(Phaser.Scale.Events.RESIZE, this.centrar, this)
    this.rect.destroy()
  }
}
