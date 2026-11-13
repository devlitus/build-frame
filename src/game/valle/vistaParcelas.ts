import type Phaser from 'phaser'
import type { EstadoJuego, ModoJuego, Valle } from '../../core'
import { redibujarParcelas } from './dibujar'
import { crearClasificador, type EstadoVisualParcela } from './estadoVisual'

/**
 * Dibujo de las parcelas (tinte y borde) en un `Graphics` propio. Se redibuja, sin rehornear el
 * valle, cuando cambian valle, dinero, comprasHechas o modo; el tiempo cambia el estado en cada
 * fotograma pero no estas cosas, así que `repintar` casi siempre no hace nada.
 */
export class VistaParcelas {
  private g: Phaser.GameObjects.Graphics | undefined
  /** Clasificación con memoria: solo se recalcula al cambiar valle, dinero o comprasHechas. */
  private readonly clasificar = crearClasificador()
  /** Lo que muestra ahora el Graphics (para no redibujarlo sin cambios). */
  private pintado: { valle: Valle; dinero: number; compras: number; modo: ModoJuego } | undefined =
    undefined
  private visualPintado: readonly EstadoVisualParcela[] = []
  private _repintados = 0

  constructor(escena: Phaser.Scene) {
    this.g = escena.add.graphics().setDepth(2)
  }

  /** Veces que se ha redibujado el Graphics (ganchos de prueba). */
  get repintados(): number {
    return this._repintados
  }

  /** Estado visual con el que se pintó la parcela `i` la última vez. */
  estadoVisual(i: number): EstadoVisualParcela | undefined {
    return this.visualPintado[i]
  }

  /** Redibuja si cambió el valle, el dinero, las compras o el modo. */
  repintar(e: EstadoJuego): void {
    const g = this.g
    if (!g) return
    const p = this.pintado
    if (
      p &&
      p.valle === e.valle &&
      p.dinero === e.dinero &&
      p.compras === e.comprasHechas &&
      p.modo === e.modo
    )
      return
    this.visualPintado = this.clasificar(e)
    redibujarParcelas(g, e.valle, e.modo === 'plano' ? this.visualPintado : undefined)
    this.pintado = { valle: e.valle, dinero: e.dinero, compras: e.comprasHechas, modo: e.modo }
    this._repintados++
  }

  destruir(): void {
    this.g?.destroy()
    this.g = undefined
    this.pintado = undefined
  }
}
