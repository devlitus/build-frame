import {
  aplicarComando,
  type Comando,
  type ErrorComando,
  type EstadoJuego,
  type EventoJuego,
  type ResultadoComando,
} from '../core'
import { Construccion, calcularSilueta, type Silueta } from './construir'
import { Pincel } from './pincel'
import { Seleccion } from './seleccion'

/** Aviso a los suscriptores: el estado vigente y los eventos del comando que lo provocó. */
export interface CambioPartida {
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoJuego[]
}

export type Suscriptor = (cambio: CambioPartida) => void

/** Avisos de interfaz que no nacen de un evento del núcleo (un comando rechazado, por ejemplo). */
export type AvisoInterfaz =
  | 'zona-sin-casillas'
  /** El núcleo rechazó `Construir` (el estado cambió entre la silueta y la confirmación). */
  | { readonly tipo: 'construir-rechazado'; readonly error: ErrorComando }

/**
 * Contenedor de la partida en la capa de juego: guarda el `EstadoJuego`, aplica comandos con
 * el núcleo y avisa a los suscriptores (observador mínimo). Lo usan la escena y, más
 * adelante, el HUD de Preact. Solo se avisa cuando el estado cambia o hay eventos.
 */
export class Partida {
  private _estado: EstadoJuego
  private readonly suscriptores = new Set<Suscriptor>()
  /** Parcela seleccionada: estado de interfaz, no del núcleo ni de lo que se guarda. */
  readonly seleccion = new Seleccion()
  /** Pincel de zonas (barra, herramienta, arrastre y cursor): también estado de interfaz. */
  readonly pincel = new Pincel()
  /** Modo Construir (catálogo, silueta y confirmación): estado de interfaz. Excluyente con el pincel y la selección. */
  readonly construccion = new Construccion()
  private ultimaSilueta:
    | { estado: EstadoJuego; tipo: string; x: number; y: number; silueta: Silueta | undefined }
    | undefined = undefined
  private readonly suscriptoresAviso = new Set<(aviso: AvisoInterfaz) => void>()

  constructor(estado: EstadoJuego) {
    this._estado = estado
    // Barra de zonas, panel de parcela y modo Construir no conviven: abrir uno cierra los otros.
    this.pincel.suscribir(() => {
      if (this.pincel.abierto) this.construccion.cerrar()
    })
    this.construccion.suscribir(() => {
      if (!this.construccion.abierto) return
      this.pincel.cerrar()
      this.seleccion.deseleccionar()
    })
  }

  /**
   * Silueta del edificio elegido en el cursor, con el veredicto de `colocacionValida`; undefined si
   * no se está colocando. Memoizada por estado, edificio y casilla (la piden la escena y la
   * interfaz en cada cambio del puntero).
   */
  silueta(): Silueta | undefined {
    const { tipo, centro } = this.construccion
    if (!this.construccion.abierto || tipo === undefined || !centro) return undefined
    const u = this.ultimaSilueta
    if (u && u.estado === this._estado && u.tipo === tipo && u.x === centro.x && u.y === centro.y) {
      return u.silueta
    }
    const silueta = calcularSilueta(this._estado, tipo, centro)
    this.ultimaSilueta = { estado: this._estado, tipo, x: centro.x, y: centro.y, silueta }
    return silueta
  }

  /**
   * Construye el edificio elegido donde está la silueta (tras la confirmación). Si el núcleo lo
   * acepta se vuelve al catálogo; si lo rechaza se avisa y se cierra la confirmación.
   */
  construirAqui(): ResultadoComando | undefined {
    const s = this.silueta()
    if (!s || this.construccion.confirmando === undefined) return undefined
    const r = this.emitir({ tipo: 'Construir', tipoEdificio: s.tipo, x: s.x, y: s.y })
    if (r.ok) this.construccion.terminarColocacion()
    else {
      this.construccion.cancelarConfirmacion()
      this.avisarInterfaz({ tipo: 'construir-rechazado', error: r.error })
    }
    return r
  }

  get estado(): EstadoJuego {
    return this._estado
  }

  /** Aplica un comando; si lo rechaza el estado no cambia y no se avisa. */
  emitir(comando: Comando): ResultadoComando {
    const r = aplicarComando(this._estado, comando)
    if (!r.ok) return r
    const cambio = r.estado !== this._estado
    this._estado = r.estado
    // La selección solo existe en el Modo Plano: al volver a Vida se suelta (y el panel se cierra).
    if (r.estado.modo !== 'plano') {
      this.seleccion.deseleccionar()
      this.pincel.cerrar()
      this.construccion.cerrar()
    }
    if (cambio || r.eventos.length > 0) this.avisar({ estado: r.estado, eventos: r.eventos })
    return r
  }

  /** Reemplaza el estado sin comando (solo depuración y pruebas); avisa a los suscriptores. */
  reemplazar(estado: EstadoJuego): void {
    this._estado = estado
    this.seleccion.deseleccionar()
    this.pincel.cerrar()
    this.construccion.cerrar()
    this.avisar({ estado, eventos: [] })
  }

  /** Devuelve la función que cancela la suscripción. */
  suscribir(f: Suscriptor): () => void {
    this.suscriptores.add(f)
    return () => {
      this.suscriptores.delete(f)
    }
  }

  /** Pide a la interfaz un aviso breve (lo muestra `Aviso`). */
  avisarInterfaz(aviso: AvisoInterfaz): void {
    for (const f of [...this.suscriptoresAviso]) {
      try {
        f(aviso)
      } catch (error) {
        console.error(error)
      }
    }
  }

  suscribirAvisos(f: (aviso: AvisoInterfaz) => void): () => void {
    this.suscriptoresAviso.add(f)
    return () => {
      this.suscriptoresAviso.delete(f)
    }
  }

  private avisar(cambio: CambioPartida): void {
    for (const f of [...this.suscriptores]) {
      try {
        f(cambio)
      } catch (error) {
        // Un suscriptor roto no debe impedir avisar a los demás ni romper el bucle.
        console.error(error)
      }
    }
  }
}
