import type Phaser from 'phaser'
import { ZONAS, ladoValle, type EstadoJuego, type ModoJuego, type Zona } from '../../core'
import { ALFA_ZONAS_VIDA, ESTILO_ZONAS, TAM_CASILLA, type EstiloZona } from './estilo'
import { firmaVentana, tramosPorZona, type VentanaCasillas } from './tramosZonas'
import { rejillaTrozos, type Trozo } from './trozos'

/** Profundidad de la capa de zonas: sobre el terreno y la decoración horneados, bajo las parcelas. */
const PROFUNDIDAD_ZONAS = 1

const claveSello = (z: Zona): string => `zona-sello-${z}`

/** Dibuja en `g` una casilla (32x32, origen en 0,0) de la zona: relleno y patrón. */
function dibujarCasilla(g: Phaser.GameObjects.Graphics, estilo: EstiloZona): void {
  const T = TAM_CASILLA
  g.fillStyle(estilo.color, estilo.alfa)
  g.fillRect(0, 0, T, T)
  g.lineStyle(3, estilo.colorPatron, 0.7)
  g.fillStyle(estilo.colorPatron, 0.7)
  switch (estilo.patron) {
    case 'surcos':
      g.beginPath()
      for (const k of [8, 16, 24]) {
        g.moveTo(0, k)
        g.lineTo(T, k)
      }
      g.strokePath()
      break
    case 'diagonal':
      g.beginPath()
      g.moveTo(0, T)
      g.lineTo(T, 0)
      g.moveTo(0, T / 2)
      g.lineTo(T / 2, 0)
      g.moveTo(T / 2, T)
      g.lineTo(T, T / 2)
      g.strokePath()
      break
    case 'cuadro':
      g.strokeRect(7, 7, T - 14, T - 14)
      break
    case 'puntos':
      g.fillCircle(T * 0.3, T * 0.3, 3.5)
      g.fillCircle(T * 0.7, T * 0.7, 3.5)
      break
  }
}

/**
 * Capa de zonas: se hornea a `RenderTexture` por trozos (como el terreno, para no reprocesar un
 * `Graphics` grande en cada fotograma) y solo se vuelve a hornear el trozo cuyo contenido cambió.
 * En el Modo Plano se ve con colores y patrones; en Vida, con la opacidad bajada (tono suave).
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
  ) {
    this.trozos = rejillaTrozos(mundoPx).map((t) => ({ rt: undefined, t, firma: '' }))
    this.prepararSellos()
  }

  /**
   * Una textura de una casilla por zona, hecha una sola vez: hornear un trozo es estampar esa
   * textura por casilla en vez de trazar el patrón línea a línea (mucho más barato).
   */
  private prepararSellos(): void {
    const texturas = this.escena.textures
    for (const z of ZONAS as readonly Zona[]) {
      const clave = claveSello(z)
      if (texturas.exists(clave)) texturas.remove(clave)
      const g = this.escena.make.graphics({}, false)
      dibujarCasilla(g, ESTILO_ZONAS[z])
      g.generateTexture(clave, TAM_CASILLA, TAM_CASILLA)
      g.destroy()
    }
  }

  /** Trozos que se han vuelto a hornear (ganchos de prueba y rendimiento). */
  get horneados(): number {
    return this._horneados
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
    this.prepararSellos()
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
    const firma = firmaVentana(zonas, this.lado, v)
    if (firma === tr.firma) return
    tr.firma = firma
    this._horneados++
    const tramos = tramosPorZona(zonas, this.lado, v)
    if (ZONAS.every((z) => tramos[z].length === 0)) {
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
    for (const z of ZONAS as readonly Zona[]) {
      const clave = claveSello(z)
      for (const t of tramos[z]) {
        for (let x = t.x0; x <= t.x1; x++) {
          rt.batchDrawFrame(clave, undefined, x * TAM_CASILLA - tr.t.x, t.y * TAM_CASILLA - tr.t.y)
        }
      }
    }
    rt.endDraw()
  }

  destruir(): void {
    for (const { rt } of this.trozos) rt?.destroy()
    this.trozos.length = 0
    for (const z of ZONAS as readonly Zona[]) this.escena.textures.remove(claveSello(z))
  }
}
