import Phaser from 'phaser'
import {
  aplicarComando,
  casillasRio,
  crearEstadoInicial,
  ladoValle,
  tiempoDetenido,
  type Comando,
  type EstadoJuego,
  type ModoJuego,
} from '../../core'
import { CONFIG_CAMARA } from '../camara/config'
import { ControlCamara } from '../camara/controlCamara'
import { conPropiasDeDepuracion } from '../valle/debug'
import {
  dibujarDecoracion,
  dibujarParcelas,
  dibujarResalte,
  dibujarTerreno,
  tamanoMundoPx,
} from '../valle/dibujar'
import { medirReservasHud } from '../areaHud'
import { areaLibre, centroParaVer, parcelaEnPunto, puntoDeToque, rectParcela } from '../picking'
import { SelectorParcela } from '../selectorParcela'
import { hornearCapaBase } from '../valle/hornear'
import { AcumuladorTiempo, acotarDelta, comandosMovimiento } from '../bucle'
import { EntradaMovimiento } from '../entrada'
import { Partida } from '../partida'
import { PROFUNDIDAD_TINTE, TAM_CASILLA } from '../valle/estilo'
import { VistaPersonaje } from '../valle/personaje'
import { VistaLuz } from '../valle/vistaLuz'
import { SeguidorCamino } from '../seguirCamino'
import { ControlTactil, MarcaDestino } from '../tactil'

/** El arrastre de la cámara solo existe en el Modo Plano; en Vida la cámara sigue al personaje. */
const ARRASTRE_EN_MODO_VIDA = false

export interface DatosEscenaValle {
  readonly semilla: number
  /** Partida compartida con el resto del juego (HUD); sobrevive a los reinicios de la escena. */
  readonly partida: Partida
  /** Modo con el que empieza la partida (`?modo=plano`); por defecto Vida. */
  readonly modo?: ModoJuego
  /** Solo depuración: índices de parcela que se dibujan como propias. */
  readonly propias?: readonly number[]
  /** Solo depuración: empezar con el personaje en el primer vado. */
  readonly en?: 'vado'
  /** Solo depuración: parcela seleccionada al empezar (si el modo es Plano). */
  readonly seleccion?: number
  /** Solo depuración: multiplicador del tiempo de juego. */
  readonly acelerar?: number
  /** Solo depuración: minuto del día inicial (1320 = 22:00). */
  readonly hora?: number
}

/**
 * Escena del valle: los objetos se crean una sola vez en `create()` y no se toca nada
 * por casilla en `update()`. El terreno y la decoración se hornean
 * a `RenderTexture`; en WebGL un `Graphics` vivo se reprocesa en cada fotograma.
 */
export class EscenaValle extends Phaser.Scene {
  private _partida: Partida | undefined = undefined
  private en: 'vado' | undefined = undefined
  private modoInicial: ModoJuego = 'vida'
  /** Modo ya aplicado a la cámara y al teclado; si el estado cambia, `update()` lo reaplica. */
  private modoAplicado: ModoJuego = 'vida'
  private control: ControlCamara | undefined = undefined
  private entrada: EntradaMovimiento | undefined = undefined
  private vista: VistaPersonaje | undefined = undefined
  private luz: VistaLuz | undefined = undefined
  private acelerar = 1
  private seleccionInicial: number | undefined = undefined
  private hora: number | undefined = undefined
  private tactil: ControlTactil | undefined = undefined
  private desmayoVisto = false
  private desuscribir: (() => void) | undefined = undefined
  private marca: MarcaDestino | undefined = undefined
  private readonly seguidor = new SeguidorCamino()
  private tiempo = new AcumuladorTiempo()
  private propias: readonly number[] = []
  private semilla = 0
  /** Datos de la partida, para poder reiniciar el valle sin perderlos. */
  get datos(): DatosEscenaValle {
    return {
      semilla: this.semilla,
      partida: this.partidaCompartida(),
      propias: this.propias,
      ...(this.modoInicial === 'plano' ? { modo: this.modoInicial } : {}),
      ...(this.en === undefined ? {} : { en: this.en }),
      ...(this.acelerar > 1 ? { acelerar: this.acelerar } : {}),
      ...(this.hora === undefined ? {} : { hora: this.hora }),
    }
  }
  private partidaCompartida(): Partida {
    if (!this._partida) throw new Error('La escena no se ha iniciado')
    return this._partida
  }

