import type Phaser from 'phaser'
import {
  defEdificio,
  diasRestantes,
  huellaDe,
  type Edificio,
  type EstadoJuego,
  type TipoEdificio,
} from '../../core'
import { tp } from '../../ui/textos'
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

/** Texto del cartel de una obra («3 días», «1 día»). */
export function textoCartel(dias: number): string {
  return tp(dias === 1 ? 'cartelDia' : 'cartelDias', { n: dias })
}

interface Dibujo {
  readonly clave: string
  readonly g: Phaser.GameObjects.Graphics
  readonly texto: Phaser.GameObjects.Text | undefined
  readonly visible: EdificioVisible
}

type G = Phaser.GameObjects.Graphics
type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Trazo con contorno sepia: primero la línea gruesa de contorno y encima la de relleno. */
function lineaConContorno(
  g: G,
  color: number,
  grosor: number,
  pts: readonly [number, number][],
): void {
  const trazar = (): void => {
    g.beginPath()
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)))
    g.strokePath()
  }
  g.lineStyle(grosor + 2 * E.grosor, E.contorno, 1)
  trazar()
  g.lineStyle(grosor, color, 1)
  trazar()
}

/** Polígono relleno con contorno sepia. */
function poligono(g: G, color: number, pts: readonly [number, number][]): void {
  g.fillStyle(color, 1)
  g.lineStyle(E.grosor, E.contorno, 1)
  g.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)))
  g.closePath()
  g.fillPath()
  g.strokePath()
}

function rectangulo(g: G, color: number, x: number, y: number, w: number, h: number): void {
  poligono(g, color, [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ])
}

function lineaInterior(g: G, x1: number, y1: number, x2: number, y2: number): void {
  g.lineStyle(E.grosorInterior, E.contorno, 1)
  g.beginPath()
  g.moveTo(x1, y1)
  g.lineTo(x2, y2)
  g.strokePath()
}

/** Casa: paredes, tejado a dos aguas que sobresale por arriba y puerta en la casilla de `puertaDe`. */
function dibujarCasa(g: G, { x, y, w, h }: Rect): void {
  const c = E.casa
  const techo = h * 0.45
  rectangulo(g, c.pared, x + 4, y + techo - 2, w - 8, h - techo - 2)
  poligono(g, c.techo, [
    [x - 2, y + techo + 2],
    [x + w / 2, y - 12],
    [x + w + 2, y + techo + 2],
  ])
  // La puerta está bajo el centro del borde inferior, como `puertaDe`: columna floor(ancho / 2).
  const columna = Math.floor(w / T / 2)
  const px = x + columna * T + T / 2
  rectangulo(g, c.puerta, px - 7, y + h - 22, 14, 20)
  rectangulo(g, c.ventana, x + 14, y + techo + 8, 14, 14)
  if (w >= 3 * T) rectangulo(g, c.ventana, x + w - 28, y + techo + 8, 14, 14)
}

/** Caja de envío: un cajón de madera con tablas cruzadas. */
function dibujarCaja(g: G, { x, y, w, h }: Rect): void {
  const c = E['caja-envio']
  rectangulo(g, c.madera, x + 3, y + 5, w - 6, h - 8)
  lineaInterior(g, x + 3, y + 5, x + w - 3, y + h - 3)
  lineaInterior(g, x + w - 3, y + 5, x + 3, y + h - 3)
  g.fillStyle(c.tabla, 1)
  g.fillRect(x + 3 + E.grosor, y + 5 + h * 0.4, w - 6 - 2 * E.grosor, 4)
}

/** Cobertizo: cuerpo bajo con tejado de una vertiente y puerta ancha. */
function dibujarCobertizo(g: G, { x, y, w, h }: Rect): void {
  const c = E.cobertizo
  rectangulo(g, c.pared, x + 3, y + h * 0.4, w - 6, h * 0.6 - 3)
  poligono(g, c.techo, [
    [x - 2, y + h * 0.4 + 2],
    [x + 6, y - 4],
    [x + w - 6, y - 4],
    [x + w + 2, y + h * 0.4 + 2],
  ])
  const columna = Math.floor(w / T / 2)
  const px = x + columna * T + T / 2
  rectangulo(g, c.puerta, px - 12, y + h - 24, 24, 21)
  lineaInterior(g, px, y + h - 24, px, y + h - 3)
}

/** Obra: suelo de tierra y andamio (postes, travesaños y riostras) con contorno sepia. */
function dibujarAndamio(g: G, { x, y, w, h }: Rect): void {
  const o = E.obra
  g.fillStyle(o.suelo, o.alfaSuelo)
  g.fillRect(x + 1, y + 1, w - 2, h - 2)
  g.lineStyle(E.grosor, E.contorno, 1)
  g.strokeRect(x + 1, y + 1, w - 2, h - 2)
  const izq = x + 5
  const der = x + w - 5
  const alto = Math.min(h * 0.9 + 8, h + 12)
  const base = y + h - 3
  const cima = base - alto
  const medio = base - alto * 0.5
  lineaConContorno(g, o.madera, 4, [
    [izq, base],
    [izq, cima],
  ])
  lineaConContorno(g, o.madera, 4, [
    [der, base],
    [der, cima],
  ])
  lineaConContorno(g, o.madera, 3, [
    [izq, cima],
    [der, cima],
  ])
  lineaConContorno(g, o.madera, 3, [
    [izq, medio],
    [der, medio],
  ])
  lineaConContorno(g, o.madera, 2, [
    [izq, base],
    [der, medio],
  ])
  lineaConContorno(g, o.madera, 2, [
    [der, base],
    [izq, medio],
  ])
  // Postes intermedios en las obras anchas.
  for (let cx = x + T; cx < x + w - T / 2; cx += T) {
    lineaConContorno(g, o.madera, 3, [
      [cx, base],
      [cx, cima],
    ])
  }
}

