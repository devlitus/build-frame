import { CONFIG_VALLE } from './datos/valle'
import { CONFIG_TIEMPO } from './datos/tiempo'
import type { ConfigValle } from './datos/esquemas'
import { generarValle, type Valle } from './valle'

/**
 * Versión del formato del estado. Cualquier cambio exige una migración (ADR 0001).
 * v2 (M1-01): se añade `valle`. No hay migración de v1 porque aún no existen
 * partidas guardadas (el guardado llega en M7).
 * v3 (M2-01): `minutos` se sustituye por `dia` + `minutoDelDia`, y se añaden `pausado` y
 * `velocidad`. Sin migración: sigue sin haber partidas guardadas.
 */
export const VERSION_FORMATO = 3

/** Velocidad del tiempo al empezar una partida. */
export const VELOCIDAD_INICIAL = 1

export interface EstadoJuego {
  readonly versionFormato: number
  readonly semilla: number
  readonly rng: number
  /** Día de la partida, desde 1. Estación y año se derivan con `fechaDe`. */
  readonly dia: number
  /** Minutos desde las 00:00 del día; rango [horaInicio, horaFin] (360..1560 = 06:00..02:00). */
  readonly minutoDelDia: number
  readonly pausado: boolean
  /** Velocidad del tiempo (una de `CONFIG_TIEMPO.velocidades`). */
  readonly velocidad: number
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
    dia: 1,
    minutoDelDia: CONFIG_TIEMPO.horaInicio,
    pausado: false,
    velocidad: VELOCIDAD_INICIAL,
    dinero: opciones.dineroInicial,
    valle,
  }
}
