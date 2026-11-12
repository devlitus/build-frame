import type { Intencion } from './entrada'

/** Constantes de los gestos del Modo Vida (px de pantalla y ms). */
export const CONFIG_TACTIL = {
  /** Desplazamiento máximo de un toque corto. */
  umbralToquePx: 10,
  /** Duración máxima de un toque corto. */
  umbralToqueMs: 300,
  /** Radio del joystick: el mando llega a esta distancia de la base (y da magnitud 1). */
  radioJoystickPx: 56,
  /** Diámetro de la base (debe coincidir con `.joystick-base` en el CSS). */
  baseJoystickPx: 112,
  /** Diámetro del mando (≥ 44 px, tamaño mínimo táctil). */
  mandoPx: 48,
  /** Por debajo de esta fracción del radio la magnitud es 0 (zona muerta). */
  zonaMuerta: 0.12,
} as const

export interface PuntoPantalla {
  readonly x: number
  readonly y: number
}

/** Intención del joystick: vector del pulgar respecto a la base, limitado al radio (magnitud ≤ 1). */
export function intencionJoystick(
  base: PuntoPantalla,
  actual: PuntoPantalla,
  radio: number = CONFIG_TACTIL.radioJoystickPx,
  zonaMuerta: number = CONFIG_TACTIL.zonaMuerta,
): Intencion {
  const dx = actual.x - base.x
  const dy = actual.y - base.y
  const largo = Math.hypot(dx, dy)
  if (!(largo > 0) || !(radio > 0)) return { dx: 0, dy: 0 }
  const magnitud = Math.min(largo / radio, 1)
  if (magnitud < zonaMuerta) return { dx: 0, dy: 0 }
  return { dx: (dx / largo) * magnitud, dy: (dy / largo) * magnitud }
}
