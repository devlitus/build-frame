import Phaser from 'phaser'
import {
  aplicarComando,
  casillasOcupadas,
  casillasRio,
  crearEstadoInicial,
  defEdificio,
  huellaDe,
  ladoValle,
  tiempoDetenido,
  type Comando,
  type EstadoJuego,
  type ModoJuego,
} from '../../core'
import { CONFIG_CAMARA } from '../camara/config'
import { ControlCamara } from '../camara/controlCamara'
import { conPropiasDeDepuracion } from '../valle/debug'
import type { EstadoVisualParcela } from '../valle/estadoVisual'
import { VistaParcelas } from '../valle/vistaParcelas'
import { VistaPincel } from '../valle/vistaPincel'
import { CLAVE_TEXTOS_LIENZO, type TextosLienzo } from '../textosLienzo'
import { VistaEdificios, type EdificioVisible } from '../valle/vistaEdificios'
import { VistaSilueta } from '../valle/vistaSilueta'
import { ColocadorEdificio } from '../colocador'
import { casillaInicialSilueta, sePuedeColocar, type Construccion } from '../construir'
import { VistaZonas } from '../valle/vistaZonas'
import {
  casillaEnCentroDeVista,
  casillaMasCercana,
  type Casilla,
  type DireccionCasilla,
  type Pincel,
  type RectCasillas,
} from '../pincel'
import { PintorZonas } from '../pintorZonas'
import { dibujarResalte, dibujarResalteEdificio, tamanoMundoPx } from '../valle/dibujar'
import { cargarArte } from '../valle/arte'
import { ordenarDecoracion, pintarTrozoTerreno } from '../valle/terrenoArte'
import { mundoDePantalla, pantallaLogica, zoomLogico } from '../resolucion'
import { medirReservasHud } from '../areaHud'
import type { RectPantalla } from '../seleccion'
import { areaLibre, centroParaVer, parcelaEnPunto, puntoDeToque, rectParcela } from '../picking'
import { parcelaEnCentroDeVista, parcelaVecina, type DireccionParcela } from '../cursorParcela'
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
  /** Solo depuración: dinero con el que empieza la partida. */
  readonly dinero?: number
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
  private dineroDepuracion: number | undefined = undefined
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
      ...(this.dineroDepuracion === undefined ? {} : { dinero: this.dineroDepuracion }),
    }
  }
  private partidaCompartida(): Partida {
    if (!this._partida) throw new Error('La escena no se ha iniciado')
    return this._partida
  }

  private hornear: () => Phaser.GameObjects.RenderTexture[] = () => []
  private trozos: Phaser.GameObjects.RenderTexture[] = []
  private parcelas: VistaParcelas | undefined = undefined
  private resalte: Phaser.GameObjects.Graphics | undefined = undefined
  private selector: SelectorParcela | undefined = undefined
  private zonas: VistaZonas | undefined = undefined
  private vistaPincel: VistaPincel | undefined = undefined
  private pintor: PintorZonas | undefined = undefined
  private desuscribirPincel: (() => void) | undefined = undefined
  private edificios: VistaEdificios | undefined = undefined
  private vistaSilueta: VistaSilueta | undefined = undefined
  private colocador: ColocadorEdificio | undefined = undefined
  private desuscribirConstruccion: (() => void) | undefined = undefined
  /** Ayuda del lienzo vigente (qué barra o panel está abierto), para no repetirla. */
  private ayudaClave: string | undefined = undefined
  private desuscribirSeleccion: (() => void) | undefined = undefined
  /** Clave de la última guía de cámara (parcela y panel), para no repetirla. */
  private claveGuia = ''
  /** Fotograma pendiente de la guía tras redimensionar. */
  private idFotograma: number | undefined = undefined
  private quitarEsc: (() => void) | undefined = undefined
  private quitarTeclasLienzo: (() => void) | undefined = undefined

  constructor() {
    super('valle')
  }

  /** Carga el arte final (terreno, objetos, edificios, zonas y protagonista); lo ya cargado se salta. */
  preload(): void {
    cargarArte(this)
  }

  init(datos: DatosEscenaValle): void {
    this.semilla = datos.semilla
    this._partida = datos.partida
    this.propias = datos.propias ?? []
    this.en = datos.en
    this.acelerar = datos.acelerar ?? 1
    this.seleccionInicial = datos.seleccion
    this.dineroDepuracion = datos.dinero
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
    // Solo depuración (`?debug&dinero=N`): se sustituyen los ahorros del estado inicial.
    if (this.dineroDepuracion !== undefined) inicial = { ...inicial, dinero: this.dineroDepuracion }
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

    // Terreno y decoración no cambian: se hornean a texturas por trozos (M1-04).
    const decoracion = inicial.obstaculos
    const ordenada = ordenarDecoracion(decoracion)
    const semilla = this.semilla
    this.hornear = () =>
      hornearCapaBase(this, this.mundoPx, (rt, trozo) =>
        pintarTrozoTerreno(this, rt, trozo, { valle, rio, vados, decoracion, semilla }, ordenada),
      )
    this.trozos = this.hornear()
    // Al perder y recuperar el contexto WebGL las texturas quedan vacías (Phaser no las
    // restaura): se vuelven a hornear con los mismos datos.
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.rehornear, this)
    }
    // Las parcelas (36 bordes y tintes) cambian al comprar: viven en su propio Graphics, que se
    // redibuja (sin rehornear el valle) cuando cambian valle, dinero, compras o modo.
    this.parcelas?.destruir()
    this.parcelas = new VistaParcelas(this)
    this.parcelas.repintar(inicial)
    // Zonas (M4-04): capa horneada por trozos, aparte del terreno; solo se rehornea el trozo que cambia.
    this.zonas?.destruir()
    this.zonas = new VistaZonas(this, this.mundoPx, ladoValle(valle), this.semilla)
    this.zonas.actualizar(inicial)
    this.vistaPincel?.destruir()
    this.vistaPincel = new VistaPincel(this)
    // Edificios y obras (M4-05): un Graphics por edificio, ordenados por Y como el personaje.
    this.edificios?.destruir()
    const textos = this.registry.get(CLAVE_TEXTOS_LIENZO) as TextosLienzo | undefined
    this.edificios = new VistaEdificios(this, textos?.cartelObra ?? ((dias) => String(dias)))
    this.edificios.actualizar(inicial, zoomLogico(this))
    this.vistaSilueta?.destruir()
    this.vistaSilueta = new VistaSilueta(this)
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
      // Zonas y edificios se redibujan en cuanto cambian (no esperan al siguiente fotograma): así la
      // vista y los ganchos de prueba no se desfasan del estado de la partida.
      if (cambio.eventos.length > 0) {
        this.zonas?.actualizar(partida.estado)
        this.edificios?.actualizar(partida.estado, zoomLogico(this))
      }
      if (cambio.eventos.some((e) => e.tipo === 'desmayo')) {
        this.seguidor.cancelar()
        this.desmayoVisto = true
      }
    })
    this.selector = new SelectorParcela(this, (p) => {
      // Tras comprar, el segundo clic de un doble clic no debe cambiar la selección.
      if (partida.seleccion.clicsBloqueados()) return
      // Un clic sobre un edificio (u obra) lo selecciona; fuera de él, la parcela.
      const edificio = this.edificioEn(p)
      if (edificio !== undefined) {
        partida.edificioSeleccionado.seleccionar(edificio)
        return
      }
      const g = this.geometria()
      const i = g ? parcelaEnPunto(g, p.x, p.y) : undefined
      // Tocar fuera del valle deselecciona; tocar la misma parcela la mantiene.
      if (i === undefined) {
        partida.seleccion.deseleccionar()
        partida.edificioSeleccionado.deseleccionar()
      } else partida.seleccion.seleccionar(i)
    })
    this.selector.activo = inicial.modo === 'plano'
    partida.pincel.cerrar()
    partida.construccion.cerrar()
    this.pintor?.reiniciar()
    this.pintor = new PintorZonas(this, partida.pincel, ladoValle(valle), TAM_CASILLA, (rect) =>
      this.aplicarPincel(rect),
    )
    this.colocador?.reiniciar()
    this.colocador = new ColocadorEdificio(
      this,
      partida.construccion,
      ladoValle(valle),
      TAM_CASILLA,
      () => this.alClicRatonConstruir(),
    )
    this.desuscribirPincel?.()
    this.desuscribirPincel = partida.pincel.suscribir(() => this.alCambiarHerramienta())
    this.desuscribirConstruccion?.()
    this.desuscribirConstruccion = partida.construccion.suscribir(() => {
      this.alCambiarHerramienta()
      this.situarSilueta()
    })
    this.desuscribirSeleccion?.()
    this.claveGuia = ''
    const bajaParcela = partida.seleccion.suscribir(() => this.alCambiarSeleccion())
    const bajaEdificio = partida.edificioSeleccionado.suscribir(() => this.alCambiarSeleccion())
    this.desuscribirSeleccion = () => {
      bajaParcela()
      bajaEdificio()
    }
    // Al girar o redimensionar, el panel y las reservas se vuelven a medir en el DOM: la guía se
    // repite en el siguiente fotograma, cuando ya están al día.
    this.scale.off('resize', this.alRedimensionar, this)
    this.scale.on('resize', this.alRedimensionar, this)
    this.quitarEsc?.()
    const alEsc = (): void => {
      // Modo Construir: Esc cancela la confirmación y, si no hay, sale del modo.
      if (partida.construccion.abierto) {
        if (partida.construccion.cancelarConfirmacion()) return
        document.getElementById('juego')?.focus({ preventScroll: true })
        partida.construccion.cerrar()
        return
      }
      // Con el pincel de zonas, Esc suelta primero la esquina marcada y luego el cursor.
      if (partida.pincel.cancelarTeclado()) return
      // Sin nada marcado, Esc cierra la barra (como «Listo») y el foco vuelve al lienzo.
      if (partida.pincel.abierto) {
        document.getElementById('juego')?.focus({ preventScroll: true })
        partida.pincel.cerrar()
        return
      }
      // Con una confirmación abierta (compra, demoler, cancelar obra), el primer Esc solo la cancela.
      if (partida.edificioSeleccionado.cancelarConfirmacion()) return
      if (partida.seleccion.cancelarConfirmacion()) return
      partida.seleccion.deseleccionar()
      partida.edificioSeleccionado.deseleccionar()
    }
    const teclado = this.input.keyboard
    teclado?.on('keydown-ESC', alEsc)
    this.quitarEsc = () => teclado?.off('keydown-ESC', alEsc)
    // Plano sin ratón: Enter o Espacio eligen la parcela del centro y las flechas mueven la elección.
    this.quitarTeclasLienzo?.()
    const lienzo = this.game.canvas
    const contenedor = lienzo.parentElement
    contenedor?.addEventListener('keydown', this.alTeclaLienzo)
    this.quitarTeclasLienzo = () => contenedor?.removeEventListener('keydown', this.alTeclaLienzo)
    this.ajustarLienzoAccesible(inicial.modo)
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
    this.alCambiarHerramienta()
    // Los márgenes de la cámara se fijan explícitamente al terminar de crear (Plano: los del panel y el HUD).
    this.actualizarMargenes()
    const sel = this.seleccionInicial
    if (sel !== undefined && !enVida && sel < valle.parcelas.length) {
      partida.seleccion.seleccionar(sel)
    }
  }

  /** Veces que se ha redibujado el Graphics de parcelas (ganchos de prueba). */
  get repintadosParcelas(): number {
    return this.parcelas?.repintados ?? 0
  }

  /** Estado visual con el que se pintó la parcela `i` la última vez. */
  estadoVisual(i: number): EstadoVisualParcela | undefined {
    return this.parcelas?.estadoVisual(i)
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
    const pantalla = pantallaLogica(this)
    const libre = this.zonaLibre(pantalla)
    return puntoDeToque(c.vista, pantalla, libre, rectParcela(g, i))
  }

  /** Zona de pantalla que no tapan ni el HUD ni los paneles. Consulta pura. */
  private zonaLibre(pantalla: { ancho: number; alto: number }): RectPantalla {
    return areaLibre(pantalla, this._partida?.seleccion.ocupado, medirReservasHud())
  }

  /**
   * Pone al día los márgenes de la cámara del Modo Plano: el valle puede pasar de su borde lo que
   * tapa la interfaz, para ver lo que queda debajo (más un poco de aire). En Vida no hay márgenes.
   * Se llama cuando cambian la selección, el modo, el tamaño o las guías (nunca desde una consulta).
   */
  private actualizarMargenes(): void {
    if (!this.control) return
    const pantalla = pantallaLogica(this)
    const libre = this.zonaLibre(pantalla)
    const h = CONFIG_CAMARA.holguraBordePx
    this.control.fijarMargenes(
      this.modoAplicado === 'plano'
        ? {
            arriba: libre.y + h,
            abajo: Math.max(0, pantalla.alto - libre.y - libre.alto) + h,
            izq: libre.x + h,
            der: Math.max(0, pantalla.ancho - libre.x - libre.ancho) + h,
          }
        : undefined,
    )
  }

  /** La cámara se desliza (guía o vuelta de la extensión): gancho de prueba. */
  guiando(): boolean {
    return this.control?.guiando ?? false
  }

  /** Centra la cámara en la casilla (cx, cy) (ganchos de prueba). */
  centrarCamaraEn(cx: number, cy: number): void {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return
    // Un centrado explícito gana al salto pendiente del desmayo.
    this.desmayoVisto = false
    this.control?.centrarEn({ x: (cx + 0.5) * TAM_CASILLA, y: (cy + 0.5) * TAM_CASILLA })
  }

  /** Punto de pantalla (px) del centro de la casilla (cx, cy); undefined si queda fuera de la zona libre. */
  puntoClicCasilla(cx: number, cy: number): { x: number; y: number } | undefined {
    const c = this.control
    if (!c || !this._partida || !Number.isInteger(cx) || !Number.isInteger(cy)) return undefined
    const pantalla = pantallaLogica(this)
    const libre = this.zonaLibre(pantalla)
    const celda = {
      x: cx * TAM_CASILLA,
      y: cy * TAM_CASILLA,
      ancho: TAM_CASILLA,
      alto: TAM_CASILLA,
    }
    return puntoDeToque(c.vista, pantalla, libre, celda)
  }

  /** ¿Tiene el foco el lienzo (o su contenedor)? Solo entonces Enter, Espacio y flechas eligen parcela. */
  private focoEnLienzo(): boolean {
    const a = document.activeElement
    return a !== null && (a === this.game.canvas || a === this.game.canvas.parentElement)
  }

  private readonly alTeclaLienzo = (ev: KeyboardEvent): void => {
    const partida = this._partida
    const g = this.geometria()
    if (!partida || !g || !this.control || this.modoAplicado !== 'plano') return
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) return
    // Solo con el foco en el lienzo: en los botones del panel y del HUD Enter y Espacio son suyos.
    if (ev.target !== this.game.canvas && ev.target !== this.game.canvas.parentElement) return
    const seleccion = partida.seleccion
    const pincel = partida.pincel
    // Con el modo Construir abierto el teclado es de la silueta (y del panel, si tiene el foco).
    if (partida.construccion.abierto) {
      this.teclaConstruir(ev, partida.construccion)
      return
    }
    // Con la barra de zonas abierta el teclado es del pincel: ni se elige parcela ni se mueve la selección.
    if (pincel.abierto) {
      this.teclaPincel(ev, pincel)
      return
    }
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') {
      ev.preventDefault()
      if (ev.repeat) return
      // Con el cursor en el centro de la vista: si hay un edificio ahí se elige; si no, la parcela.
      const edificio = this.edificioEnCentroDeVista()
      if (edificio !== undefined) {
        partida.edificioSeleccionado.seleccionar(edificio)
        return
      }
      if (seleccion.indice !== undefined || partida.edificioSeleccionado.id !== undefined) return
      seleccion.seleccionar(parcelaEnCentroDeVista(g, this.control.vista))
      return
    }
    const direccion: Record<string, DireccionParcela | undefined> = {
      ArrowUp: 'arriba',
      ArrowDown: 'abajo',
      ArrowLeft: 'izquierda',
      ArrowRight: 'derecha',
    }
    const d = direccion[ev.code]
    const actual = seleccion.indice
    // Sin selección las flechas siguen moviendo la cámara.
    if (!d || actual === undefined) return
    ev.preventDefault()
    seleccion.seleccionar(parcelaVecina(g.parcelasPorLado, actual, d))
  }

  /** Teclado del pincel: Enter o Espacio marcan esquinas y las flechas mueven el cursor de casilla. */
  private teclaPincel(ev: KeyboardEvent, pincel: Pincel): void {
    const partida = this._partida
    if (!partida || !this.control) return
    const lado = ladoValle(partida.estado.valle)
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') {
      ev.preventDefault()
      if (ev.repeat) return
      const centro = casillaEnCentroDeVista(lado, TAM_CASILLA, this.control.vista)
      const rect = pincel.pulsarMarca(centro)
      if (rect) this.aplicarPincel(rect)
      else this.verCursor()
      return
    }
    const direccion: Record<string, DireccionCasilla | undefined> = {
      ArrowUp: 'arriba',
      ArrowDown: 'abajo',
      ArrowLeft: 'izquierda',
      ArrowRight: 'derecha',
    }
    const d = direccion[ev.code]
    // Sin cursor las flechas siguen moviendo la cámara.
    if (!d || !pincel.moverCursor(lado, d)) return
    ev.preventDefault()
    this.verCursor()
  }

  /** Teclado de la silueta: las flechas la mueven y Enter o Espacio piden la confirmación si se puede colocar. */
  private teclaConstruir(ev: KeyboardEvent, construccion: Construccion): void {
    const partida = this._partida
    // Sin edificio elegido (catálogo) o confirmando, el teclado es del panel.
    if (!partida || !construccion.activo) return
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') {
      ev.preventDefault()
      if (ev.repeat) return
      // En su mismo sitio (mover) Enter no hace nada: el modo sigue abierto.
      if (!sePuedeColocar(partida.silueta())) return
      // Mover es gratis: Enter lo hace; construir pide antes la confirmación.
      if (construccion.origen !== undefined) partida.moverAqui()
      else construccion.pedirConfirmacion('teclado')
      return
    }
    const direccion: Record<string, DireccionCasilla | undefined> = {
      ArrowUp: 'arriba',
      ArrowDown: 'abajo',
      ArrowLeft: 'izquierda',
      ArrowRight: 'derecha',
    }
    const d = direccion[ev.code]
    if (!d || !construccion.mover(ladoValle(partida.estado.valle), d)) return
    ev.preventDefault()
    this.verSilueta()
  }

  /** Clic con el ratón sobre el valle: si la silueta se puede colocar, pide la confirmación. */
  private alClicRatonConstruir(): void {
    const partida = this._partida
    // Al mover, el botón «Mover aquí» confirma; el clic solo coloca la silueta.
    if (partida?.construccion.origen !== undefined) return
    if (partida?.silueta()?.resultado.valida) partida.construccion.pedirConfirmacion('puntero')
  }

  /** `id` del edificio u obra que cubre el punto (px del mundo), o undefined. */
  private edificioEn(punto: { x: number; y: number }): number | undefined {
    const s = this._partida?.estado
    if (!s) return undefined
    const lado = ladoValle(s.valle)
    const cx = Math.floor(punto.x / TAM_CASILLA)
    const cy = Math.floor(punto.y / TAM_CASILLA)
    if (cx < 0 || cy < 0 || cx >= lado || cy >= lado) return undefined
    return casillasOcupadas(s.edificios, lado).get(cy * lado + cx)
  }

  /** Edificio bajo el centro de la vista (el cursor del teclado en el Modo Plano), o undefined. */
  private edificioEnCentroDeVista(): number | undefined {
    const v = this.control?.vista
    return v && this.edificioEn({ x: v.cx, y: v.cy })
  }

  /** Casilla en el centro de la zona libre (sin HUD ni panel), donde aparece la silueta al elegir un edificio. */
  private casillaCentroLibre(): Casilla {
    const partida = this._partida
    if (!partida || !this.control) return { x: 0, y: 0 }
    const lado = ladoValle(partida.estado.valle)
    const pantalla = pantallaLogica(this)
    const libre = this.zonaLibre(pantalla)
    const m = mundoDePantalla(this, libre.x + libre.ancho / 2, libre.y + libre.alto / 2)
    return casillaMasCercana(lado, TAM_CASILLA, m.x, m.y) ?? { x: 0, y: 0 }
  }

  /** Al elegir un edificio la silueta aparece en el centro de la zona libre. */
  private situarSilueta(): void {
    const c = this._partida?.construccion
    if (!c?.activo || c.centro || !this._partida || c.tipo === undefined) return
    c.colocar(casillaInicialSilueta(this._partida.estado, c.tipo, this.casillaCentroLibre()))
  }

  /** Si la silueta queda fuera de la zona libre (o bajo el panel), la cámara la busca. */
  private verSilueta(): void {
    const partida = this._partida
    const s = partida?.silueta()
    if (!partida || !s || !this.control) return
    this.actualizarMargenes()
    const pantalla = pantallaLogica(this)
    const libre = this.zonaLibre(pantalla)
    const rect = {
      x: s.x * TAM_CASILLA,
      y: s.y * TAM_CASILLA,
      ancho: s.ancho * TAM_CASILLA,
      alto: s.alto * TAM_CASILLA,
    }
    const centro = centroParaVer(this.control.vista, pantalla, libre, rect)
    if (centro) this.control.guiarA(centro, false)
  }

  /** Si el cursor de casilla queda fuera de la zona libre (o bajo la barra), la cámara lo busca. */
  private verCursor(): void {
    const partida = this._partida
    const c = partida?.pincel.cursor
    if (!partida || !c || !this.control) return
    this.actualizarMargenes()
    const pantalla = pantallaLogica(this)
    const libre = this.zonaLibre(pantalla)
    const celda = {
      x: c.x * TAM_CASILLA,
      y: c.y * TAM_CASILLA,
      ancho: TAM_CASILLA,
      alto: TAM_CASILLA,
    }
    const centro = centroParaVer(this.control.vista, pantalla, libre, celda)
    if (centro) this.control.guiarA(centro, false)
  }

  /** Aplica el rectángulo del pincel con los comandos del núcleo; si no cambia nada, avisa con amabilidad. */
  private aplicarPincel(rect: RectCasillas): void {
    const partida = this._partida
    const h = partida?.pincel.herramienta
    if (!partida || !h) return
    const r = partida.emitir(
      h === 'borrar' ? { tipo: 'BorrarZona', ...rect } : { tipo: 'PintarZona', ...rect, zona: h },
    )
    if (!r.ok && r.error === 'sin-casillas-validas') partida.avisarInterfaz('zona-sin-casillas')
  }

  /**
   * Cambios del pincel o del modo Construir: la cámara solo arrastra con dos dedos mientras se pinta
   * o se coloca, y se elige parcela solo con ambos cerrados.
   */
  private alCambiarHerramienta(): void {
    const partida = this._partida
    if (!partida) return
    const { pincel, construccion } = partida
    if (this.control) {
      this.control.dedosParaArrastrar = pincel.activo || construccion.activo ? 2 : 1
    }
    if (this.selector) {
      this.selector.activo =
        this.modoAplicado === 'plano' && !pincel.abierto && !construccion.abierto
    }
    if (pincel.abierto || construccion.abierto) partida.seleccion.deseleccionar()
    // La ayuda del lienzo solo depende de qué está abierto: no se recalcula al arrastrar ni al mover la silueta.
    const clave = pincel.abierto
      ? 'zonas'
      : construccion.abierto
        ? construccion.origen === undefined
          ? 'construir'
          : 'mover'
        : ''
    if (clave !== this.ayudaClave) {
      this.ayudaClave = clave
      this.ajustarLienzoAccesible(this.modoAplicado)
    }
  }

  /** Alfa de la capa de zonas (gancho de prueba); undefined sin capa. */
  alfaZonas(): number | undefined {
    return this.zonas?.alfaVisible
  }

  /**
   * En Plano el lienzo entra en el orden de tabulación, con su ayuda para lectores de pantalla;
   * en Vida no (el teclado del juego funciona con el foco en cualquier sitio).
   */
  private ajustarLienzoAccesible(modo: ModoJuego): void {
    const lienzo = this.game.canvas
    const contenedor = lienzo.parentElement
    if (modo === 'plano') {
      lienzo.tabIndex = 0
      lienzo.setAttribute('aria-labelledby', 'juego')
      lienzo.setAttribute(
        'aria-describedby',
        this._partida?.pincel.abierto
          ? 'ayuda-plano ayuda-zonas'
          : this._partida?.construccion.abierto
            ? this._partida.construccion.origen === undefined
              ? 'ayuda-plano ayuda-construir'
              : 'ayuda-plano ayuda-mover'
            : 'ayuda-plano',
      )
      if (contenedor) contenedor.dataset['modo'] = 'plano'
    } else {
      if (document.activeElement === lienzo) contenedor?.focus({ preventScroll: true })
      lienzo.removeAttribute('tabindex')
      lienzo.removeAttribute('aria-labelledby')
      lienzo.removeAttribute('aria-describedby')
      if (contenedor) delete contenedor.dataset['modo']
    }
  }

  private alRedimensionar(): void {
    this.claveGuia = ''
    this.actualizarMargenes()
    if (this.idFotograma !== undefined) cancelAnimationFrame(this.idFotograma)
    this.idFotograma = requestAnimationFrame(() => {
      this.idFotograma = undefined
      if (this.control) this.alCambiarSeleccion()
    })
  }

  /** Redibuja el contorno y, si la parcela queda tapada por el panel o el HUD, la deja a la vista. */
  private alCambiarSeleccion(): void {
    const partida = this._partida
    const g = this.geometria()
    if (!partida || !g) return
    // El panel o las reservas del HUD pueden haber cambiado: los márgenes de la cámara se ponen al día.
    this.actualizarMargenes()
    const i = partida.seleccion.indice
    const idEdificio = partida.edificioSeleccionado.id
    const edificio =
      idEdificio === undefined
        ? undefined
        : partida.estado.edificios.find((e) => e.id === idEdificio)
    const defSel = edificio && defEdificio(edificio.tipo)
    const huella = edificio && defSel ? huellaDe(defSel, edificio.x, edificio.y) : undefined
    if (this.resalte) {
      if (huella) dibujarResalteEdificio(this.resalte, huella)
      else dibujarResalte(this.resalte, partida.estado.valle, i)
    }
    // Al mover, la silueta empieza donde está el edificio: si queda tapada por el panel, la cámara la busca.
    const moviendo = partida.construccion.origen
    if (partida.construccion.activo && partida.construccion.centro) {
      const o = partida.seleccion.ocupado
      const clave =
        (moviendo !== undefined ? 'm' + moviendo : 'c' + partida.construccion.tipo) +
        '|' +
        (o ? `${o.x},${o.y},${o.ancho},${o.alto}` : '')
      if (clave !== this.claveGuia) {
        this.claveGuia = clave
        this.verSilueta()
      }
      return
    }
    if (i === undefined && !huella) {
      this.claveGuia = ''
      this.control?.soltarExtension()
      return
    }
    // Al girar, el panel avisa antes de que el lienzo cambie de tamaño: guiar con medidas a medias
    // mandaría la cámara a un sitio absurdo. Se espera al evento `resize` (que repite la guía).
    // Esta guarda compara con la pantalla lógica (CSS): el lienzo mide CSS × factor de resolución (`juego.ts`).
    const padre = this.game.canvas.parentElement
    const medida = pantallaLogica(this)
    if (
      padre &&
      (Math.abs(padre.clientWidth - medida.ancho) > 1 ||
        Math.abs(padre.clientHeight - medida.alto) > 1)
    )
      return
    const o = partida.seleccion.ocupado
    // Las reservas del HUD cambian (p. ej. con el aviso de compra): entran en la clave para que
    // la guía se repita cuando aparecen o desaparecen, igual que con el panel.
    const reservas = medirReservasHud()
    const sujeto = huella ? 'e' + idEdificio : String(i)
    const clave = `${sujeto}|${o ? `${o.x},${o.y},${o.ancho},${o.alto}` : ''}|${reservas.arriba},${reservas.abajo}`
    if (clave === this.claveGuia || !this.control) return
    this.claveGuia = clave
    const pantalla = pantallaLogica(this)
    const objetivo = huella
      ? {
          x: huella.x0 * TAM_CASILLA,
          y: huella.y0 * TAM_CASILLA,
          ancho: (huella.x1 - huella.x0 + 1) * TAM_CASILLA,
          alto: (huella.y1 - huella.y0 + 1) * TAM_CASILLA,
        }
      : i === undefined
        ? undefined
        : rectParcela(g, i)
    if (!objetivo) return
    const centro = centroParaVer(
      this.control.vista,
      pantalla,
      areaLibre(pantalla, o, reservas),
      objetivo,
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
    const teclado = this.entrada.leer(
      modo === 'plano' &&
        (partida.seleccion.indice !== undefined ||
          partida.pincel.cursor !== undefined ||
          partida.construccion.activo) &&
        this.focoEnLienzo(),
    )
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
    this.parcelas?.repintar(partida.estado)
    this.zonas?.actualizar(partida.estado)
    this.vistaPincel?.actualizar(partida.pincel)
    this.edificios?.actualizar(partida.estado, zoomLogico(this))
    this.vistaSilueta?.actualizar(partida.silueta())
    const destino = this.seguidor.destino
    if (destino) this.marca?.mostrar(destino.x * TAM_CASILLA, destino.y * TAM_CASILLA)
    else this.marca?.ocultar()
    const p = partida.estado.personaje
    this.vista?.colocar(p, ms)
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
    this.pintor?.reiniciar()
    this.colocador?.reiniciar()
    if (this.selector) {
      this.selector.activo =
        modo === 'plano' && !this._partida?.pincel.abierto && !this._partida?.construccion.abierto
    }
    this.ajustarLienzoAccesible(modo)
    if (!this.control) return
    const enVida = modo === 'vida'
    this.control.arrastreActivo = !enVida || ARRASTRE_EN_MODO_VIDA
    this.control.seguirActivo = enVida
    this.actualizarMargenes()
  }

  private rehornear(): void {
    for (const t of this.trozos) t.destroy()
    this.trozos = this.hornear()
    this.zonas?.invalidar()
    this.edificios?.invalidar()
  }

  /** Edificios que se ven ahora (ganchos de prueba). */
  edificiosVisibles(): readonly EdificioVisible[] {
    return this.edificios?.visibles ?? []
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
    this.parcelas?.destruir()
    this.parcelas = undefined
    this.zonas?.destruir()
    this.zonas = undefined
    this.vistaPincel?.destruir()
    this.vistaPincel = undefined
    this.edificios?.destruir()
    this.edificios = undefined
    this.vistaSilueta?.destruir()
    this.vistaSilueta = undefined
    this.desuscribirPincel?.()
    this.desuscribirPincel = undefined
    this.desuscribirConstruccion?.()
    this.desuscribirConstruccion = undefined
    this.pintor?.reiniciar()
    this.pintor = undefined
    this.colocador?.reiniciar()
    this.colocador = undefined
    this.resalte?.destroy()
    this.resalte = undefined
    this.desuscribirSeleccion?.()
    this.desuscribirSeleccion = undefined
    this.scale.off('resize', this.alRedimensionar, this)
    if (this.idFotograma !== undefined) cancelAnimationFrame(this.idFotograma)
    this.idFotograma = undefined
    this.quitarEsc?.()
    this.quitarEsc = undefined
    this.quitarTeclasLienzo?.()
    this.quitarTeclasLienzo = undefined
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
