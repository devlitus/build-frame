import Phaser from 'phaser'
import { esToqueDeSeleccion } from './picking'

type Fase = 'libre' | 'candidato' | 'anulado'

/**
 * Gestos del Modo Plano para elegir parcela: un clic o toque corto en el valle. No cuenta un
 * arrastre de cámara (el gesto se desplazó más del umbral), un pellizco (hubo un segundo dedo)
 * ni un toque largo en táctil. Entrega el punto del mundo (px) que estaba bajo el puntero al
 * apoyarse.
 */
export class SelectorParcela {
  /** Solo en el Modo Plano; fuera de él se ignoran los gestos. */
  activo = true
  private fase: Fase = 'libre'
  private id = -1
  private inicioX = 0
  private inicioY = 0
  private t0 = 0
  private movidoMax = 0
  private mundo = { x: 0, y: 0 }

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly alTocar: (mundo: { x: number; y: number }) => void,
  ) {
    const input = escena.input
    input.on('pointerdown', this.alBajar, this)
    input.on('pointermove', this.alMover, this)
    input.on('pointerup', this.alSoltar, this)
    input.on('pointerupoutside', this.alSoltar, this)
    escena.game.events.on(Phaser.Core.Events.BLUR, this.reiniciar, this)
    escena.game.events.on(Phaser.Core.Events.HIDDEN, this.reiniciar, this)
    escena.events.once('shutdown', this.destruir, this)
  }

  /** Descarta el gesto en curso (cambio de modo, pérdida de foco...). */
  reiniciar(): void {
    this.fase = 'libre'
    this.id = -1
  }

  private dedosAbajo(): number {
    return this.escena.input.manager.pointers.filter((p) => p.isDown).length
  }

  private alBajar(p: Phaser.Input.Pointer): void {
    if (!this.activo) return
    if (!p.wasTouch && !p.leftButtonDown()) return
    if (this.dedosAbajo() > 1) {
      this.fase = 'anulado'
      return
    }
    this.fase = 'candidato'
    this.id = p.id
    this.inicioX = p.x
    this.inicioY = p.y
    this.movidoMax = 0
    this.t0 = performance.now()
    const m = this.escena.cameras.main.getWorldPoint(p.x, p.y)
    this.mundo = { x: m.x, y: m.y }
  }

  private alMover(p: Phaser.Input.Pointer): void {
    if (this.fase !== 'candidato' || p.id !== this.id) return
    this.movidoMax = Math.max(this.movidoMax, Math.hypot(p.x - this.inicioX, p.y - this.inicioY))
  }

  private alSoltar(p: Phaser.Input.Pointer): void {
    if (this.fase === 'anulado') {
      if (this.dedosAbajo() === 0) this.fase = 'libre'
      return
    }
    if (this.fase !== 'candidato' || p.id !== this.id) return
    this.movidoMax = Math.max(this.movidoMax, Math.hypot(p.x - this.inicioX, p.y - this.inicioY))
    const toque =
      this.activo &&
      !p.wasCanceled &&
      esToqueDeSeleccion(this.movidoMax, performance.now() - this.t0, p.wasTouch)
    const punto = this.mundo
    this.reiniciar()
    if (toque) this.alTocar(punto)
  }

  private destruir(): void {
    const input = this.escena.input
    input.off('pointerdown', this.alBajar, this)
    input.off('pointermove', this.alMover, this)
    input.off('pointerup', this.alSoltar, this)
    input.off('pointerupoutside', this.alSoltar, this)
    this.escena.game.events.off(Phaser.Core.Events.BLUR, this.reiniciar, this)
    this.escena.game.events.off(Phaser.Core.Events.HIDDEN, this.reiniciar, this)
  }
}
