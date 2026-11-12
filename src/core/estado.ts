import { CONFIG_VALLE } from './datos/valle'
import type { ConfigValle } from './datos/esquemas'
import { generarValle, type Valle } from './valle'

/**
 * Versión del formato del estado. Cualquier cambio exige una migración (ADR 0001).
 * v2 (M1-01): se añade `valle`. No hay migración de v1 porque aún no existen
 * partidas guardadas (el guardado llega en M7).
 */
export const VERSION_FORMATO = 2

export interface EstadoJuego {
  readonly versionFormato: number
  readonly semilla: number
  readonly rng: number
  /** Minutos de juego transcurridos desde el inicio de la partida. */
  readonly minutos: number
  readonly dinero: number
  readonly valle: Valle
}

export interface OpcionesNuevaPartida {
  readonly semilla: number
  readonly dineroInicial: number
  /** Configuración del valle; por defecto `CONFIG_VALLE` (data/valle.json). */
  readonly configValle?: ConfigValle
}

export function crearEstadoInicial(opciones: OpcionesNuevaPartida): EstadoJuego {
  const semilla = opciones.semilla >>> 0
  const { valle, estadoRng } = generarValle(opciones.configValle ?? CONFIG_VALLE, semilla)
  return {
    versionFormato: VERSION_FORMATO,
    semilla,
    rng: estadoRng,
    minutos: 0,
    dinero: opciones.dineroInicial,
    valle,
  }
}