  private hornear: () => Phaser.GameObjects.RenderTexture[] = () => []
  private trozos: Phaser.GameObjects.RenderTexture[] = []
  private parcelas: Phaser.GameObjects.Graphics | undefined = undefined
  private resalte: Phaser.GameObjects.Graphics | undefined = undefined
  private selector: SelectorParcela | undefined = undefined
  private desuscribirSeleccion: (() => void) | undefined = undefined
  /** Clave de la última guía de cámara (parcela y panel), para no repetirla. */
  private claveGuia = ''
  private quitarEsc: (() => void) | undefined = undefined

  constructor() {
    super('valle')
  }

  init(datos: DatosEscenaValle): void {
    this.semilla = datos.semilla
    this._partida = datos.partida
    this.propias = datos.propias ?? []
    this.en = datos.en
    this.acelerar = datos.acelerar ?? 1
    this.seleccionInicial = datos.seleccion
    this.hora = datos.hora
    this.modoInicial = datos.modo ?? 'vida'
  }

  /** Opacidad del tinte día/noche (ganchos de prueba). */
  get alfaLuz(): number | undefined {
    return this.luz?.alfa
  }

  /** Solo lectura desde fuera; lo escribe únicamente `create()`. */
  get estado(): EstadoJuego | undefined {
    return this._partida?.estado
  }

  /** La partida (estado, comandos y suscripción); undefined hasta `create()`. */
  get partida(): Partida | undefined {
    return this._partida
  }

  /** Destino actual del personaje en casillas (centro), para los tests e2e. */
  get destino(): { x: number; y: number } | undefined {
    return this.seguidor.destino
  }

  /** ¿Hay un joystick en pantalla? (tests e2e) */
  get joystickVisible(): boolean {
    return this.tactil?.joystickVisible ?? false
  }

  get mundoPx(): number {
    const e = this.estado
    return e ? tamanoMundoPx(e.valle) : 0
  }

  create(): void {
    let inicial = crearEstadoInicial({
      semilla: this.semilla,
      ...(this.hora === undefined ? {} : { minutoInicial: this.hora }),
    })
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
    // Solo depuración: las propias entran en el estado (panel, precio) antes de cambiar de modo.
    if (this.propias.length > 0) inicial = conPropiasDeDepuracion(inicial, this.propias)
    inicial = aplicarComando(inicial, { tipo: 'CambiarModo', modo: this.modoInicial }).estado
    // La misma instancia de Partida: los suscriptores (HUD) siguen suscritos tras un reinicio.
    const partida = this.partidaCompartida()
    partida.reemplazar(inicial)
    this.tiempo = new AcumuladorTiempo()
    const valle = inicial.valle
    const rio = casillasRio(valle, inicial.cauce.ancho)
    const vados = new Set(inicial.cauce.vados)
    const paraDibujar = valle

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
    // Contorno de la parcela seleccionada (estado de interfaz): por encima del personaje y del
    // tinte, para que se vea igual de noche.
    this.resalte = this.add.graphics().setDepth(PROFUNDIDAD_TINTE + 1)
    this.events.once('shutdown', this.liberar, this)

    // Accesibilidad: el foco pasa al contenedor del lienzo al entrar en el valle.
    this.game.canvas.parentElement?.focus({ preventScroll: true })
    this.vista = new VistaPersonaje(this)
    this.luz = new VistaLuz(this)
    this.luz.actualizar(inicial.minutoDelDia)
    this.vista.colocar(inicial.personaje)
    this.entrada = new EntradaMovimiento(this)
    this.seguidor.cancelar()
    // El desmayo puede emitirse fuera de `update()` (p. ej. dormir desde la interfaz): se
    // atiende al evento de la partida, no a lo visto en el bucle.
    this.desmayoVisto = false
    this.desuscribir?.()
    this.desuscribir = partida.suscribir((cambio) => {
      if (cambio.eventos.some((e) => e.tipo === 'desmayo')) {
        this.seguidor.cancelar()
        this.desmayoVisto = true
      }
    })
    this.selector = new SelectorParcela(this, (p) => {
      const g = this.geometria()
      const i = g ? parcelaEnPunto(g, p.x, p.y) : undefined
      // Tocar fuera del valle deselecciona; tocar la misma parcela la mantiene.
      if (i === undefined) partida.seleccion.deseleccionar()
      else partida.seleccion.seleccionar(i)
    })
    this.selector.activo = inicial.modo === 'plano'
    this.desuscribirSeleccion?.()
    this.claveGuia = ''
    this.desuscribirSeleccion = partida.seleccion.suscribir(() => this.alCambiarSeleccion())
    // Al girar o redimensionar, el panel y las reservas se vuelven a medir en el DOM: la guía se
    // repite en el siguiente fotograma, cuando ya están al día.
    this.scale.off('resize', this.alRedimensionar, this)
    this.scale.on('resize', this.alRedimensionar, this)
    this.quitarEsc?.()
    const alEsc = (): void => {
      partida.seleccion.deseleccionar()
    }
    const teclado = this.input.keyboard
    teclado?.on('keydown-ESC', alEsc)
    this.quitarEsc = () => teclado?.off('keydown-ESC', alEsc)
    this.tactil = new ControlTactil(this)
    this.tactil.activo = inicial.modo === 'vida'
    this.marca = new MarcaDestino(this)
    const posicion = {
      x: inicial.personaje.x * TAM_CASILLA,
      y: inicial.personaje.y * TAM_CASILLA,
    }
    // Vida: la cámara empieza centrada en el personaje, lo sigue y no se arrastra. Plano: cámara
    // libre (como en M1), con la vista centrada en el valle.
    const enVida = inicial.modo === 'vida'
    this.modoAplicado = inicial.modo
    this.control = new ControlCamara(
      this,
      this.mundoPx,
      { seguir: enVida, arrastre: !enVida || ARRASTRE_EN_MODO_VIDA },
      enVida ? posicion : undefined,
      posicion,
    )
    const sel = this.seleccionInicial
    if (sel !== undefined && !enVida && sel < valle.parcelas.length) {
      partida.seleccion.seleccionar(sel)
    }
  }

