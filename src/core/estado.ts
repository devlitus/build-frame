/** Versión del formato del estado. Cualquier cambio exige una migración (ADR 0001). */
export const VERSION_FORMATO = 1

export interface EstadoJuego {
  readonly versionFormato: number
  readonly semilla: number
  readonly rng: number
  /** Minutos de juego transcurridos desde el inicio de la partida. */
  readonly minutos: number
  readonly dinero: number
}

export interface OpcionesNuevaPartida {
  readonly semilla: number
  readonly dineroInicial: number
}

export function crearEstadoInicial(opciones: OpcionesNuevaPartida): EstadoJuego {
  return {
    versionFormato: VERSION_FORMATO,
    semilla: opciones.semilla >>> 0,
    rng: opciones.semilla >>> 0,
    minutos: 0,
    dinero: opciones.dineroInicial,
  }
}
