import type { Zona } from '../core'

/**
 * Estado de INTERFAZ del pincel de zonas (Modo Plano): barra abierta, herramienta elegida, arrastre
 * en curso y cursor de teclado. No es del núcleo ni se guarda. La escena lo lee para dibujar la
 * vista previa y Preact para la barra. Las reglas de qué casillas se pueden pintar son del núcleo
 * (`PintarZona`/`BorrarZona`); aquí solo se decide QUÉ rectángulo se pide.
 */

/** Casilla global del valle (x a la derecha, y hacia abajo). */
export interface Casilla {
  readonly x: number
  readonly y: number
}

/** Rectángulo de casillas, esquinas inclusivas, ya ordenado (`x0 <= x1`, `y0 <= y1`). */
export interface RectCasillas {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export type HerramientaPincel = Zona | 'borrar'
export type DireccionCasilla = 'arriba' | 'abajo' | 'izquierda' | 'derecha'

const acotar = (n: number, max: number): number => Math.min(max, Math.max(0, n))

/** Casilla que cubre el punto del mundo (px), o undefined si está fuera del valle o no es finito. */
export function casillaEnPunto(
  lado: number,
  tamCasilla: number,
  x: number,
  y: number,
): Casilla | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(tamCasilla > 0)) return undefined
  const cx = Math.floor(x / tamCasilla)
  const cy = Math.floor(y / tamCasilla)
  if (cx < 0 || cy < 0 || cx >= lado || cy >= lado) return undefined
  return { x: cx, y: cy }
}

/** Como `casillaEnPunto`, pero un punto fuera del valle da la casilla más cercana (el arrastre no se pierde). */
export function casillaMasCercana(
  lado: number,
  tamCasilla: number,
  x: number,
  y: number,
): Casilla | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(tamCasilla > 0)) return undefined
  return {
    x: acotar(Math.floor(x / tamCasilla), lado - 1),
    y: acotar(Math.floor(y / tamCasilla), lado - 1),
  }
}

/** Rectángulo que une dos esquinas dadas en cualquier orden. */
export function rectanguloDeEsquinas(a: Casilla, b: Casilla): RectCasillas {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  }
}

/** Casilla vecina en la dirección dada; en el borde del valle se queda donde está. */
export function casillaVecina(lado: number, c: Casilla, d: DireccionCasilla): Casilla {
  const dx = d === 'derecha' ? 1 : d === 'izquierda' ? -1 : 0
  const dy = d === 'abajo' ? 1 : d === 'arriba' ? -1 : 0
  return { x: acotar(c.x + dx, lado - 1), y: acotar(c.y + dy, lado - 1) }
}

/** Casilla del centro de la vista; si el centro cae fuera del valle, la más cercana. */
export function casillaEnCentroDeVista(
  lado: number,
  tamCasilla: number,
  vista: { readonly cx: number; readonly cy: number },
): Casilla {
  return casillaMasCercana(lado, tamCasilla, vista.cx, vista.cy) ?? { x: 0, y: 0 }
}

export type AvisoPincel = () => void

export class Pincel {
  private _abierto = false
  private _herramienta: HerramientaPincel | undefined = undefined
  private _arrastre: { desde: Casilla; hasta: Casilla } | undefined = undefined
  private _cursor: Casilla | undefined = undefined
  private _ancla: Casilla | undefined = undefined
  private readonly suscriptores = new Set<AvisoPincel>()

  /** ¿Está abierta la barra de zonas? */
  get abierto(): boolean {
    return this._abierto
  }

  /** Herramienta elegida (una zona o el borrador); undefined si no hay ninguna. */
  get herramienta(): HerramientaPincel | undefined {
    return this._herramienta
  }

  /** ¿Se pinta ahora? Barra abierta y herramienta elegida: el arrastre de un dedo ya no mueve la cámara. */
  get activo(): boolean {
    return this._abierto && this._herramienta !== undefined
  }

  /** Cursor de teclado, o undefined si no se está usando. */
  get cursor(): Casilla | undefined {
    return this._cursor
  }

  /** Primera esquina marcada con Enter, o undefined. */
  get ancla(): Casilla | undefined {
    return this._ancla
  }

  get arrastrando(): boolean {
    return this._arrastre !== undefined
  }