  /** Lado de una parcela y del valle en px del mundo, para el picking. */
  private geometria(): { parcelasPorLado: number; ladoParcelaPx: number } | undefined {
    const v = this._partida?.estado.valle
    return (
      v && {
        parcelasPorLado: v.parcelasPorLado,
        ladoParcelaPx: v.casillasPorParcela * TAM_CASILLA,
      }
    )
  }

  /** Punto de pantalla (px) donde pulsar para tocar la parcela `i`; undefined si no se ve. */
  puntoClic(i: number): { x: number; y: number } | undefined {
    const g = this.geometria()
    const c = this.control
    if (!g || !c || !this._partida || !Number.isInteger(i)) return undefined
    const pantalla = { ancho: this.scale.width, alto: this.scale.height }
    const libre = areaLibre(pantalla, this._partida.seleccion.ocupado, medirReservasHud())
    return puntoDeToque(c.vista, pantalla, libre, rectParcela(g, i))
  }

  private alRedimensionar(): void {
    this.claveGuia = ''
    requestAnimationFrame(() => {
      if (this.control) this.alCambiarSeleccion()
    })
  }

  /** Redibuja el contorno y, si la parcela queda tapada por el panel o el HUD, la deja a la vista. */
  private alCambiarSeleccion(): void {
    const partida = this._partida
    const g = this.geometria()
    if (!partida || !g) return
    const i = partida.seleccion.indice
    if (this.resalte) dibujarResalte(this.resalte, partida.estado.valle, i)
    if (i === undefined) {
      this.claveGuia = ''
      this.control?.soltarExtension()
      return
    }
    const o = partida.seleccion.ocupado
    const clave = `${i}|${o ? `${o.x},${o.y},${o.ancho},${o.alto}` : ''}`
    if (clave === this.claveGuia || !this.control) return
    this.claveGuia = clave
    const pantalla = { ancho: this.scale.width, alto: this.scale.height }
    const centro = centroParaVer(
      this.control.vista,
      pantalla,
      areaLibre(pantalla, o, medirReservasHud()),
      rectParcela(g, i),
    )
    if (centro) this.control.guiarA(centro)
  }

