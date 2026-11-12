import type { ConfigTiempo } from './datos/esquemas'
import { CONFIG_TIEMPO } from './datos/tiempo'

export const MINUTOS_POR_DIA = 1440

export interface Fecha {
  readonly año: number
  /** Clave de `data/tiempo.json` (p. ej. `primavera`); el nombre visible va en es.json. */
  readonly estacion: string
  /** Desde 1. */
  readonly diaDeEstacion: number
}

export interface Hora {
  /** 0..23 (las 02:00 de madrugada se muestran como 2, no como 26). */
  readonly horas: number
  readonly minutos: number
}

/** Año, estación y día de estación derivados de `dia` (desde 1). */
export function fechaDe(
  estado: { readonly dia: number },
  config: ConfigTiempo = CONFIG_TIEMPO,
): Fecha {
  const dia = Number.isFinite(estado.dia) ? Math.floor(estado.dia) : 1
  const indice = Math.max(0, dia - 1)
  const diasAño = config.diasPorEstacion * config.estaciones.length
  const enAño = indice % diasAño
  return {
    año: Math.floor(indice / diasAño) + 1,
    estacion: config.estaciones[Math.floor(enAño / config.diasPorEstacion)] ?? '',
    diaDeEstacion: (enAño % config.diasPorEstacion) + 1,
  }
}

/** Hora de pared (0..23 h) para el HUD. */
export function horaDe(estado: { readonly minutoDelDia: number }): Hora {
  const bruto = Number.isFinite(estado.minutoDelDia) ? Math.floor(estado.minutoDelDia) : 0
  const m = ((bruto % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA
  return { horas: Math.floor(m / 60), minutos: m % 60 }
}

/**
 * Minutos de juego (fraccionarios) que corresponden a `msReales` a la `velocidad` dada.
 * La capa de juego acumula la fracción y envía `AvanzarTiempo` con la parte entera.
 * Entradas no válidas (ms negativos o no finitos, velocidad no positiva o no finita) dan 0.
 */
export function minutosDeJuegoPorMs(
  msReales: number,
  velocidad: number,
  config: ConfigTiempo = CONFIG_TIEMPO,
): number {
  if (!Number.isFinite(msReales) || msReales <= 0) return 0
  if (!Number.isFinite(velocidad) || velocidad <= 0) return 0
  const porMs = (config.horaFin - config.horaInicio) / (config.minutosRealesPorDia * 60_000)
  return msReales * velocidad * porMs
}