  abrir(): void {
    if (this._abierto) return
    this._abierto = true
    this.avisar()
  }

  /** Cierra la barra y suelta herramienta, arrastre y cursor. */
  cerrar(): void {
    if (!this._abierto && !this._herramienta && !this._arrastre && !this._cursor && !this._ancla)
      return
    this._abierto = false
    this._herramienta = undefined
    this._arrastre = undefined
    this._cursor = undefined
    this._ancla = undefined
    this.avisar()
  }

  /** Elige la herramienta (o ninguna). Con la barra cerrada no hace nada. Cambia de herramienta: se descarta lo a medias. */
  elegir(h: HerramientaPincel | undefined): void {
    if (!this._abierto || h === this._herramienta) return
    this._herramienta = h
    this._arrastre = undefined
    this._ancla = undefined
    if (h === undefined) this._cursor = undefined
    this.avisar()
  }

  // --- Arrastre (ratón o un dedo) ---

  empezarArrastre(c: Casilla): void {
    if (!this.activo) return
    this._arrastre = { desde: c, hasta: c }
    this.avisar()
  }

  moverArrastre(c: Casilla): void {
    const a = this._arrastre
    if (!a || (a.hasta.x === c.x && a.hasta.y === c.y)) return
    this._arrastre = { desde: a.desde, hasta: c }
    this.avisar()
  }

  /** Termina el arrastre y devuelve el rectángulo a aplicar; undefined si no había. */
  terminarArrastre(): RectCasillas | undefined {
    const a = this._arrastre
    if (!a) return undefined
    this._arrastre = undefined
    this.avisar()
    return rectanguloDeEsquinas(a.desde, a.hasta)
  }

  /** Descarta el arrastre sin aplicarlo (segundo dedo, pérdida de foco...). */
  cancelarArrastre(): void {
    if (!this._arrastre) return
    this._arrastre = undefined
    this.avisar()
  }

  // --- Teclado: cursor de casilla, Enter marca esquinas ---

  /**
   * Enter o Espacio. Sin cursor, lo coloca en `centro`; con cursor y sin ancla, marca la primera
   * esquina; con ancla, devuelve el rectángulo a aplicar y suelta el ancla (el cursor se queda).
   */
  pulsarMarca(centro: Casilla): RectCasillas | undefined {
    if (!this.activo) return undefined
    if (!this._cursor) {
      this._cursor = centro
      this.avisar()
      return undefined
    }
    if (!this._ancla) {
      this._ancla = this._cursor
      this.avisar()
      return undefined
    }
    const r = rectanguloDeEsquinas(this._ancla, this._cursor)
    this._ancla = undefined
    this.avisar()
    return r
  }

  /** Mueve el cursor; true si había cursor (la flecha es entonces del cursor y no de la cámara). */
  moverCursor(lado: number, d: DireccionCasilla): boolean {
    const c = this._cursor
    if (!c || !this.activo) return false
    const n = casillaVecina(lado, c, d)
    if (n.x !== c.x || n.y !== c.y) {
      this._cursor = n
      this.avisar()
    }
    return true
  }

  /** Esc: primero suelta el ancla, luego esconde el cursor; true si había algo que soltar. */
  cancelarTeclado(): boolean {
    if (this._ancla) {
      this._ancla = undefined
      this.avisar()
      return true
    }
    if (this._cursor) {
      this._cursor = undefined
      this.avisar()
      return true
    }
    return false
  }

  /**
   * Rectángulo de la vista previa: el arrastre, o ancla..cursor, o solo la casilla del cursor.
   * undefined si no hay nada que mostrar.
   */
  get rectanguloPrevio(): RectCasillas | undefined {
    if (!this.activo) return undefined
    const a = this._arrastre
    if (a) return rectanguloDeEsquinas(a.desde, a.hasta)
    const c = this._cursor
    if (!c) return undefined
    return rectanguloDeEsquinas(this._ancla ?? c, c)
  }

  suscribir(f: AvisoPincel): () => void {
    this.suscriptores.add(f)
    return () => {
      this.suscriptores.delete(f)
    }
  }

  private avisar(): void {
    for (const f of [...this.suscriptores]) {
      try {
        f()
      } catch (error) {
        console.error(error)
      }
    }
  }
}
