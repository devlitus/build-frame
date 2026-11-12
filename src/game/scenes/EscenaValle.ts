import Phaser from 'phaser'
import {
  casillasRio,
  crearEstadoInicial,
  ladoValle,
  type Comando,
  type EstadoJuego,
} from '../../core'
import { ControlCamara } from '../camara/controlCamara'
import { marcarPropias } from '../valle/debug'
import { dibujarDecoracion, dibujarParcelas, dibujarTerreno, tamanoMundoPx } from '../valle/dibujar'
import { hornearCapaBase } from '../valle/hornear'
import { AcumuladorTiempo, acotarDelta, comandosMovimiento } from '../bucle'
import { EntradaMovimiento } from '../entrada'
import { Partida } from '../partida'
import { TAM_CASILLA } from '../valle/estilo'
import { VistaPersonaje } from '../valle/personaje'

/**
 * En el Modo Vida el arrastre de la cámara está desactivado (lo recupera el Modo Plano, M2-05).
 * Se deja activo de forma provisional: los e2e de M1 (cámara, recorrido del valle) se apoyan en
 * arrastrar; la cámara solo vuelve a seguir al personaje cuando este se mueve.
 */
const ARRASTRE_EN_MODO_VIDA = true

export interface DatosEscenaValle {
  readonly semilla: number
  /** Partida compartida con el resto del juego (HUD); sobrevive a los reinicios de la escena. */
  readonly partida: Partida
  /** Solo depuración: índices de parcela que se dibujan como propias. */
  readonly propias?: readonly number[]
  /** Solo depuración: empezar con el personaje en el primer vado. */
  readonly en?: 'vado'
}

/**
 * Escena del valle: los objetos se crean una sola vez en `create()` y no se toca nada
 * por casilla en `update()`. El terreno y la decoración se hornean
 * a `RenderTexture`; en WebGL un `Graphics` vivo se reprocesa en cada fotograma.
 */
export class EscenaValle extends Phaser.Scene {
  private _partida: Partida | undefined = undefined
  private en: 'vado' | undefined = undefined
  private control: ControlCamara | undefined = undefined
  private entrada: EntradaMovimiento | undefined = undefined
  private vista: VistaPersonaje | undefined = undefined
  private tiempo = new AcumuladorTiempo()
  private propias: readonly number[] = []
  private semilla = 0
  /** Datos de la partida, para poder reiniciar el valle sin perderlos. */
  get datos(): DatosEscenaValle {
    return {
      semilla: this.semilla,
      partida: this.partidaCompartida(),
      propias: this.propias,
      ...(this.en === undefined ? {} : { en: this.en }),
    }
  }
  private partidaCompartida(): Partida {
    if (!this._partida) throw new Error('La escena no se ha iniciado')
    return this._partida
  }

  private hornear: () => Phaser.GameObjects.RenderTexture[] = () => []
  private trozos: Phaser.GameObjects.RenderTexture[] = []
  private parcelas: Phaser.GameObjects.Graphics | undefined = undefined

  constructor() {
    super('valle')
  }

  init(datos: DatosEscenaValle): void {
    this.semilla = datos.semilla
    this._partida = datos.partida
    this.propias = datos.propias ?? []
    this.en = datos.en
  }

  /** Solo lectura desde fuera; lo escribe únicamente `create()`. */
  get estado(): EstadoJuego | undefined {
    return this._partida?.estado
  }

  /** La partida (estado, comandos y suscripción); undefined hasta `create()`. */
  get partida(): Partida | undefined {
    return this._partida
  }

  get mundoPx(): number {
    const e = this.estado
    return e ? tamanoMundoPx(e.valle) : 0
  }

  create(): void {
    // El dinero inicial llega con la economía (M3); de momento 0.
    let inicial = crearEstadoInicial({ semilla: this.semilla, dineroInicial: 0 })
    const primerVado = inicial.cauce.vados[0]
    if (this.en === 'vado' && primerVado !== undefined) {
      const lado = ladoValle(inicial.valle)
      inicial = {
        ...inicial,
        personaje: {
          ...inicial.personaje,
          x: (primerVado % lado) + 0.5,
          y: Math.floor(primerVado / lado) + 0.5,
        },
      }
    }
    // La misma instancia de Partida: los suscriptores (HUD) siguen suscritos tras un reinicio.
    const partida = this.partidaCompartida()
    partida.reemplazar(inicial)
    this.tiempo = new AcumuladorTiempo()
    const valle = inicial.valle
    const rio = casillasRio(valle, inicial.cauce.ancho)
    const vados = new Set(inicial.cauce.vados)
    // Las propias de depuración solo existen en la copia que se dibuja.
    const paraDibujar = marcarPropias(valle, this.propias)

    // Terreno y decoración no cambian: se hornean a texturas por trozos (M1-04).
    const decoracion = inicial.obstaculos
    this.hornear = () =>
      hornearCapaBase(this, this.mundoPx, (region) => [
        dibujarTerreno(this, paraDibujar, rio, vados, region),
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
    this.vista = new VistaPersonaje(this)
    this.vista.colocar(inicial.personaje)
    this.entrada = new EntradaMovimiento(this)
    const posicion = {
      x: inicial.personaje.x * TAM_CASILLA,
      y: inicial.personaje.y * TAM_CASILLA,
    }
    // Modo Vida: la cámara sigue al personaje y no se arrastra (el arrastre vuelve con el Modo Plano).
    this.control = new ControlCamara(
      this,
      this.mundoPx,
      { seguir: true, arrastre: ARRASTRE_EN_MODO_VIDA },
      // Como en M1 la vista empieza centrada en el valle; con `?debug&en=vado` en el personaje.
      this.en === undefined ? undefined : posicion,
      posicion,
    )
  }

  /**
   * Un fotograma: movimiento, reloj, dibujo del personaje y cámara. `delta` se acota para que
   * una pestaña en segundo plano no avance el juego de golpe.
   */
  override update(_time: number, delta: number): void {
    const partida = this._partida
    if (!partida || !this.entrada) return
    const ms = acotarDelta(delta)
    let desmayo = false
    const emitir = (c: Comando): void => {
      const r = partida.emitir(c)
      if (r.ok && r.eventos.some((e) => e.tipo === 'desmayo')) desmayo = true
    }
    for (const c of comandosMovimiento(this.entrada.leer(), ms)) emitir(c)
    const { velocidad, pausado } = partida.estado
    const minutos = this.tiempo.acumular(ms, velocidad, pausado)
    if (minutos > 0) emitir({ tipo: 'AvanzarTiempo', minutos })
    const p = partida.estado.personaje
    this.vista?.colocar(p)
    const punto = { x: p.x * TAM_CASILLA, y: p.y * TAM_CASILLA }
    // Tras un desmayo el personaje reaparece lejos: la cámara salta, sin barrido.
    if (desmayo) this.control?.centrarEn(punto)
    else this.control?.seguir(punto, ms)
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
    this.vista?.destruir()
    this.vista = undefined
    this.entrada = undefined
    this.control = undefined
  }
}
