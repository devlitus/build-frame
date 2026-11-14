import type Phaser from 'phaser'
import {
  CARACTER_ARADA,
  CULTIVOS,
  defCultivo,
  faseDe,
  ladoValle,
  type EstadoJuego,
} from '../../core'
import {
  CLAVE_TIERRA_ARADA,
  FOTOGRAMAS_TIERRA,
  FOTOGRAMA_MARCHITO,
  MARCO_CULTIVO,
  claveCultivo,
  crearSello,
  escalaNominal,
} from './arte'
import { TAM_CASILLA } from './estilo'
import { firmaVentana } from './tramosZonas'
import { rejillaTrozos, type Trozo } from './trozos'
import { varianteDeCasilla } from './variantes'

/**
 * Sobre el relleno de las zonas (profundidad 1) y bajo sus bordes (1.6), las parcelas y los objetos
 * ordenados por Y (informe de arte M5: terreno, relleno, tierra arada, bordes de zona, cultivos).
 */
const PROFUNDIDAD_TIERRA = 1.5
const SAL_TIERRA = 0x7e44

type Vista = Pick<EstadoJuego, 'tierra' | 'plantas' | 'valle'>

/**
 * Tierra arada y cultivos (M5-03). La tierra se hornea en `RenderTexture` por trozos, como las
 * zonas (relleno con variante y bordes en los lados sin vecina arada), y solo se rehace el trozo
 * cuya firma cambió; cada planta es un sprite con la profundidad `32(y + 1)` para que el personaje
 * pase delante o detrás. `tierra` y `plantas` son inmutables: basta comparar sus referencias.
 */
