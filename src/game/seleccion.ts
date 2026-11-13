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
  private _cancelarConfirmacion: (() => void) | undefined = undefined
  private _clicsBloqueadosHasta = 0

  /** Índice de la parcela seleccionada (fila * lado + columna), o undefined. */
  get indice(): number | undefined {
    return this._indice
  }

  /** Zona de pantalla que tapa el panel de detalle (la fija el propio panel), o undefined. */
  get ocupado(): RectPantalla | undefined {
    return this._ocupado
  }

  /** ¿Hay una confirmación de compra abierta en el panel? La escena lo consulta antes de cerrar con Esc. */
  get confirmando(): boolean {
    return this._cancelarConfirmacion !== undefined
  }

  /** El panel registra cómo cancelar su confirmación (o `undefined` al cerrarla). */
  fijarConfirmacion(cancelar: (() => void) | undefined): void {
    this._cancelarConfirmacion = cancelar
  }

  /** Cancela la confirmación abierta; devuelve true si había una (y entonces Esc no cierra el panel). */
  cancelarConfirmacion(): boolean {
    const c = this._cancelarConfirmacion
    if (!c) return false
    this._cancelarConfirmacion = undefined
    c()
    return true
  }

  /** Ignora la selección por clic o toque durante `ms` milisegundos (tras una compra). */
  bloquearClics(ms: number, ahora: number = performance.now()): void {
    this._clicsBloqueadosHasta = ahora + ms
  }

  clicsBloqueados(ahora: number = performance.now()): boolean {
    return ahora < this._clicsBloqueadosHasta
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
    this._cancelarConfirmacion = undefined
    // Sin selección no hay panel: la zona ocupada se libera con él.
    // Acoplamiento con la barra de zonas: la barra también fija `ocupado`, y este borrado solo es
    // correcto porque, con la barra abierta, no se puede seleccionar parcela: así `deseleccionar()`
    // nunca se ejecuta con una selección viva que dependa de la barra.
    this._ocupado = undefined
    this.avisar()
  }

  fijarOcupado(rect: RectPantalla | undefined): void {
    if (igualesRect(this._ocupado, rect)) return
    this._ocupado = rect
    this.avisar()
  }

  /**
   * Algo de la interfaz que tapa el valle (p. ej. el aviso de compra) ha aparecido o desaparecido:
   * avisa a los suscriptores para que la guía de cámara vuelva a medir las reservas del HUD.
   */
  reservasCambiadas(): void {
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