  /**
   * Un fotograma: movimiento, reloj, dibujo del personaje y cámara. `delta` se acota para que
   * una pestaña en segundo plano no avance el juego de golpe.
   */
  override update(_time: number, delta: number): void {
    const partida = this._partida
    if (!partida || !this.entrada) return
    const ms = acotarDelta(delta)
    const emitir = (c: Comando): void => {
      partida.emitir(c)
    }
    if (this.entrada.cambiarModo()) {
      emitir({ tipo: 'CambiarModo', modo: partida.estado.modo === 'vida' ? 'plano' : 'vida' })
    }
    // El cambio puede venir de la tecla o del botón de la interfaz.
    if (partida.estado.modo !== this.modoAplicado) this.aplicarModo(partida.estado.modo)
    const modo = this.modoAplicado
    const teclado = this.entrada.leer()
    const joystick = this.tactil?.leer() ?? { dx: 0, dy: 0 }
    // El teclado tiene prioridad sobre el joystick; cualquiera de los dos cancela el destino.
    const intencion = teclado.dx !== 0 || teclado.dy !== 0 ? teclado : joystick
    if (modo === 'vida') {
      const tocado = this.tactil?.tomarDestino()
      if (intencion.dx !== 0 || intencion.dy !== 0) this.seguidor.cancelar()
      else if (tocado && !tiempoDetenido(partida.estado)) {
        const e = partida.estado
        this.seguidor.fijar(e, e.personaje, {
          x: tocado.x / TAM_CASILLA,
          y: tocado.y / TAM_CASILLA,
        })
      }
      // Con el tiempo detenido (pausa) el personaje no se mueve: el destino se cancela.
      if (tiempoDetenido(partida.estado)) this.seguidor.cancelar()
      for (const c of comandosMovimiento(intencion, ms)) emitir(c)
      for (const c of this.seguidor.comandos(partida.estado.personaje, ms)) emitir(c)
    } else {
      // Plano: las teclas desplazan la cámara y `+`/`-` hacen zoom; el personaje no se mueve.
      const s = ms / 1000
      // La diagonal no es más rápida que los ejes.
      const norma = intencion.dx !== 0 && intencion.dy !== 0 ? Math.SQRT1_2 : 1
      const v = CONFIG_CAMARA.velocidadTecladoPx * s * norma
      this.control?.desplazar(intencion.dx * v, intencion.dy * v)
      this.control?.zoomCentro(
        Math.pow(CONFIG_CAMARA.zoomTeclaPorSegundo, this.entrada.leerZoom() * s),
      )
    }
    const { velocidad } = partida.estado
    const minutos = this.tiempo.acumular(
      ms * this.acelerar,
      velocidad,
      tiempoDetenido(partida.estado),
    )
    if (minutos > 0) emitir({ tipo: 'AvanzarTiempo', minutos })
    this.luz?.actualizar(partida.estado.minutoDelDia)
    const destino = this.seguidor.destino
    if (destino) this.marca?.mostrar(destino.x * TAM_CASILLA, destino.y * TAM_CASILLA)
    else this.marca?.ocultar()
    const p = partida.estado.personaje
    this.vista?.colocar(p)
    const punto = { x: p.x * TAM_CASILLA, y: p.y * TAM_CASILLA }
    const real = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 1000) : 0
    // Tras un desmayo el personaje reaparece lejos: la cámara salta, sin barrido.
    if (this.desmayoVisto) {
      this.desmayoVisto = false
      this.control?.centrarEn(punto)
    }
    // El suavizado de la cámara usa el tiempo real (no el acotado del juego): con pocos fps
    // alcanza igual al personaje en el mismo tiempo.
    else this.control?.seguir(punto, real)
    this.control?.avanzarGuia(real)
  }

  /** Cámara y teclado según el modo: Vida sigue al personaje (suave, aunque esté quieto); Plano queda libre. */
  private aplicarModo(modo: ModoJuego): void {
    this.modoAplicado = modo
    this.entrada?.soltar()
    // En Plano no hay ruta ni joystick: el destino se cancela (no se congela, para no sorprender
    // al volver) y los gestos de un dedo pasan a la cámara.
    this.seguidor.cancelar()
    this.tactil?.reiniciar()
    if (this.tactil) this.tactil.activo = modo === 'vida'
    this.selector?.reiniciar()
    if (this.selector) this.selector.activo = modo === 'plano'
    if (!this.control) return
    const enVida = modo === 'vida'
    this.control.arrastreActivo = !enVida || ARRASTRE_EN_MODO_VIDA
    this.control.seguirActivo = enVida
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
    this.resalte?.destroy()
    this.resalte = undefined
    this.desuscribirSeleccion?.()
    this.desuscribirSeleccion = undefined
    this.scale.off('resize', this.alRedimensionar, this)
    this.quitarEsc?.()
    this.quitarEsc = undefined
    this.selector = undefined
    this.vista?.destruir()
    this.vista = undefined
    this.luz?.destruir()
    this.luz = undefined
    this.entrada = undefined
    this.control = undefined
    this.tactil = undefined
    this.desuscribir?.()
    this.desuscribir = undefined
    this.marca?.destruir()
    this.marca = undefined
    this.seguidor.cancelar()
  }
}
