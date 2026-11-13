import {
  aplicarComando,
  type Comando,
  type EstadoJuego,
  type EventoJuego,
  type ResultadoComando,
} from '../core'
import { Pincel } from './pincel'
import { Seleccion } from './seleccion'

/** Aviso a los suscriptores: el estado vigente y los eventos del comando que lo provocó. */
export interface CambioPartida {
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoJuego[]
}

export type Suscriptor = (cambio: CambioPartida) => void

/** Avisos de interfaz que no nacen de un evento del núcleo (un comando rechazado, por ejemplo). */
export type AvisoInterfaz = 'zona-sin-casillas'

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
  private readonly suscriptoresAviso = new Set<(aviso: AvisoInterfaz) => void>()

  constructor(estado: EstadoJuego) {
    this._estado = estado
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
    }
    if (cambio || r.eventos.length > 0) this.avisar({ estado: r.estado, eventos: r.eventos })
    return r
  }

  /** Reemplaza el estado sin comando (solo depuración y pruebas); avisa a los suscriptores. */
  reemplazar(estado: EstadoJuego): void {
    this._estado = estado
    this.seleccion.deseleccionar()
    this.pincel.cerrar()
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
