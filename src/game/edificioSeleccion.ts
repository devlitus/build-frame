/**
 * Selección de un edificio u obra en el Modo Plano (estado de INTERFAZ, no del núcleo; no se
 * guarda): qué edificio tiene el panel abierto y si hay una confirmación de demoler o de cancelar
 * la obra pendiente. Convive con la selección de parcela, el pincel y el modo Construir: abrir
 * uno cierra los otros (lo cablea `Partida`).
 */

/** Qué confirmación hay abierta: demoler un edificio terminado o cancelar una obra. */
export type AccionConfirmable = 'demoler' | 'cancelar'

/** Quién pidió la confirmación: con el puntero el foco va a «No» (un doble toque no destruye); con el teclado, a «Sí». */
export type OrigenConfirmacionEdificio = 'puntero' | 'teclado'

export type AvisoSeleccionEdificio = () => void

export class SeleccionEdificio {
  private _id: number | undefined = undefined
  private _confirmando:
    { accion: AccionConfirmable; origen: OrigenConfirmacionEdificio } | undefined = undefined
  private readonly suscriptores = new Set<AvisoSeleccionEdificio>()

  /** `id` del edificio seleccionado, o undefined. */
  get id(): number | undefined {
    return this._id
  }

  /** Confirmación abierta (qué acción y quién la pidió), o undefined. */
  get confirmando(): { accion: AccionConfirmable; origen: OrigenConfirmacionEdificio } | undefined {
    return this._confirmando
  }

  /** Seleccionar el que ya está seleccionado no avisa; un id no entero se ignora. */
  seleccionar(id: number): void {
    if (!Number.isSafeInteger(id) || id === this._id) return
    this._id = id
    this._confirmando = undefined
    this.avisar()
  }

  deseleccionar(): void {
    if (this._id === undefined) return
    this._id = undefined
    this._confirmando = undefined
    this.avisar()
  }

  /** Abre la confirmación (hace falta un edificio seleccionado). */
  pedirConfirmacion(accion: AccionConfirmable, origen: OrigenConfirmacionEdificio): void {
    if (this._id === undefined) return
    this._confirmando = { accion, origen }
    this.avisar()
  }

  /** Cierra la confirmación sin hacer nada; true si había una (entonces Esc no cierra el panel). */
  cancelarConfirmacion(): boolean {
    if (this._confirmando === undefined) return false
    this._confirmando = undefined
    this.avisar()
    return true
  }

  suscribir(f: AvisoSeleccionEdificio): () => void {
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
