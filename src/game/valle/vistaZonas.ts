import type Phaser from 'phaser'
import { ZONAS, ladoValle, type EstadoJuego, type ModoJuego, type Zona } from '../../core'
import { ALFA_ZONAS_VIDA, ESTILO_ZONAS, TAM_CASILLA, type EstiloZona } from './estilo'
import { firmaVentana, tramosPorZona, type TramoZona, type VentanaCasillas } from './tramosZonas'
import { rejillaTrozos, type Trozo } from './trozos'

/** Profundidad de la capa de zonas: sobre el terreno y la decoración horneados, bajo las parcelas. */
const PROFUNDIDAD_ZONAS = 1

function dibujarTramos(
  g: Phaser.GameObjects.Graphics,
  estilo: EstiloZona,
  tramos: readonly TramoZona[],
): void {
  const T = TAM_CASILLA
  g.fillStyle(estilo.color, estilo.alfa)
  for (const t of tramos) g.fillRect(t.x0 * T, t.y * T, (t.x1 - t.x0 + 1) * T, T)
  g.lineStyle(3, estilo.colorPatron, 0.7)
  g.fillStyle(estilo.colorPatron, 0.7)
  g.beginPath()
  for (const t of tramos) {
    switch (estilo.patron) {
      case 'surcos':
        for (const k of [8, 16, 24]) {
          g.moveTo(t.x0 * T + 3, t.y * T + k)
          g.lineTo((t.x1 + 1) * T - 3, t.y * T + k)
        }
        break
      case 'diagonal':
        for (let x = t.x0; x <= t.x1; x++) {
          const px = x * T
          const py = t.y * T
          g.moveTo(px, py + T)
          g.lineTo(px + T, py)
          g.moveTo(px, py + T / 2)
          g.lineTo(px + T / 2, py)
          g.moveTo(px + T / 2, py + T)
          g.lineTo(px + T, py + T / 2)
        }
        break
      case 'cuadro':
        for (let x = t.x0; x <= t.x1; x++) {
          const px = x * T + 7
          const py = t.y * T + 7
          g.moveTo(px, py)
          g.lineTo(px + T - 14, py)
          g.lineTo(px + T - 14, py + T - 14)
          g.lineTo(px, py + T - 14)
          g.lineTo(px, py)
        }
        break
      case 'puntos':
        break
    }
  }
  g.strokePath()
  if (estilo.patron === 'puntos') {
    for (const t of tramos) {
      for (let x = t.x0; x <= t.x1; x++) {
        g.fillCircle(x * T + T * 0.3, t.y * T + T * 0.3, 3.5)
        g.fillCircle(x * T + T * 0.7, t.y * T + T * 0.7, 3.5)
      }
    }
  }
}

/**
 * Capa de zonas: se hornea a `RenderTexture` por trozos (como el terreno, para no reprocesar un
 * `Graphics` grande en cada fotograma) y solo se vuelve a hornear el trozo cuyo contenido cambió.
 * En el Modo Plano se ve con colores y patrones; en Vida, con la opacidad bajada (tono suave).
 */
export class VistaZonas {
  private readonly trozos: { rt: Phaser.GameObjects.RenderTexture; t: Trozo; firma: string }[]
  private zonas: string | undefined = undefined
  private modo: ModoJuego | undefined = undefined
  private _horneados = 0

  constructor(
    private readonly escena: Phaser.Scene,
    mundoPx: number,
    private readonly lado: number,
  ) {
    this.trozos = rejillaTrozos(mundoPx).map((t) => ({
      rt: escena.add
        .renderTexture(t.x, t.y, t.ancho, t.alto)
        .setOrigin(0, 0)
        .setDepth(PROFUNDIDAD_ZONAS)
        .setVisible(false),
      t,
      firma: '',
    }))
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
      for (const { rt } of this.trozos) rt.setAlpha(alfa)
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
    tr: { rt: Phaser.GameObjects.RenderTexture; t: Trozo; firma: string },
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
    tr.rt.clear()
    const tramos = tramosPorZona(zonas, this.lado, v)
    if (ZONAS.every((z) => tramos[z].length === 0)) {
      tr.rt.setVisible(false)
      return
    }
    const g = this.escena.add.graphics()
    for (const z of ZONAS as readonly Zona[]) dibujarTramos(g, ESTILO_ZONAS[z], tramos[z])
    tr.rt.beginDraw()
    tr.rt.batchDraw(g, -tr.t.x, -tr.t.y)
    tr.rt.endDraw()
    g.destroy()
    tr.rt.setVisible(true)
  }

  destruir(): void {
    for (const { rt } of this.trozos) rt.destroy()
    this.trozos.length = 0
  }
}
