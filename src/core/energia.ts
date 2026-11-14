import { CONFIG_ENERGIA } from './datos/energia'
import type { EstadoJuego } from './estado'
import type { Herramienta } from './inventario'

/** Energía máxima (`data/energia.json`). */
export const ENERGIA_MAXIMA: number = CONFIG_ENERGIA.maximo

/** Energía con la que se despierta tras un desmayo: la fracción de los datos, redondeada hacia abajo. */
export const ENERGIA_TRAS_DESMAYO: number = Math.floor(
  CONFIG_ENERGIA.maximo * CONFIG_ENERGIA.desmayoFraccion,
)

/** Energía que gasta un uso aceptado de la herramienta. */
export function costeEnergia(herramienta: Herramienta): number {
  return CONFIG_ENERGIA.costes[herramienta]
}

/** ¿Es `n` una energía válida (entero en 0..máximo)? */
export function energiaValida(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= ENERGIA_MAXIMA
}

/** Cómo empieza el día siguiente: dormido por decisión o desmayado a las 02:00. */
export type MotivoCambioDeDia = 'dormir' | 'desmayo'

/** Energía con la que se empieza el día siguiente según cómo se llegó a él. */
export function energiaAlEmpezarDia(motivo: MotivoCambioDeDia): number {
  return motivo === 'dormir' ? ENERGIA_MAXIMA : ENERGIA_TRAS_DESMAYO
}

/** Resta `coste` a la energía del estado sin salir de 0..máximo. */
export function gastarEnergia(estado: EstadoJuego, coste: number): EstadoJuego {
  if (coste <= 0) return estado
  return { ...estado, energia: Math.max(0, estado.energia - coste) }
}
