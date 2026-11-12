import Phaser from 'phaser'

/** Intención de movimiento por eje en {-1, 0, 1} (x al este, y al sur). */
export interface Intencion {
  readonly dx: number
  readonly dy: number
}

type Teclas = Record<'arriba' | 'abajo' | 'izquierda' | 'derecha', Phaser.Input.Keyboard.Key[]>

/**
 * Teclado: WASD y flechas (mueven al personaje en Vida y la cámara en Plano), `+`/`-` (zoom en
 * Plano) y `M` (cambiar de modo; `Tab` se deja libre para la navegación por foco). Las teclas se registran sin capturar el evento
 * (`enableCapture` = false), así no se bloquean los atajos del navegador. Al perder el foco la
 * ventana se sueltan todas, para que el personaje no siga andando.
 */
export class EntradaMovimiento {
  private readonly teclas: Teclas
  private readonly zoomMas: Phaser.Input.Keyboard.Key[]
  private readonly zoomMenos: Phaser.Input.Keyboard.Key[]
  private modoPendiente = false

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
    // Firefox da otros códigos: 61 (=/+), 171 (+) y 173 (-).
    this.zoomMas = [tecla(K.PLUS), tecla(K.NUMPAD_ADD), tecla(61), tecla(171)]
    this.zoomMenos = [tecla(K.MINUS), tecla(K.NUMPAD_SUBTRACT), tecla(173)]
    // Con el evento (y no con `JustDown`) una pulsación no se pierde si la ventana pierde el foco
    // entre la tecla y el fotograma, ni se repite al mantenerla.
    teclado.on('keydown-M', this.alPulsarModo, this)
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

  /** Zoom del teclado: 1 acerca, -1 aleja, 0 nada. */
  leerZoom(): number {
    return (this.pulsada(this.zoomMas) ? 1 : 0) - (this.pulsada(this.zoomMenos) ? 1 : 0)
  }

  /** `true` una vez por cada pulsación de `M`. */
  cambiarModo(): boolean {
    const pendiente = this.modoPendiente
    this.modoPendiente = false
    return pendiente
  }

  private alPulsarModo(evento: KeyboardEvent): void {
    // Ctrl/Alt/Meta+M son atajos del navegador o del sistema, no cambian de modo.
    if (evento.repeat || evento.ctrlKey || evento.altKey || evento.metaKey) return
    this.modoPendiente = true
  }

  private destruir(): void {
    this.escena.game.events.off(Phaser.Core.Events.BLUR, this.soltar, this)
    this.escena.game.events.off(Phaser.Core.Events.HIDDEN, this.soltar, this)
    const teclado = this.escena.input.keyboard
    const todas = [...Object.values(this.teclas).flat(), ...this.zoomMas, ...this.zoomMenos]
    teclado?.off('keydown-M', this.alPulsarModo, this)
    for (const k of todas) teclado?.removeKey(k)
  }
}
