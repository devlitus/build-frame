import type Phaser from 'phaser'
import {
  defEdificio,
  diasRestantes,
  huellaDe,
  type Edificio,
  type EstadoJuego,
  type TipoEdificio,
} from '../../core'
import { factorDe } from '../resolucion'
import {
  MARCO_EDIFICIO,
  claveEdificio,
  escalaNominal,
  estadoDeEdificio,
  type EstadoEdificio,
} from './arte'
import { ESTILO_EDIFICIOS as E, TAM_CASILLA as T } from './estilo'

/** Lo que se ve de un edificio ahora mismo (ganchos de prueba y e2e). */
export interface EdificioVisible {
  readonly id: number
  readonly tipo: TipoEdificio
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
  /** `true` mientras se ve el andamio con su cartel. */
  readonly enObra: boolean
  /** Días del cartel de la obra; undefined si el edificio está terminado. */
  readonly diasCartel: number | undefined
  /** Profundidad con que se dibuja (borde inferior de la huella, en px). */
  readonly profundidad: number
}

/** Forma del cartel de una obra: círculo con el número (obra estrecha en pantalla) o tablón con «N días». */
type FormaCartel = 'circulo' | 'tablon'

interface Cartel {
  /** Un solo objeto en la escena (la obra suma dos: su andamio y este contenedor). */
  readonly caja: Phaser.GameObjects.Container
  readonly g: Phaser.GameObjects.Graphics
  readonly texto: Phaser.GameObjects.Text
  forma: FormaCartel
  /** Resolución con la que se ha rasterizado el texto. */
  resolucion: number
}

interface Dibujo {
  readonly clave: string
  readonly sprite: Phaser.GameObjects.Image
  readonly cartel: Cartel | undefined
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly dias: number | undefined
  readonly visible: EdificioVisible
}

type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Resolución del texto del cartel: 2 como mínimo y, con zoom bajo, la siguiente potencia de 2 de 2/zoom (tope 8). */
function resolucionTexto(zoom: number): number {
  return Math.min(8, Math.max(2, 2 ** Math.ceil(Math.log2(2 / zoom))))
}

/**
 * Capa de edificios y obras (M4-05, con el arte final de M5-00). Una `Image` por edificio con la
 * textura de su estado (cimientos, obra o terminado), colocada según `docs/informes/arte-m4.md`
 * (sobresale de la huella hacia arriba y a la izquierda), con `depth` = borde inferior de la huella
 * en px (como el personaje, ADR 0003: lo que está más al sur tapa a lo que está más al norte). El
 * cartel de las obras (un `Graphics` y un `Text` en un contenedor) va delante. Las imágenes
 * comparten textura, así que no acumulan texturas: se destruyen cuando desaparece su edificio o
 * cambia su aspecto. Solo se rehace cuando cambia la lista de edificios o el día; el cartel se
 * dibuja a tamaño de pantalla y con el zoom solo cambia su escala (y su forma, si cruza el umbral).
 */
export class VistaEdificios {
  private readonly dibujos = new Map<number, Dibujo>()
  private lista: readonly Edificio[] | undefined = undefined
  private dia = -1
  /** Último zoom aplicado a los carteles. */
  private zoom = 1
  private _repintados = 0

  /** `textoCartel` forma el texto del tablón («3 días»); lo pone quien construye la vista (la interfaz tiene los textos). */
  constructor(
    private readonly escena: Phaser.Scene,
    private readonly textoCartel: (dias: number) => string,
  ) {}

  /** Veces que se ha dibujado un edificio desde cero (ganchos de prueba). */
  get repintados(): number {
    return this._repintados
  }

  /** Lo que se ve de cada edificio, en orden de id. */
  get visibles(): readonly EdificioVisible[] {
    return [...this.dibujos.values()].map((d) => d.visible).sort((a, b) => a.id - b.id)
  }

  /**
   * `zoom` es el de la cámara: el cartel de una obra mide lo mismo en pantalla con cualquier zoom,
   * así que con un zoom nuevo solo se reescala (sin rehacer la obra).
   */
  actualizar(e: Pick<EstadoJuego, 'edificios' | 'dia'>, zoom = 1): void {
    const z = Math.min(Math.max(zoom, 0.1), 8)
    if (e.edificios !== this.lista || e.dia !== this.dia) {
      this.lista = e.edificios
      this.dia = e.dia
      const vivos = new Set<number>()
      for (const ed of e.edificios) {
        const def = defEdificio(ed.tipo)
        if (!def) continue
        vivos.add(ed.id)
        const dias = ed.obra ? diasRestantes(ed.obra, e.dia) : undefined
        const estado = estadoDeEdificio(ed.obra, e.dia)
        const clave = `${ed.tipo}|${ed.x},${ed.y}|${dias ?? 'ok'}|${estado}`
        if (this.dibujos.get(ed.id)?.clave === clave) continue
        this.quitar(ed.id)
        this.dibujos.set(ed.id, this.crear(ed, clave, estado, dias, def, z))
      }
      for (const id of [...this.dibujos.keys()]) if (!vivos.has(id)) this.quitar(id)
      // Si el zoom también cambió, las obras que se conservan reescalan su cartel.
      if (z !== this.zoom) for (const d of this.dibujos.values()) this.ajustarCartel(d, z)
      this.zoom = z
      return
    }
    if (z === this.zoom) return
    this.zoom = z
    for (const d of this.dibujos.values()) this.ajustarCartel(d, z)
  }

