import type Phaser from 'phaser'
import type { Personaje } from '../../core'
import { MARCO_PERSONAJE, crearAnimacionesPersonaje, escalaNominal } from './arte'
import {
  CLAVE_PROTAGONISTA,
  DetectorMovimiento,
  animacionPersonaje,
  nombreFotograma,
} from './animacionPersonaje'
import { TAM_CASILLA } from './estilo'

/**
 * El protagonista (arte final, M5-00): un `Sprite` con el atlas `protagonista`. Anda en cuatro
 * direcciones (la izquierda es la derecha espejada) y, quieto, respira mirando hacia la última
 * dirección en que se movió (`Personaje.orientacion`, que conserva el núcleo). Se crea una vez y
 * `colocar` solo lo mueve. `depth` = y de los pies en píxeles (ADR 0003: ordenar por y), con el
 * pivote en los pies para que quede detrás de lo que está más al sur (p. ej. un edificio).
 */
export class VistaPersonaje {
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly movimiento = new DetectorMovimiento()
  private clave = ''

  constructor(escena: Phaser.Scene) {
    crearAnimacionesPersonaje(escena)
    const m = MARCO_PERSONAJE
    this.sprite = escena.add
      .sprite(0, 0, CLAVE_PROTAGONISTA, nombreFotograma('reposo-abajo', 0))
      .setOrigin(m.pivoteX / m.ancho, m.pivoteY / m.alto)
      .setScale(
        escalaNominal(escena, CLAVE_PROTAGONISTA, m.ancho, nombreFotograma('reposo-abajo', 0)),
      )
  }

  /** Coloca al personaje; `ms` es el tiempo desde el fotograma anterior (para saber si anda). */
  colocar(p: Personaje, ms = 16): void {
    const x = p.x * TAM_CASILLA
    const y = p.y * TAM_CASILLA
    this.sprite.setPosition(x, y).setDepth(y)
    const anda = this.movimiento.actualizar(p.x, p.y, ms)
    const { clave, espejo } = animacionPersonaje(anda ? 'caminar' : 'reposo', p.orientacion)
    this.sprite.setFlipX(espejo)
    if (clave !== this.clave) {
      this.clave = clave
      this.sprite.play(clave)
    }
  }

  /** Animación en curso (ganchos de prueba), p. ej. `caminar-derecha`. */
  get animacion(): string {
    return this.clave
  }

  get espejado(): boolean {
    return this.sprite.flipX
  }

  destruir(): void {
    this.sprite.destroy()
  }
}
