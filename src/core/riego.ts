import { CULTIVOS } from './datos/claves'
import type { EstadoJuego } from './estado'
import { ladoValle } from './mapa'
import { defCultivo, diasHastaMadurar } from './cultivos'
import { CARACTER_ARADA, tierraValida, type Planta } from './tierra'

/** Hecho: la planta de la casilla (x, y) se regó. */
export interface EventoPlantaRegada {
  readonly tipo: 'planta-regada'
  readonly x: number
  readonly y: number
}

/** Hecho: al cambiar de día, la planta de la casilla (x, y) se marchitó por falta de agua. */
export interface EventoPlantaMarchita {
  readonly tipo: 'planta-marchita'
  readonly x: number
  readonly y: number
  readonly cultivo: (typeof CULTIVOS)[number]
}

const esMadura = (p: Planta): boolean => {
  const def = defCultivo(CULTIVOS[p[1]])
  return def !== undefined && p[2] >= diasHastaMadurar(def)
}

/**
 * ¿Tiene efecto regar (x, y)? Solo si hay una planta viva, aún sin madurar y sin regar hoy. La
 * regadera se acepta igualmente en cualquier casilla al alcance (gasta su energía), como regar el
 * suelo: sin efecto no cambia nada.
 */
export function puedeRegar(estado: EstadoJuego, x: number, y: number): boolean {
  if (!tierraValida(estado)) return false
  const i = y * ladoValle(estado.valle) + x
  if (estado.tierra[i] !== CARACTER_ARADA) return false
  const p = estado.plantas.find((q) => q[0] === i)
  return p !== undefined && p[5] === 0 && p[3] === 0 && !esMadura(p)
}

export interface ResultadoRiego {
  readonly ok: true
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoPlantaRegada[]
}

/** Efecto de la regadera sobre (x, y): riega la planta si hace falta (la energía la gasta `usarHerramienta`). */
export function regar(estado: EstadoJuego, x: number, y: number): ResultadoRiego {
  if (!puedeRegar(estado, x, y)) return { ok: true, estado, eventos: [] }
  const i = y * ladoValle(estado.valle) + x
  const plantas = estado.plantas.map((p): Planta =>
    p[0] === i ? [p[0], p[1], p[2], 1, p[4], p[5]] : p,
  )
  return {
    ok: true,
    estado: { ...estado, plantas },
    eventos: [{ tipo: 'planta-regada', x: x + 0, y: y + 0 }],
  }
}

/**
 * Crecimiento diario (se llama en el cambio de día, antes de reponer nada más). Para cada planta
 * viva y aún sin madurar: regada ⇒ +1 día de crecimiento y `diasSinAgua = 0`; sin regar ⇒ se
 * detiene y `diasSinAgua + 1`, y al llegar a `necesidadAgua.diasSinRegar` se marchita. Las
 * maduras no crecen ni se marchitan (el campo espera sin prisa) y las marchitas no cambian. Todas
 * quedan sin regar para el día siguiente. Eventos de marchitado en orden de casilla.
 */
export function crecerPlantas(estado: EstadoJuego): {
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoPlantaMarchita[]
} {
  if (estado.plantas.length === 0) return { estado, eventos: [] }
  const lado = ladoValle(estado.valle)
  const eventos: EventoPlantaMarchita[] = []
  const plantas = estado.plantas.map((p): Planta => {
    const cultivo = CULTIVOS[p[1]]
    const def = defCultivo(cultivo)
    if (!cultivo || !def || p[5] === 1) return p[3] === 0 ? p : [p[0], p[1], p[2], 0, p[4], p[5]]
    if (esMadura(p)) return p[3] === 0 ? p : [p[0], p[1], p[2], 0, 0, 0]
    if (p[3] === 1) return [p[0], p[1], p[2] + 1, 0, 0, 0]
    const sinAgua = p[4] + 1
    if (sinAgua >= def.necesidadAgua.diasSinRegar) {
      eventos.push({ tipo: 'planta-marchita', x: p[0] % lado, y: Math.floor(p[0] / lado), cultivo })
      return [p[0], p[1], p[2], 0, sinAgua, 1]
    }
    return [p[0], p[1], p[2], 0, sinAgua, 0]
  })
  return { estado: { ...estado, plantas }, eventos }
}