  private crear(
    ed: Edificio,
    claveDibujo: string,
    estado: EstadoEdificio,
    dias: number | undefined,
    def: { readonly ancho: number; readonly alto: number },
    zoom: number,
  ): Dibujo {
    this._repintados++
    const h = huellaDe(def, ed.x, ed.y)
    const r: Rect = { x: h.x0 * T, y: h.y0 * T, w: def.ancho * T, h: def.alto * T }
    const profundidad = (h.y1 + 1) * T
    const marco = MARCO_EDIFICIO[ed.tipo]
    const clave = claveEdificio(ed.tipo, estado)
    const sprite = this.escena.add
      .image(r.x - marco.izquierda, r.y - marco.arriba, clave)
      .setOrigin(0, 0)
      .setScale(escalaNominal(this.escena, clave, marco.ancho))
      .setDepth(profundidad)
    let cartel: Cartel | undefined
    if (dias !== undefined) {
      const texto = this.escena.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: `${E.obra.textoPx}px`,
          fontStyle: 'bold',
          color: E.obra.colorTexto,
        })
        .setOrigin(0.5)
        .setResolution(2)
      const fondo = this.escena.add.graphics()
      const caja = this.escena.add.container(0, 0, [fondo, texto]).setDepth(profundidad + 0.1)
      cartel = { caja, g: fondo, texto, forma: 'tablon', resolucion: 2 }
    }
    const d: Dibujo = {
      clave: claveDibujo,
      sprite,
      cartel,
      rect: r,
      dias,
      visible: {
        id: ed.id,
        tipo: ed.tipo,
        x: ed.x,
        y: ed.y,
        ancho: def.ancho,
        alto: def.alto,
        enObra: dias !== undefined,
        diasCartel: dias,
        profundidad,
      },
    }
    this.ajustarCartel(d, zoom, true)
    return d
  }

  /**
   * Cartel con tamaño fijo en pantalla: se dibuja en píxeles de pantalla alrededor de su centro y se
   * escala con 1/zoom. Una obra estrecha en pantalla lleva solo el número en un círculo; una ancha,
   * «N días» en un tablón. Solo se redibuja si cambia la forma.
   */
  private ajustarCartel(d: Dibujo, zoom: number, primera = false): void {
    const { cartel, rect, dias } = d
    if (!cartel || dias === undefined) return
    const o = E.obra
    const forma: FormaCartel = rect.w * zoom < o.anchoMinimoTablonPx ? 'circulo' : 'tablon'
    const alto = o.textoPx + 8
    if (primera || forma !== cartel.forma) {
      cartel.forma = forma
      cartel.texto.setText(forma === 'circulo' ? String(dias) : this.textoCartel(dias))
      const g = cartel.g
      g.clear()
      g.fillStyle(o.cartel, 1)
      g.lineStyle(E.grosor, E.contorno, 1)
      if (forma === 'circulo') {
        g.fillCircle(0, 0, alto / 2)
        g.strokeCircle(0, 0, alto / 2)
      } else {
        const ancho = cartel.texto.width + 12
        g.fillRect(-ancho / 2, -alto / 2, ancho, alto)
        g.strokeRect(-ancho / 2, -alto / 2, ancho, alto)
      }
    }
    // El cartel se apoya en el borde inferior de la huella, sin salirse por abajo más de un poco.
    const k = 1 / zoom
    // El texto se rasteriza con más resolución cuanto menor es el zoom (por escalones, para no rehacerlo).
    const res = resolucionTexto(zoom * factorDe(this.escena))
    if (cartel.resolucion !== res) {
      cartel.resolucion = res
      cartel.texto.setResolution(res)
    }
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h - Math.min((alto * k) / 2, rect.h / 2) - 2 * k
    cartel.caja.setPosition(cx, cy).setScale(k)
  }

  private quitar(id: number): void {
    const d = this.dibujos.get(id)
    if (!d) return
    d.sprite.destroy()
    d.cartel?.caja.destroy()
    this.dibujos.delete(id)
  }

  /** Tras perder el contexto WebGL: se rehace todo (los textos usan texturas de canvas). */
  invalidar(): void {
    const lista = this.lista
    const dia = this.dia
    this.destruir()
    const zoom = this.zoom
    this.lista = undefined
    this.dia = -1
    if (lista) this.actualizar({ edificios: lista, dia }, zoom)
  }

  destruir(): void {
    for (const id of [...this.dibujos.keys()]) this.quitar(id)
    this.lista = undefined
  }
}