export class VistaCultivos {
  private tierra: string | undefined = undefined
  private plantas: EstadoJuego['plantas'] | undefined = undefined
  private readonly trozos: {
    rt: Phaser.GameObjects.RenderTexture | undefined
    t: Trozo
    firma: string
  }[]
  private _aradas = 0
  private readonly plantasVisibles = new Map<
    number,
    { img: Phaser.GameObjects.Image; firma: string }
  >()

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly lado: number,
    private readonly semilla = 0,
  ) {
    this.trozos = rejillaTrozos(lado * TAM_CASILLA).map((t) => ({ rt: undefined, t, firma: '' }))
  }

  /** Casillas aradas y plantas dibujadas ahora (ganchos de prueba). */
  get visibles(): { aradas: number; plantas: number } {
    return { aradas: this._aradas, plantas: this.plantasVisibles.size }
  }

  actualizar(e: Vista): void {
    if (ladoValle(e.valle) !== this.lado) return
    if (e.tierra !== this.tierra) {
      this.tierra = e.tierra
      this.hornearTierra(e.tierra)
    }
    if (e.plantas !== this.plantas) {
      this.plantas = e.plantas
      this.repintarPlantas(e.plantas)
    }
  }

  /** Tras perder el contexto WebGL se rehace todo. */
  invalidar(): void {
    const tierra = this.tierra
    const plantas = this.plantas
    this.limpiarPlantas()
    for (const tr of this.trozos) tr.firma = ''
    if (tierra !== undefined) this.hornearTierra(tierra)
    if (plantas) this.repintarPlantas(plantas)
  }

  private arada(tierra: string, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.lado || y >= this.lado) return false
    return tierra[y * this.lado + x] === CARACTER_ARADA
  }

  private hornearTierra(tierra: string): void {
    this._aradas = 0
    for (let i = 0; i < tierra.length; i++) if (tierra[i] === CARACTER_ARADA) this._aradas++
    for (const tr of this.trozos) this.hornearTrozo(tr, tierra)
  }

  private hornearTrozo(
    tr: { rt: Phaser.GameObjects.RenderTexture | undefined; t: Trozo; firma: string },
    tierra: string,
  ): void {
    const x0 = Math.floor(tr.t.x / TAM_CASILLA)
    const y0 = Math.floor(tr.t.y / TAM_CASILLA)
    const x1 = Math.ceil((tr.t.x + tr.t.ancho) / TAM_CASILLA) - 1
    const y1 = Math.ceil((tr.t.y + tr.t.alto) / TAM_CASILLA) - 1
    // Una casilla más a cada lado: el borde depende de las vecinas de fuera del trozo.
    const firma = firmaVentana(tierra, this.lado, {
      x0: x0 - 1,
      y0: y0 - 1,
      x1: x1 + 1,
      y1: y1 + 1,
    })
    if (firma === tr.firma) return
    tr.firma = firma
    const casillas: { x: number; y: number }[] = []
    for (let y = y0; y <= Math.min(this.lado - 1, y1); y++) {
      for (let x = x0; x <= Math.min(this.lado - 1, x1); x++) {
        if (this.arada(tierra, x, y)) casillas.push({ x, y })
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
      .setDepth(PROFUNDIDAD_TIERRA)
    const rt = tr.rt
    rt.clear()
    rt.beginDraw()
    const sello = crearSello(this.escena)
    const escala = escalaNominal(this.escena, CLAVE_TIERRA_ARADA, TAM_CASILLA, 0)
    const estampar = (fotograma: number, x: number, y: number): void => {
      sello.setTexture(CLAVE_TIERRA_ARADA, fotograma)
      sello.setScale(escala)
      rt.batchDraw(sello, x * TAM_CASILLA - tr.t.x, y * TAM_CASILLA - tr.t.y)
    }
    // Todo el relleno y después los bordes, para que ningún relleno tape un borde vecino.
    for (const { x, y } of casillas) {
      estampar(varianteDeCasilla(this.semilla, x, y, FOTOGRAMAS_TIERRA.rellenos, SAL_TIERRA), x, y)
    }
    for (const { x, y } of casillas) {
      if (!this.arada(tierra, x, y - 1)) estampar(FOTOGRAMAS_TIERRA.arriba, x, y)
      if (!this.arada(tierra, x + 1, y)) estampar(FOTOGRAMAS_TIERRA.derecha, x, y)
      if (!this.arada(tierra, x, y + 1)) estampar(FOTOGRAMAS_TIERRA.abajo, x, y)
      if (!this.arada(tierra, x - 1, y)) estampar(FOTOGRAMAS_TIERRA.izquierda, x, y)
    }
    sello.destroy()
    rt.endDraw()
  }

  private repintarPlantas(plantas: EstadoJuego['plantas']): void {
    const vivas = new Set<number>()
    for (const p of plantas) {
      const [casilla, indice, dias, , , marchita] = p
      const cultivo = CULTIVOS[indice]
      const def = defCultivo(cultivo)
      if (!cultivo || !def) continue
      vivas.add(casilla)
      const fotograma = marchita === 1 ? FOTOGRAMA_MARCHITO : faseDe(def, dias)
      const firma = `${cultivo}:${fotograma}`
      const actual = this.plantasVisibles.get(casilla)
      if (actual?.firma === firma) continue
      actual?.img.destroy()
      const x = casilla % this.lado
      const y = Math.floor(casilla / this.lado)
      const img = this.escena.add
        .image(
          x * TAM_CASILLA + TAM_CASILLA / 2,
          (y + 1) * TAM_CASILLA,
          claveCultivo(cultivo),
          fotograma,
        )
        .setOrigin(0.5, 1)
        .setScale(escalaNominal(this.escena, claveCultivo(cultivo), MARCO_CULTIVO.ancho, 0))
        .setDepth((y + 1) * TAM_CASILLA)
      this.plantasVisibles.set(casilla, { img, firma })
    }
    for (const [casilla, { img }] of this.plantasVisibles) {
      if (vivas.has(casilla)) continue
      img.destroy()
      this.plantasVisibles.delete(casilla)
    }
  }

  private limpiarPlantas(): void {
    for (const { img } of this.plantasVisibles.values()) img.destroy()
    this.plantasVisibles.clear()
  }

  destruir(): void {
    this.limpiarPlantas()
    for (const { rt } of this.trozos) rt?.destroy()
    this.trozos.length = 0
  }
}
