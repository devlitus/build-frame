import Phaser from 'phaser'
import { crearEstadoInicial, type EstadoJuego } from '../../core'
import { decorarValle } from '../valle/decoracion'
import { marcarPropias } from '../valle/debug'
import { dibujarDecoracion, dibujarParcelas, dibujarTerreno, tamanoMundoPx } from '../valle/dibujar'
import { casillasRio, claveCasilla } from '../valle/rio'

export interface DatosEscenaValle {
  readonly semilla: number
  /** Solo depuración: índices de parcela que se dibujan como propias. */
  readonly propias?: readonly number[]
}

/**
 * Escena del valle: los objetos se crean una sola vez en `create()` y no se toca nada
 * por casilla en `update()`. Ojo: en WebGL un `Graphics` se reprocesa en cada fotograma;
 * M1-04 lo pasará a `RenderTexture`.
 */
export class EscenaValle extends Phaser.Scene {
  private _estado?: EstadoJuego
  private propias: readonly number[] = []
  private semilla = 0

  constructor() {
    super('valle')
  }

  init(datos: DatosEscenaValle): void {
    this.semilla = datos.semilla
    this.propias = datos.propias ?? []
  }

  /** Solo lectura desde fuera; lo escribe únicamente `create()`. */
  get estado(): EstadoJuego | undefined {
    return this._estado
  }

  get mundoPx(): number {
    return this._estado ? tamanoMundoPx(this._estado.valle) : 0
  }

  create(): void {
    // El dinero inicial llega con la economía (M3); de momento 0.
    this._estado = crearEstadoInicial({ semilla: this.semilla, dineroInicial: 0 })
    const valle = this._estado.valle
    const rio = casillasRio(valle)
    const lado = valle.parcelasPorLado * valle.casillasPorParcela
    const claves = new Set(rio.map((c) => claveCasilla(lado, c.x, c.y)))
    // Las propias de depuración solo existen en la copia que se dibuja.
    const paraDibujar = marcarPropias(valle, this.propias)

    dibujarTerreno(this, paraDibujar, rio)
    dibujarDecoracion(this, decorarValle(valle, this.semilla, claves))
    dibujarParcelas(this, paraDibujar)

    // Accesibilidad: el foco pasa al contenedor del lienzo al entrar en el valle.
    this.game.canvas.parentElement?.focus({ preventScroll: true })
    this.encuadrar()
    this.scale.on('resize', this.encuadrar, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.encuadrar, this))
  }

  /** Cámara inicial: el valle entero centrado (los controles llegan en M1-03). */
  private encuadrar(): void {
    const mundo = this.mundoPx
    const cam = this.cameras.main
    cam.setZoom(Math.min(this.scale.width / mundo, this.scale.height / mundo) * 0.95)
    cam.centerOn(mundo / 2, mundo / 2)
  }
}
