import Phaser from 'phaser'
import { crearEstadoInicial, type EstadoJuego } from '../../core'
import { ControlCamara } from '../camara/controlCamara'
import { decorarValle } from '../valle/decoracion'
import { marcarPropias } from '../valle/debug'
import { dibujarDecoracion, dibujarParcelas, dibujarTerreno, tamanoMundoPx } from '../valle/dibujar'
import { hornearCapaBase } from '../valle/hornear'
import { casillasRio, claveCasilla } from '../valle/rio'

export interface DatosEscenaValle {
  readonly semilla: number
  /** Solo depuración: índices de parcela que se dibujan como propias. */
  readonly propias?: readonly number[]
}

/**
 * Escena del valle: los objetos se crean una sola vez en `create()` y no se toca nada
 * por casilla en `update()`. El terreno y la decoración se hornean
 * a `RenderTexture`; en WebGL un `Graphics` vivo se reprocesa en cada fotograma.
 */
export class EscenaValle extends Phaser.Scene {
  private _estado?: EstadoJuego
  private propias: readonly number[] = []
  private semilla = 0
  /** Datos de la partida, para poder reiniciar el valle sin perderlos. */
  get datos(): DatosEscenaValle {
    return { semilla: this.semilla, propias: this.propias }
  }
  private hornear: () => Phaser.GameObjects.RenderTexture[] = () => []
  private trozos: Phaser.GameObjects.RenderTexture[] = []
  private parcelas: Phaser.GameObjects.Graphics | undefined = undefined

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

    // Terreno y decoración no cambian: se hornean a texturas por trozos (M1-04).
    const decoracion = decorarValle(valle, this.semilla, claves)
    this.hornear = () =>
      hornearCapaBase(this, this.mundoPx, (region) => [
        dibujarTerreno(this, paraDibujar, rio, region),
        dibujarDecoracion(this, decoracion, region),
      ])
    this.trozos = this.hornear()
    // Al perder y recuperar el contexto WebGL las texturas quedan vacías (Phaser no las
    // restaura): se vuelven a hornear con los mismos datos.
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.rehornear, this)
    }
    // Las parcelas (36 bordes y tintes) cambiarán al comprar (M3): siguen en un Graphics pequeño.
    this.parcelas = dibujarParcelas(this, paraDibujar)
    this.events.once('shutdown', this.liberar, this)

    // Accesibilidad: el foco pasa al contenedor del lienzo al entrar en el valle.
    this.game.canvas.parentElement?.focus({ preventScroll: true })
    new ControlCamara(this, this.mundoPx)
  }

  private rehornear(): void {
    for (const t of this.trozos) t.destroy()
    this.trozos = this.hornear()
  }

  /**
   * Libera las texturas horneadas y el Graphics de parcelas. Es redundante (Phaser ya
   * destruye los hijos de la escena al cerrarla; no había fuga) pero se deja explícito.
   */
  private liberar(): void {
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.rehornear, this)
    }
    for (const t of this.trozos) t.destroy()
    this.trozos = []
    this.parcelas?.destroy()
    this.parcelas = undefined
  }
}
