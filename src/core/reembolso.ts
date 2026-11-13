import { CONFIG_EDIFICIOS } from './datos/edificios'
import { defEdificio, type Coste, type Edificio } from './edificios'
import type { EstadoJuego } from './estado'

/**
 * Qué se hace con un edificio al quitarlo: `cancelar` una obra en curso (se devuelve todo lo
 * pagado) o `demoler` uno terminado (se devuelve la fracción `reembolsoDemolicion`).
 */
export type AccionQuitar = 'cancelar' | 'demoler'

export interface Reembolso {
  readonly accion: AccionQuitar
  /** Lo que se devuelve: enteros ≥ 0 y nunca más de lo pagado. */
  readonly coste: Coste
}

const cantidad = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

/**
 * Lo realmente pagado por el edificio: `pagado` si es válido y, si falta (edificio heredado o
 * hecho a mano), el coste del catálogo.
 */
export function pagadoDe(
  edificio: Pick<Edificio, 'pagado'>,
  def: { readonly coste: Coste },
): Coste {
  const p = edificio.pagado
  if (p && cantidad(p.dinero) && cantidad(p.madera) && cantidad(p.piedra)) {
    return { dinero: p.dinero, madera: p.madera, piedra: p.piedra }
  }
  return { ...def.coste }
}

/** Fracción `f` de `n`, redondeada como dicen los datos (`abajo`) y sin pasar nunca de `n`. */
function parte(n: number, f: number): number {
  return Math.min(n, Math.max(0, Math.floor(n * f)))
}

/**
 * Reembolso de quitar el edificio `id`: función pura que leen a la vez el comando y la
 * confirmación de la interfaz, para que esta muestre exactamente lo que se devuelve. Una obra
 * devuelve el 100 % de lo pagado; un edificio terminado, `reembolsoDemolicion` de lo pagado con el
 * redondeo `redondeoReembolso`. `undefined` si el edificio no existe, su tipo es desconocido o no
 * se puede quitar (la casa terminada: `demolible: false`).
 */
export function reembolso(
  estado: Pick<EstadoJuego, 'edificios'>,
  id: number,
): Reembolso | undefined {
  const e = estado.edificios.find((b) => b.id === id)
  if (!e) return undefined
  const def = defEdificio(e.tipo)
  if (!def) return undefined
  const pagado = pagadoDe(e, def)
  if (e.obra !== null) return { accion: 'cancelar', coste: pagado }
  if (!def.demolible) return undefined
  const f = CONFIG_EDIFICIOS.reembolsoDemolicion
  return {
    accion: 'demoler',
    coste: {
      dinero: parte(pagado.dinero, f),
      madera: parte(pagado.madera, f),
      piedra: parte(pagado.piedra, f),
    },
  }
}
