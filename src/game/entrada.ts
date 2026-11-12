import Phaser from 'phaser'

/** Intención de movimiento por eje en {-1, 0, 1} (x al este, y al sur). */
export interface Intencion {
  readonly dx: number
  readonly dy: number
}

type Teclas = Record<'arriba' | 'abajo' | 'izquierda' | 'derecha', Phaser.Input.Keyboard.Key[]>

/**
 * Teclado de movimiento: WASD y flechas. Las teclas se registran sin capturar el evento
 * (`enableCapture` = false), así no se bloquean los atajos del navegador. Al perder el foco la
 * ventana se sueltan todas, para que el personaje no siga andando.
 */
export class EntradaMovimiento {
  private readonly teclas: Teclas

  constructor(private readonly escena: Phaser.Scene) {
    const teclado = escena.input.keyboard
    if (!teclado) throw new Error('El teclado no está disponible')
    const K = Phaser.Input.Keyboard.KeyCodes
    const tecla = (codigo: number) => teclado.addKey(codigo, false)
    this.teclas = {
      arriba: [tecla(K.W), tecla(K.UP)],
      abajo: [tecla(K.S), tecla(K.DOWN)],
      izquierda: [tecla(K.A), tecla(K.LEFT)],
      derecha: [tecla(K.D), tecla(K.RIGHT)],
    }
    escena.game.events.on(Phaser.Core.Events.BLUR, this.soltar, this)
    escena.game.events.on(Phaser.Core.Events.HIDDEN, this.soltar, this)
    escena.events.once('shutdown', this.destruir, this)
  }

  private pulsada(teclas: readonly Phaser.Input.Keyboard.Key[]): boolean {
    return teclas.some((t) => t.isDown)
  }

  /** Suelta todas las teclas. */
  soltar(): void {
    this.escena.input.keyboard?.resetKeys()
  }

  leer(): Intencion {
    const t = this.teclas
    return {
      dx: (this.pulsada(t.derecha) ? 1 : 0) - (this.pulsada(t.izquierda) ? 1 : 0),
      dy: (this.pulsada(t.abajo) ? 1 : 0) - (this.pulsada(t.arriba) ? 1 : 0),
    }
  }

  private destruir(): void {
    this.escena.game.events.off(Phaser.Core.Events.BLUR, this.soltar, this)
    this.escena.game.events.off(Phaser.Core.Events.HIDDEN, this.soltar, this)
    const teclado = this.escena.input.keyboard
    for (const lista of Object.values(this.teclas)) for (const k of lista) teclado?.removeKey(k)
  }
}