/** Cartel de la obra: tablón crema con contorno, en el borde inferior de la huella. */
function dibujarCartel(g: G, { x, y, w, h }: Rect): Rect {
  const o = E.obra
  const cx = x + w / 2
  const cartel = {
    x: cx - o.anchoCartel / 2,
    y: y + h - o.altoCartel / 2 - 2,
    w: o.anchoCartel,
    h: o.altoCartel,
  }
  rectangulo(g, o.cartel, cartel.x, cartel.y, cartel.w, cartel.h)
  return cartel
}

const dibujar: Readonly<Record<TipoEdificio, (g: G, r: Rect) => void>> = {
  casa: dibujarCasa,
  'caja-envio': dibujarCaja,
  cobertizo: dibujarCobertizo,
}

/**
 * Capa de edificios y obras (M4-05). Un `Graphics` por edificio, con `depth` = borde inferior de
 * la huella en px (como el personaje, ADR 0003: lo que está más al sur tapa a lo que está más al
 * norte), y el cartel de las obras con su `Text`. Son gráficos vectoriales (no texturas
 * horneadas): el contexto WebGL perdido no los vacía, y cada uno se destruye cuando desaparece su
 * edificio o cambia su aspecto, así que no acumulan texturas. Solo se redibuja cuando cambia la
 * lista de edificios o el día (los días del cartel).
 */
export class VistaEdificios {
  private readonly dibujos = new Map<number, Dibujo>()
  private lista: readonly Edificio[] | undefined = undefined
  private dia = -1
  private _repintados = 0

  constructor(private readonly escena: Phaser.Scene) {}

  /** Veces que se ha dibujado un edificio desde cero (ganchos de prueba). */
  get repintados(): number {
    return this._repintados
  }

  /** Lo que se ve de cada edificio, en orden de id. */
  get visibles(): readonly EdificioVisible[] {
    return [...this.dibujos.values()].map((d) => d.visible).sort((a, b) => a.id - b.id)
  }

  actualizar(e: Pick<EstadoJuego, 'edificios' | 'dia'>): void {
    if (e.edificios === this.lista && e.dia === this.dia) return
    this.lista = e.edificios
    this.dia = e.dia
    const vivos = new Set<number>()
    for (const ed of e.edificios) {
      const def = defEdificio(ed.tipo)
      if (!def) continue
      vivos.add(ed.id)
      const dias = ed.obra ? diasRestantes(ed.obra, e.dia) : undefined
      const clave = `${ed.tipo}|${ed.x},${ed.y}|${dias ?? 'ok'}`
      const actual = this.dibujos.get(ed.id)
      if (actual?.clave === clave) continue
      this.quitar(ed.id)
      this.dibujos.set(ed.id, this.crear(ed, clave, dias, def))
    }
    for (const id of [...this.dibujos.keys()]) if (!vivos.has(id)) this.quitar(id)
  }

  private crear(
    ed: Edificio,
    clave: string,
    dias: number | undefined,
    def: { readonly ancho: number; readonly alto: number },
  ): Dibujo {
    this._repintados++
    const h = huellaDe(def, ed.x, ed.y)
    const r: Rect = { x: h.x0 * T, y: h.y0 * T, w: def.ancho * T, h: def.alto * T }
    const profundidad = (h.y1 + 1) * T
    const g = this.escena.add.graphics().setDepth(profundidad)
    let texto: Phaser.GameObjects.Text | undefined
    if (dias === undefined) dibujar[ed.tipo](g, r)
    else {
      dibujarAndamio(g, r)
      const cartel = dibujarCartel(g, r)
      texto = this.escena.add
        .text(cartel.x + cartel.w / 2, cartel.y + cartel.h / 2, textoCartel(dias), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: E.obra.colorTexto,
        })
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(profundidad + 0.1)
    }
    return {
      clave,
      g,
      texto,
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
  }

  private quitar(id: number): void {
    const d = this.dibujos.get(id)
    if (!d) return
    d.g.destroy()
    d.texto?.destroy()
    this.dibujos.delete(id)
  }

  /** Tras perder el contexto WebGL: se rehace todo (los textos usan texturas de canvas). */
  invalidar(): void {
    const lista = this.lista
    const dia = this.dia
    this.destruir()
    this.lista = undefined
    this.dia = -1
    if (lista) this.actualizar({ edificios: lista, dia })
  }

  destruir(): void {
    for (const id of [...this.dibujos.keys()]) this.quitar(id)
    this.lista = undefined
  }
}
