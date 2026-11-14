/**
 * Panel de inventario (estado de INTERFAZ, no del núcleo; no se guarda): abierto o cerrado. Solo
 * existe en el Modo Vida; no convive con el pincel, el modo Construir ni las selecciones del Plano
 * porque esos paneles viven en el Modo Plano y este en Vida (la exclusión sale del cambio de modo).
 */
/** Quién lo abrió: con el teclado el foco pasa al panel; con el puntero se queda en el lienzo (para E y Espacio). */
export type OrigenInventario = 'teclado' | 'puntero'

export class PanelInventario {
  private _abierto = false
  private _origen: OrigenInventario = 'puntero'
  private readonly suscriptores = new Set<() => void>()

  get abierto(): boolean {
    return this._abierto
  }

  get origen(): OrigenInventario {
    return this._origen
  }

  abrir(origen: OrigenInventario = 'puntero'): void {
    if (this._abierto) return
    this._abierto = true
    this._origen = origen
    this.avisar()
  }

  cerrar(): void {
    if (!this._abierto) return
    this._abierto = false
    // Si el foco está dentro del panel (que se va a desmontar), vuelve al lienzo: así las teclas
    // de Vida siguen vivas cierre quien cierre el panel (Esc, I, «Cerrar» o el cambio de modo).
    if (typeof document !== 'undefined') {
      const a = document.activeElement
      if (a instanceof HTMLElement && a.closest('.panel-inventario')) {
        document.getElementById('juego')?.focus({ preventScroll: true })
      }
    }
    this.avisar()
  }

  alternar(origen: OrigenInventario = 'puntero'): void {
    if (this._abierto) this.cerrar()
    else this.abrir(origen)
  }

  suscribir(f: () => void): () => void {
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
