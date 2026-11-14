import Phaser from 'phaser'
import type { Construccion } from './construir'
import { casillaEnPunto, casillaMasCercana, type Casilla } from './pincel'
import { mundoDePantalla } from './resolucion'

type Fase = 'libre' | 'colocando' | 'anulado'

/**
 * Gestos de la silueta de un edificio (modo Construir). Con un edificio elegido:
 * - ratón: la silueta sigue al cursor (también sin pulsar); un clic suelta y pide la confirmación;
 * - dedo: tocar coloca la silueta y arrastrar la ajusta; no confirma (lo hace un botón);
 * - un segundo dedo anula el gesto y devuelve la silueta a donde estaba: con dos dedos la cámara
 *   se mueve o hace zoom (`ControlCamara` ya no arrastra con uno solo mientras se coloca).
 */
export class ColocadorEdificio {
  private fase: Fase = 'libre'
  private id = -1
  private previo: Casilla | undefined = undefined

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly construccion: Construccion,
    private readonly lado: number,
    private readonly tamCasilla: number,
    private readonly alClicRaton: () => void,
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
    this.previo = undefined
  }

  private dedosAbajo(): number {
    return this.escena.input.manager.pointers.filter((p) => p.isDown).length
  }

  private casilla(p: Phaser.Input.Pointer, ajustar: boolean): Casilla | undefined {
    const m = mundoDePantalla(this.escena, p.x, p.y)
    return ajustar
      ? casillaMasCercana(this.lado, this.tamCasilla, m.x, m.y)
      : casillaEnPunto(this.lado, this.tamCasilla, m.x, m.y)
  }

  private alBajar(p: Phaser.Input.Pointer): void {
    if (!this.construccion.activo) return
    if (!p.wasTouch && !p.leftButtonDown()) return
    if (this.dedosAbajo() > 1 || this.fase !== 'libre') {
      this.anular()
      return
    }
    const c = this.casilla(p, false)
    if (!c) return
    this.fase = 'colocando'
    this.id = p.id
    this.previo = this.construccion.centro
    this.construccion.colocar(c)
  }

  private anular(): void {
    // Segundo dedo: lo que movió el primero era el comienzo de un gesto de cámara.
    const previo = this.previo
    if (this.fase === 'colocando' && previo) this.construccion.colocar(previo)
    this.fase = 'anulado'
    this.previo = undefined
  }

  private alMover(p: Phaser.Input.Pointer): void {
    if (!this.construccion.activo) return
    if (this.fase === 'colocando') {
      if (p.id !== this.id) return
      const c = this.casilla(p, true)
      if (c) this.construccion.colocar(c)
      return
    }
    // Ratón sin pulsar: la silueta sigue al cursor mientras esté sobre el valle.
    if (this.fase === 'libre' && !p.wasTouch && !p.isDown) {
      const c = this.casilla(p, false)
      if (c) this.construccion.colocar(c)
    }
  }

  private alSoltar(p: Phaser.Input.Pointer): void {
    if (this.fase === 'anulado') {
      if (this.dedosAbajo() === 0) this.fase = 'libre'
      return
    }
    if (this.fase !== 'colocando' || p.id !== this.id) return
    const c = this.casilla(p, true)
    if (c) this.construccion.colocar(c)
    this.reiniciar()
    // Un toque cancelado por el sistema no confirma; un dedo nunca confirma (lo hace el botón).
    if (p.wasCanceled || p.wasTouch) return
    this.alClicRaton()
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
