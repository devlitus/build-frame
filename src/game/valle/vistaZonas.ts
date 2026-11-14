import type Phaser from 'phaser'
import { ladoValle, type EstadoJuego, type ModoJuego, type Zona } from '../../core'
import { FOTOGRAMAS_ZONA, claveZona, crearSello, escalaNominal } from './arte'
import { ALFA_ZONAS_VIDA, TAM_CASILLA } from './estilo'
import { bordesDeCasilla, firmaVentana, zonaDeCasilla, type VentanaCasillas } from './tramosZonas'
import { rejillaTrozos, type Trozo } from './trozos'
import { varianteDeCasilla } from './variantes'

/** Profundidad de la capa de zonas: sobre el terreno y la decoración horneados, bajo las parcelas. */
const PROFUNDIDAD_ZONAS = 1

/** Sal de la variante del relleno: así no va a la par de la del terreno. */
const SAL_ZONAS = 0x5a17

/**
 * Capa de zonas: se hornea a `RenderTexture` por trozos (como el terreno, para no reprocesar un
 * `Graphics` grande en cada fotograma) y solo se vuelve a hornear el trozo cuyo contenido cambió.
 * Usa el arte de `public/assets/zonas` (relleno con variante por casilla y borde en los lados sin
 * vecina de la misma zona), el mismo que las muestras de la barra de zonas. En el Modo Plano se ve
 * entera; en Vida, con la opacidad bajada (tono suave).
 */
export class VistaZonas {
  /** Una textura por trozo, creada solo cuando el trozo tiene zonas (sin zonas no hay objetos extra). */
  private readonly trozos: {
    rt: Phaser.GameObjects.RenderTexture | undefined
    t: Trozo
    firma: string
  }[]
  private zonas: string | undefined = undefined
  private modo: ModoJuego | undefined = undefined
  private _horneados = 0
  private alfa = 1

  constructor(
    private readonly escena: Phaser.Scene,
    mundoPx: number,
    private readonly lado: number,
    private readonly semilla = 0,
  ) {
    this.trozos = rejillaTrozos(mundoPx).map((t) => ({ rt: undefined, t, firma: '' }))
  }

  /** Trozos que se han vuelto a hornear (ganchos de prueba y rendimiento). */
  get horneados(): number {
    return this._horneados
  }

  /** Opacidad con que se ve la capa ahora (gancho de prueba del tono suave del Modo Vida). */
  get alfaVisible(): number {
    return this.trozos.find((tr) => tr.rt)?.rt?.alpha ?? this.alfa
  }

  /** Pone al día la capa si cambiaron las zonas o el modo; casi siempre no hace nada. */
  actualizar(e: Pick<EstadoJuego, 'zonas' | 'modo' | 'valle'>): void {
    if (ladoValle(e.valle) !== this.lado) return
    if (e.zonas !== this.zonas) {
      this.zonas = e.zonas
      for (const tr of this.trozos) this.hornearTrozo(tr, e.zonas)
    }
    if (e.modo !== this.modo) {
      this.modo = e.modo
      const alfa = e.modo === 'plano' ? 1 : ALFA_ZONAS_VIDA
      this.alfa = alfa
      for (const { rt } of this.trozos) rt?.setAlpha(alfa)
    }
  }

  /** Tras perder el contexto WebGL las texturas quedan vacías: se vuelve a hornear todo. */
  invalidar(): void {
    const zonas = this.zonas
    for (const tr of this.trozos) {
      tr.firma = ''
      if (zonas !== undefined) this.hornearTrozo(tr, zonas)
    }
  }

  private hornearTrozo(
    tr: { rt: Phaser.GameObjects.RenderTexture | undefined; t: Trozo; firma: string },
    zonas: string,
  ): void {
    const v: VentanaCasillas = {
      x0: Math.floor(tr.t.x / TAM_CASILLA),
      y0: Math.floor(tr.t.y / TAM_CASILLA),
      x1: Math.ceil((tr.t.x + tr.t.ancho) / TAM_CASILLA) - 1,
      y1: Math.ceil((tr.t.y + tr.t.alto) / TAM_CASILLA) - 1,
    }
    // La firma incluye una casilla más a cada lado: el borde depende de las vecinas de fuera del trozo.
    const firma = firmaVentana(zonas, this.lado, {
      x0: v.x0 - 1,
      y0: v.y0 - 1,
      x1: v.x1 + 1,
      y1: v.y1 + 1,
    })
    if (firma === tr.firma) return
    tr.firma = firma
    this._horneados++
    const casillas: { x: number; y: number; zona: Zona }[] = []
    for (let y = Math.max(0, v.y0); y <= Math.min(this.lado - 1, v.y1); y++) {
      for (let x = Math.max(0, v.x0); x <= Math.min(this.lado - 1, v.x1); x++) {
        const zona = zonaDeCasilla(zonas, this.lado, x, y)
        if (zona !== undefined) casillas.push({ x, y, zona })
      }
    }
    if (casillas.length === 0) {
      tr.rt?.destroy()
      tr.rt = undefined
      return
    }
    tr.rt ??= this.escena.add
      .renderTexture(tr.t.x, tr.t.y, tr.t.ancho, tr.t.alto)
      .setOrigin(0, 0)
      .setDepth(PROFUNDIDAD_ZONAS)
      .setAlpha(this.alfa)
    const rt = tr.rt
    rt.clear()
    rt.beginDraw()
    const sello = crearSello(this.escena)
    const estampar = (zona: Zona, fotograma: number, x: number, y: number): void => {
      sello.setTexture(claveZona(zona), fotograma)
      sello.setScale(escalaNominal(this.escena, claveZona(zona), TAM_CASILLA, 0))
      rt.batchDraw(sello, x * TAM_CASILLA - tr.t.x, y * TAM_CASILLA - tr.t.y)
    }
    // Primero todo el relleno y después los bordes, para que ningún relleno tape un borde vecino.
    for (const { x, y, zona } of casillas) {
      estampar(
        zona,
        varianteDeCasilla(this.semilla, x, y, FOTOGRAMAS_ZONA.rellenos, SAL_ZONAS),
        x,
        y,
      )
    }
    for (const { x, y, zona } of casillas) {
      const b = bordesDeCasilla(zonas, this.lado, x, y, zona)
      if (b.arriba) estampar(zona, FOTOGRAMAS_ZONA.bordeArriba, x, y)
      if (b.derecha) estampar(zona, FOTOGRAMAS_ZONA.bordeDerecha, x, y)
      if (b.abajo) estampar(zona, FOTOGRAMAS_ZONA.bordeAbajo, x, y)
      if (b.izquierda) estampar(zona, FOTOGRAMAS_ZONA.bordeIzquierda, x, y)
    }
    sello.destroy()
    rt.endDraw()
  }

  destruir(): void {
    for (const { rt } of this.trozos) rt?.destroy()
    this.trozos.length = 0
  }
}
