import Phaser from 'phaser'
import { casillaEnPunto, casillaMasCercana, type Pincel, type RectCasillas } from './pincel'

type Fase = 'libre' | 'pintando' | 'anulado'

/**
 * Gestos del pincel de zonas. Con la barra abierta y una herramienta elegida, un puntero (botón
 * izquierdo del ratón o un dedo) arrastra un rectángulo de casillas y al soltar se entrega para
 * aplicarlo. Un segundo dedo anula el gesto: con dos dedos la cámara se mueve o hace zoom
 * (`ControlCamara` ya no arrastra con uno solo mientras el pincel está activo).
 */
export class PintorZonas {
  private fase: Fase = 'libre'
  private id = -1

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly pincel: Pincel,
    private readonly lado: number,
    private readonly tamCasilla: number,
    private readonly alAplicar: (rect: RectCasillas) => void,
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
    this.pincel.cancelarArrastre()
  }

  private dedosAbajo(): number {
    return this.escena.input.manager.pointers.filter((p) => p.isDown).length
  }

  private casilla(p: Phaser.Input.Pointer, ajustar: boolean) {
    const m = this.escena.cameras.main.getWorldPoint(p.x, p.y)
    return ajustar
      ? casillaMasCercana(this.lado, this.tamCasilla, m.x, m.y)
      : casillaEnPunto(this.lado, this.tamCasilla, m.x, m.y)
  }

  private alBajar(p: Phaser.Input.Pointer): void {
    if (!this.pincel.activo) return
    if (!p.wasTouch && !p.leftButtonDown()) return
    if (this.dedosAbajo() > 1 || this.fase !== 'libre') {
      this.fase = 'anulado'
      this.pincel.cancelarArrastre()
      return
    }
    const c = this.casilla(p, false)
    if (!c) return
    this.fase = 'pintando'
    this.id = p.id
    this.pincel.empezarArrastre(c)
  }

  private alMover(p: Phaser.Input.Pointer): void {
    if (this.fase !== 'pintando' || p.id !== this.id) return
    const c = this.casilla(p, true)
    if (c) this.pincel.moverArrastre(c)
  }

  private alSoltar(p: Phaser.Input.Pointer): void {
    if (this.fase === 'anulado') {
      if (this.dedosAbajo() === 0) this.fase = 'libre'
      return
    }
    if (this.fase !== 'pintando' || p.id !== this.id) return
    const c = this.casilla(p, true)
    if (c) this.pincel.moverArrastre(c)
    this.fase = 'libre'
    this.id = -1
    // Un toque cancelado por el sistema (`pointercancel`) no pinta.
    if (p.wasCanceled) {
      this.pincel.cancelarArrastre()
      return
    }
    const rect = this.pincel.terminarArrastre()
    if (rect) this.alAplicar(rect)
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
