import type Phaser from 'phaser'

/** Rectángulo del mundo en px. */
export interface RectMundo {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

/**
 * Un objeto que se dibuja con profundidad por su base (ADR 0003: lo que está más al sur tapa a lo que
 * está más al norte). El sprite tiene el pivote en la base, centrado, y se coloca en `(x, y)`.
 */
export interface ObjetoProfundo {
  /** Identificador estable dentro de la capa (M5-06: el obstáculo; M5-03: el cultivo). */
  readonly id: number
  readonly x: number
  readonly y: number
  /** Profundidad: la `y` de la base en px (los cultivos de M5-03 usan `32(y+1)`). */
  readonly profundidad: number
  readonly textura: string
  readonly escala: number
  /** Lo que cubre el sprite, para saber si entra en la vista. */
  readonly rect: RectMundo
}

/** Lado (px) de las cubetas del índice espacial. */
const CUBETA = 256
/** Margen (px del mundo) que se añade a la vista antes de decidir qué objetos existen. */
export const MARGEN_CAPA_PX = 128
/** La vista se redondea a bloques de este tamaño para no rehacer la capa en cada fotograma. */
const BLOQUE = 64

const cruza = (a: RectMundo, b: RectMundo): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/**
 * Capa de «objetos por profundidad»: una `Image` por objeto, pero solo para los que caen en la vista
 * de la cámara más un margen. Las imágenes salen de un *pool* y se reutilizan al mover la cámara o
 * hacer zoom, así que el número de objetos de la escena depende de lo visible y no del valle. La
 * usan los árboles y rocas (M5-00) y la usarán los obstáculos con golpes (M5-06) y los cultivos
 * (M5-03): quien la use da los `ObjetoProfundo` (`reemplazar`) y, si necesita animar uno, lo pide
 * con `imagen(id)` (solo existe mientras es visible).
 */
export class CapaObjetos {
  private objetos = new Map<number, ObjetoProfundo>()
  private cubetas = new Map<number, ObjetoProfundo[]>()
  private extension = { x: 0, y: 0 }
  private readonly activos = new Map<number, Phaser.GameObjects.Image>()
  private clave = ''
  private _reconstrucciones = 0

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly mundoPx: number,
  ) {}

  /** Cambia el conjunto de objetos (se rehace en la siguiente `actualizar`). */
  reemplazar(objetos: readonly ObjetoProfundo[]): void {
    this.invalidar()
    this.objetos = new Map(objetos.map((o) => [o.id, o]))
    this.cubetas = new Map()
    let ex = 0
    let ey = 0
    const n = Math.ceil(this.mundoPx / CUBETA) + 1
    for (const o of objetos) {
      ex = Math.max(ex, o.x - o.rect.x0, o.rect.x1 - o.x)
      ey = Math.max(ey, o.y - o.rect.y0, o.rect.y1 - o.y)
      const k = this.cubeta(o.x, o.y, n)
      const l = this.cubetas.get(k)
      if (l) l.push(o)
      else this.cubetas.set(k, [o])
    }
    this.extension = { x: ex, y: ey }
    this.clave = ''
  }

  private cubeta(x: number, y: number, n = Math.ceil(this.mundoPx / CUBETA) + 1): number {
    return Math.floor(Math.max(0, y) / CUBETA) * n + Math.floor(Math.max(0, x) / CUBETA)
  }

  /** Objetos con imagen ahora mismo (ganchos de prueba). */
  get cantidad(): number {
    return this.activos.size
  }

  /** Veces que se ha rehecho el conjunto visible (ganchos de prueba). */
  get reconstrucciones(): number {
    return this._reconstrucciones
  }

  /** Cuántos objetos caen en la vista dada más el margen (cota de `cantidad`). */
  contarEn(vista: RectMundo): number {
    return this.seleccionar(this.zonaDe(vista)).length
  }

  /** La imagen de un objeto, si ahora es visible. */
  imagen(id: number): Phaser.GameObjects.Image | undefined {
    return this.activos.get(id)
  }

  /** Vista redondeada a bloques y ampliada con el margen: lo que de verdad se carga. */
  private zonaDe(vista: RectMundo): RectMundo {
    const q = (v: number, f: (n: number) => number): number => f(v / BLOQUE) * BLOQUE
    return this.ampliar({
      x0: q(vista.x0, Math.floor),
      y0: q(vista.y0, Math.floor),
      x1: q(vista.x1, Math.ceil),
      y1: q(vista.y1, Math.ceil),
    })
  }

  private ampliar(v: RectMundo): RectMundo {
    return {
      x0: v.x0 - MARGEN_CAPA_PX,
      y0: v.y0 - MARGEN_CAPA_PX,
      x1: v.x1 + MARGEN_CAPA_PX,
      y1: v.y1 + MARGEN_CAPA_PX,
    }
  }

  private seleccionar(zona: RectMundo): ObjetoProfundo[] {
    const n = Math.ceil(this.mundoPx / CUBETA) + 1
    const bx0 = Math.min(n - 1, Math.floor(Math.max(0, zona.x0 - this.extension.x) / CUBETA))
    const bx1 = Math.min(n - 1, Math.floor(Math.max(0, zona.x1 + this.extension.x) / CUBETA))
    const by0 = Math.min(n - 1, Math.floor(Math.max(0, zona.y0 - this.extension.y) / CUBETA))
    const by1 = Math.min(n - 1, Math.floor(Math.max(0, zona.y1 + this.extension.y) / CUBETA))
    const salida: ObjetoProfundo[] = []
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        for (const o of this.cubetas.get(by * n + bx) ?? []) if (cruza(o.rect, zona)) salida.push(o)
      }
    }
    return salida
  }

  /**
   * Pone al día las imágenes para la vista de la cámara (px del mundo). Solo trabaja cuando la vista
   * redondeada a bloques cambia (mover, hacer zoom); entonces las imágenes de lo que sale de la
   * vista se reutilizan para lo que entra y las sobrantes se destruyen.
   */
  actualizar(vista: RectMundo): void {
    if (!Number.isFinite(vista.x0 + vista.y0 + vista.x1 + vista.y1)) return
    const zona = this.zonaDe(vista)
    const clave = `${zona.x0},${zona.y0},${zona.x1},${zona.y1}`
    if (clave === this.clave) return
    this.clave = clave
    this._reconstrucciones++
    const quieren = new Map(this.seleccionar(zona).map((o) => [o.id, o]))
    const libres: Phaser.GameObjects.Image[] = []
    for (const [id, img] of [...this.activos]) {
      if (quieren.has(id) && !this.cambiado(id, img)) continue
      this.activos.delete(id)
      libres.push(img)
    }
    for (const [id, o] of quieren) {
      if (this.activos.has(id)) continue
      const img = libres.pop() ?? this.escena.add.image(0, 0, o.textura).setOrigin(0.5, 1)
      img.setTexture(o.textura).setPosition(o.x, o.y).setScale(o.escala).setDepth(o.profundidad)
      img.setData('objetoId', id)
      this.activos.set(id, img)
    }
    for (const img of libres) img.destroy()
  }

  private cambiado(id: number, img: Phaser.GameObjects.Image): boolean {
    const o = this.objetos.get(id)
    return !o || img.texture.key !== o.textura || img.depth !== o.profundidad
  }

  /** Tras perder el contexto WebGL o cambiar el conjunto: se rehace todo en la siguiente `actualizar`. */
  invalidar(): void {
    for (const img of this.activos.values()) img.destroy()
    this.activos.clear()
    this.clave = ''
  }

  destruir(): void {
    this.invalidar()
    this.objetos.clear()
    this.cubetas.clear()
  }
}
