/**
 * Selección de parcela (estado de INTERFAZ, no del núcleo; no se guarda). Una pieza observable
 * pequeña: la escena la lee para el resaltado y Preact para el panel de detalle.
 */

/** Rectángulo en píxeles (de pantalla o del mundo según el uso). */
export interface RectPantalla {
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

export type AvisoSeleccion = () => void

function igualesRect(a: RectPantalla | undefined, b: RectPantalla | undefined): boolean {
  if (!a || !b) return a === b
  return a.x === b.x && a.y === b.y && a.ancho === b.ancho && a.alto === b.alto
}

export class Seleccion {
  private _indice: number | undefined = undefined
  private _ocupado: RectPantalla | undefined = undefined
  private readonly suscriptores = new Set<AvisoSeleccion>()

  /** Índice de la parcela seleccionada (fila * lado + columna), o undefined. */
  get indice(): number | undefined {
    return this._indice
  }

  /** Zona de pantalla que tapa el panel de detalle (la fija el propio panel), o undefined. */
  get ocupado(): RectPantalla | undefined {
    return this._ocupado
  }

  /** Seleccionar la que ya está seleccionada no avisa. Un índice no entero o negativo se ignora. */
  seleccionar(indice: number): void {
    if (!Number.isInteger(indice) || indice < 0 || indice === this._indice) return
    this._indice = indice
    this.avisar()
  }

  deseleccionar(): void {
    if (this._indice === undefined) return
    this._indice = undefined
    // Sin selección no hay panel: la zona ocupada se libera con él.
    this._ocupado = undefined
    this.avisar()
  }

  fijarOcupado(rect: RectPantalla | undefined): void {
    if (igualesRect(this._ocupado, rect)) return
    this._ocupado = rect
    this.avisar()
  }

  suscribir(f: AvisoSeleccion): () => void {
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
