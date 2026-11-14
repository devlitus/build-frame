import Phaser from 'phaser'
import { CONFIG_CAMARA, limitesZoom, zoomInicial } from './config'
import {
  acercar,
  factorPellizco,
  limitarVista,
  limitarZoom,
  type Extension,
  type Margenes,
  medirDedos,
  transformar,
  type Pantalla,
  type Punto,
  type Vista,
} from './matematica'
import { factorDe, pantallaLogica } from '../resolucion'

interface Medida {
  readonly ids: readonly number[]
  readonly medio: Punto
  readonly distancia: number
}

/** Qué hace la cámara; se puede cambiar en caliente (Modo Vida sigue, Modo Plano arrastra). */
export interface OpcionesCamara {
  /** La cámara persigue al objetivo que se le indica con `seguir()`. */
  seguir: boolean
  /** Un puntero (ratón o un dedo) desplaza la cámara; el pellizco y la rueda siempre hacen zoom. */
  arrastre: boolean
}

/**
 * Cámara del valle: seguimiento del personaje, arrastre con un puntero, pellizco con dos y
 * rueda del ratón. Todo el cálculo está en `matematica.ts`; aquí solo se leen los punteros y se aplica.
 */
export class ControlCamara {
  private readonly opciones: OpcionesCamara
  /** Punteros necesarios para desplazar la vista: 2 mientras el pincel de zonas pinta con uno. */
  private _dedosParaArrastrar: 1 | 2 = 1
  private previa: Medida | undefined = undefined
  private objetivo: Punto | undefined = undefined
  private persiguiendo = false
  /** Centro (mundo, px) al que la vista se desliza suavemente; lo cancela cualquier gesto. */
  private guia: Punto | undefined = undefined
  /**
   * Objetivo de la última guía: amplía el rango del centro mientras haya parcela elegida, para
   * que las de borde o esquina puedan quedar fuera del panel. Se borra al soltarla y llegar,
   * con un gesto del usuario o al pasar a Vida.
   */
  private extension: Punto | undefined = undefined
  /** Márgenes permanentes del Modo Plano (undefined en Vida): ver `Margenes`. */
  private margenes: Margenes | undefined = undefined
  /** La vista está fuera de los límites tras reducirse los márgenes y se desliza de vuelta. */
  private recolocando = false
  /** La extensión se está soltando: la vista vuelve suavemente a los límites normales. */
  private soltando = false
  /** Última vista aplicada: al redimensionar se conserva su centro. */
  private actual: Vista = { zoom: 1, cx: 0, cy: 0 }

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly mundoPx: number,
    opciones: OpcionesCamara = { seguir: false, arrastre: true },
    inicio: Punto = { x: mundoPx / 2, y: mundoPx / 2 },
    objetivoInicial?: Punto,
  ) {
    this.opciones = { ...opciones }
    const input = escena.input
    input.on('pointerdown', this.alCambiar, this)
    input.on('pointermove', this.alCambiar, this)
    input.on('pointerup', this.alCambiar, this)
    input.on('pointerupoutside', this.alCambiar, this)
    input.on('wheel', this.alRueda, this)
    // Sin objetivo inicial no se persigue: el seguimiento arranca cuando el objetivo se mueve.
    this.objetivo = objetivoInicial
    escena.scale.on('resize', this.alRedimensionar, this)
    escena.events.once('shutdown', this.destruir, this)
    this.aplicar({
      zoom: zoomInicial(this.pantalla, this.mundoPx),
      cx: inicio.x,
      cy: inicio.y,
    })
  }

  set seguirActivo(v: boolean) {
    this.opciones.seguir = v
    if (v) {
      this.persiguiendo = true
      this.guia = undefined
      this.borrarExtension()
    }
  }

  set arrastreActivo(v: boolean) {
    this.opciones.arrastre = v
    if (!v) this.previa = undefined
  }

  set dedosParaArrastrar(n: 1 | 2) {
    this._dedosParaArrastrar = n
  }

  /**
   * Seguimiento suave hacia `objetivo` (px del mundo); se llama cada fotograma. Persigue solo
   * mientras el objetivo se mueve y hasta alcanzarlo, para no deshacer un desplazamiento
   * manual con el personaje quieto. `delta` en ms.
   */
  seguir(objetivo: Punto, delta: number): void {
    const o = this.objetivo
    if (!o || o.x !== objetivo.x || o.y !== objetivo.y) {
      this.objetivo = { ...objetivo }
      this.persiguiendo = true
    }
    if (!this.opciones.seguir || !this.persiguiendo) return
    const v = this.actual
    if (Math.hypot(objetivo.x - v.cx, objetivo.y - v.cy) < CONFIG_CAMARA.umbralSeguimientoPx) {
      this.persiguiendo = false
      return
    }
    this.aplicar(acercar(v, objetivo, delta, CONFIG_CAMARA.suavizadoSeguimientoMs))
  }

  /** Desplaza la vista (px de pantalla ; dx a la derecha, dy hacia abajo). */
  desplazar(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    const { ancho, alto } = this.pantalla
    this.persiguiendo = false
    this.mover({ x: ancho / 2 + dx, y: alto / 2 + dy }, { x: ancho / 2, y: alto / 2 }, 1)
  }

  /** Zoom anclado en el centro de la pantalla; `factor` > 1 acerca. */
  zoomCentro(factor: number): void {
    if (factor === 1) return
    const c = { x: this.pantalla.ancho / 2, y: this.pantalla.alto / 2 }
    this.mover(c, c, factor)
  }

  /** Desliza la vista hasta centrarla en `punto` (se avanza con `avanzarGuia`). */
  guiarA(punto: Punto, conExtension = true): void {
    this.guia = { ...punto }
    if (conExtension) this.extension = { ...punto }
    this.soltando = false
    this.recolocando = false
    this.persiguiendo = false
  }

  /**
   * Fin de la selección: la vista vuelve suavemente a los límites normales (con `avanzarGuia`)
   * y la extensión se borra al llegar.
   */
  soltarExtension(): void {
    if (!this.extension) return
    this.guia = undefined
    this.soltando = true
  }

  /**
   * Fija los márgenes de la cámara (Plano o Vida; o `undefined`). Si al reducirse la vista queda fuera de
   * los límites, vuelve deslizándose (no de golpe).
   */
  fijarMargenes(m: Margenes | undefined, saltar = false): void {
    const a = this.margenes
    if (
      a === m ||
      (a &&
        m &&
        a.arriba === m.arriba &&
        a.abajo === m.abajo &&
        a.izq === m.izq &&
        a.der === m.der &&
        a.soloExtremos === m.soloExtremos)
    )
      return
    this.margenes = m ? { ...m } : undefined
    const v = this.actual
    const l = limitarVista(v, this.pantalla, this.mundoPx, this.limites())
    const fuera = l.cx !== v.cx || l.cy !== v.cy
    // Al salir del Plano (`undefined`) o con `saltar` la vista vuelve de golpe; si solo cambia el
    // panel o un margen, se desliza de vuelta. Si crece un margen de Vida es porque el personaje
    // quedaría bajo la interfaz: la vista salta hacia él.
    const crece =
      m?.soloExtremos === true &&
      (m.arriba > (a?.arriba ?? 0) || m.abajo > (a?.abajo ?? 0) || m.izq > (a?.izq ?? 0))
    this.recolocando = fuera && m !== undefined && !crece && !saltar
    if (fuera && (m === undefined || saltar)) this.aplicar(l)
    else if (crece && this.opciones.seguir && this.objetivo) {
      // El personaje no debe quedar tapado ni un instante: la vista salta hacia él (con los nuevos límites).
      this.aplicar({ ...v, cx: this.objetivo.x, cy: this.objetivo.y })
    }
  }

  /** Hay un deslizamiento en curso (guía o vuelta de la extensión). */
  get guiando(): boolean {
    return this.guia !== undefined || this.soltando || this.recolocando
  }

  /** Límites mientras la vista se desliza de vuelta: incluyen el centro actual. */
  private limitesAnchos(): Extension {
    return { x: this.actual.cx, y: this.actual.cy, margenes: this.margenes }
  }

  private limitesMargenes(): Extension | undefined {
    return this.margenes && { margenes: this.margenes }
  }

  private limites(): Extension | undefined {
    const e = this.extension
    if (!e && !this.margenes) return undefined
    return { x: e?.x, y: e?.y, margenes: this.margenes }
  }

  /** Un paso del deslizamiento suave; `delta` en ms de tiempo real. */
  avanzarGuia(delta: number): void {
    const g = this.guia
    if (g) {
      const v = this.actual
      const antes = Math.hypot(g.x - v.cx, g.y - v.cy)
      if (antes < CONFIG_CAMARA.umbralSeguimientoPx) {
        this.guia = undefined
        return
      }
      this.aplicar(acercar(v, g, delta, CONFIG_CAMARA.suavizadoGuiaMs))
      // Objetivo inalcanzable (el centro está limitado): la guía se da por terminada.
      const w = this.actual
      if (!(Math.hypot(g.x - w.cx, g.y - w.cy) < antes)) this.guia = undefined
      return
    }
    if (this.recolocando) {
      const v = this.actual
      const meta = limitarVista(v, this.pantalla, this.mundoPx, this.limites())
      if (Math.hypot(meta.cx - v.cx, meta.cy - v.cy) < CONFIG_CAMARA.umbralSeguimientoPx) {
        this.recolocando = false
        this.aplicar(meta)
        return
      }
      this.aplicar(acercar(v, { x: meta.cx, y: meta.cy }, delta, CONFIG_CAMARA.suavizadoGuiaMs))
      return
    }
    if (!this.soltando || !this.extension) return
    const v = this.actual
    const meta = limitarVista(v, this.pantalla, this.mundoPx, this.limitesMargenes())
    if (Math.hypot(meta.cx - v.cx, meta.cy - v.cy) < CONFIG_CAMARA.umbralSeguimientoPx) {
      this.borrarExtension()
      this.aplicar(meta)
      return
    }
    this.aplicar(acercar(v, { x: meta.cx, y: meta.cy }, delta, CONFIG_CAMARA.suavizadoGuiaMs))
  }

  private borrarExtension(): void {
    this.extension = undefined
    this.soltando = false
  }

  /** Vista vigente (zoom y centro en px del mundo). */
  get vista(): Vista {
    return this.actual
  }

  /** Coloca la vista sobre `punto` de golpe, sin barrido (p. ej. tras un desmayo). */
  centrarEn(punto: Punto): void {
    this.objetivo = { ...punto }
    this.persiguiendo = false
    this.aplicar({ ...this.actual, cx: punto.x, cy: punto.y })
  }

  private get pantalla(): Pantalla {
    return pantallaLogica(this.escena)
  }

  private aplicar(v: Vista): void {
    if (this.pantalla.ancho <= 0 || this.pantalla.alto <= 0) return
    const cam = this.escena.cameras.main
    // Con la vista aún deslizándose de vuelta (`recolocando`) los límites son los de antes.
    const l = this.recolocando
      ? limitarVista(v, this.pantalla, this.mundoPx, this.limitesAnchos())
      : limitarVista(v, this.pantalla, this.mundoPx, this.limites())
    // La cámara de Phaser trabaja en píxeles de dispositivo: zoom lógico × factor de resolución.
    cam.setZoom(l.zoom * factorDe(this.escena))
    cam.setScroll(l.cx - cam.width / 2, l.cy - cam.height / 2)
    this.actual = l
  }

  private medir(): Medida | undefined {
    const activos = this.escena.input.manager.pointers
      .filter((p) => p.isDown && (p.wasTouch || p.leftButtonDown()))
      .slice(0, 2)
    const [a, b] = activos
    if (!a) return undefined
    const ids = activos.map((p) => p.id)
    if (!b) return { ids, medio: { x: a.x, y: a.y }, distancia: 0 }
    return { ids, ...medirDedos(a, b) }
  }

  /** Cualquier evento de puntero: si el conjunto de dedos no cambió aplica el gesto; si no, solo rebasa (sin saltos). */
  private alCambiar(): void {
    const ahora = this.medir()
    if (!ahora && !this.previa) return // ratón que solo pasa por encima
    const antes = this.previa
    this.previa = ahora
    if (!ahora || !antes) return
    if (ahora.ids.length !== antes.ids.length || ahora.ids.some((id, i) => id !== antes.ids[i]))
      return
    const factor = ahora.ids.length === 2 ? factorPellizco(antes, ahora) : 1
    if (!this.opciones.arrastre) {
      // Sin arrastre solo hay zoom, anclado en el punto medio de los dedos.
      if (factor !== 1) {
        const ancla = this.anclaZoom(ahora.medio)
        this.mover(ancla, ancla, factor)
        this.recuperarSeguimiento()
      }
      return
    }
    // Con el pincel de zonas un solo puntero pinta: la cámara solo se mueve con dos.
    if (ahora.ids.length < this._dedosParaArrastrar) return
    this.persiguiendo = false
    this.mover(antes.medio, ahora.medio, factor)
  }

  private alRueda(pointer: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void {
    const p = { x: pointer.x, y: pointer.y }
    // deltaMode 1 = líneas (Firefox), 2 = páginas.
    const modo = pointer.event instanceof WheelEvent ? pointer.event.deltaMode : 0
    const px = modo === 1 ? dy * 16 : modo === 2 ? dy * this.pantalla.alto : dy
    const ancla = this.anclaZoom(p)
    this.mover(ancla, ancla, Math.exp(-px * CONFIG_CAMARA.sensibilidadRueda))
    this.recuperarSeguimiento()
  }

  /** En Vida el zoom se ancla en el centro de la pantalla (el personaje); si no, en el puntero. */
  private anclaZoom(puntero: Punto): Punto {
    return this.opciones.seguir
      ? { x: this.pantalla.ancho / 2, y: this.pantalla.alto / 2 }
      : puntero
  }

  /** En el Modo Vida el zoom o el cambio de tamaño no deben dejar al personaje fuera de la vista. */
  private recuperarSeguimiento(): void {
    if (this.opciones.seguir) this.persiguiendo = true
  }

  private mover(desde: Punto, hasta: Punto, factor: number): void {
    this.guia = undefined
    this.soltando = false
    this.recolocando = false
    // La extensión se encoge al centro actual: el gesto es continuo (sin salto a los límites
    // normales) y la extensión desaparece sola cuando la vista vuelve a quedar dentro del valle.
    if (this.extension) this.extension = { x: this.actual.cx, y: this.actual.cy }
    const pantalla = this.pantalla
    this.aplicar(
      transformar(
        this.actual,
        pantalla,
        desde,
        hasta,
        factor,
        limitesZoom(pantalla, this.mundoPx),
        this.mundoPx,
        this.limites(),
      ),
    )
    if (this.extension) {
      const normal = limitarVista(this.actual, pantalla, this.mundoPx, this.limitesMargenes())
      if (normal.cx === this.actual.cx && normal.cy === this.actual.cy) this.extension = undefined
    }
  }

  private alRedimensionar(): void {
    const v = this.actual
    this.aplicar({ ...v, zoom: limitarZoom(v.zoom, limitesZoom(this.pantalla, this.mundoPx)) })
    // En Vida el personaje (quieto o no) debe seguir a la vista tras girar o redimensionar.
    this.recuperarSeguimiento()
  }

  private destruir(): void {
    const input = this.escena.input
    input.off('pointerdown', this.alCambiar, this)
    input.off('pointermove', this.alCambiar, this)
    input.off('pointerup', this.alCambiar, this)
    input.off('pointerupoutside', this.alCambiar, this)
    input.off('wheel', this.alRueda, this)
    this.escena.scale.off('resize', this.alRedimensionar, this)
  }
}
