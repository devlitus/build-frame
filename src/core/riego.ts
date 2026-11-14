import { CULTIVOS } from './datos/claves'
import { CONFIG_CULTIVOS } from './datos/cultivos'
import type { EstadoJuego } from './estado'
import { ladoValle } from './mapa'
import { cultivoDeEstacion, defCultivo, diasHastaMadurar } from './cultivos'
import { fechaDe } from './tiempo'
import {
  CARACTER_ARADA,
  CARACTER_REGADA,
  CARACTER_SIN_LABRAR,
  caracterSeca,
  diasSecaDe,
  esCaracterArada,
  tierraValida,
  type Planta,
} from './tierra'

/** Hecho: la casilla arada (x, y) se regó hoy (con o sin planta). */
export interface EventoTierraRegada {
  readonly tipo: 'tierra-regada'
  readonly x: number
  readonly y: number
}

/** Hecho: al cambiar de día, la planta de la casilla (x, y) se marchitó (sin agua o fuera de estación). */
export interface EventoPlantaMarchita {
  readonly tipo: 'planta-marchita'
  readonly x: number
  readonly y: number
  readonly cultivo: (typeof CULTIVOS)[number]
}

/** Hecho: se limpió la planta marchita de (x, y); la casilla queda arada. */
export interface EventoMarchitaLimpiada {
  readonly tipo: 'marchita-limpiada'
  readonly x: number
  readonly y: number
}

const esMadura = (p: Planta): boolean => {
  const def = defCultivo(CULTIVOS[p[1]])
  return def !== undefined && p[2] >= diasHastaMadurar(def)
}

/** Motivos propios de la regadera (los textos están en `src/ui/textos/es.json`). */
export type ErrorRiego =
  | 'estado-invalido'
  /** La casilla no es de tierra arada. */
  | 'no-arada'
  /** La casilla ya se regó hoy. */
  | 'ya-regada'
  /** La planta está marchita: no se recupera (se limpia con la azada). */
  | 'planta-marchita'
  /** La planta ya está madura: espera sin prisa y no necesita agua. */
  | 'planta-madura'

/**
 * Por qué no se puede regar (x, y), o `undefined` si se puede. Orden: `no-arada`, `ya-regada`,
 * `planta-marchita`, `planta-madura`. Se puede regar tierra arada y seca, con o sin planta viva
 * y sin madurar. Lo maduro espera sin prisa (no se riega ni se marchita por sed).
 */
export function motivoNoRegar(estado: EstadoJuego, x: number, y: number): ErrorRiego | undefined {
  if (!tierraValida(estado)) return 'estado-invalido'
  const i = y * ladoValle(estado.valle) + x
  const c = estado.tierra[i]
  if (!esCaracterArada(c)) return 'no-arada'
  if (c === CARACTER_REGADA) return 'ya-regada'
  const p = estado.plantas.find((q) => q[0] === i)
  if (p?.[5] === 1) return 'planta-marchita'
  if (p && esMadura(p)) return 'planta-madura'
  return undefined
}

export interface ResultadoRiego {
  readonly ok: true
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoTierraRegada[]
}

/** Efecto de la regadera sobre (x, y): moja la tierra arada si hace falta (la energía la gasta `usarHerramienta`). */
export function regar(estado: EstadoJuego, x: number, y: number): ResultadoRiego {
  if (motivoNoRegar(estado, x, y)) return { ok: true, estado, eventos: [] }
  const i = y * ladoValle(estado.valle) + x
  return {
    ok: true,
    estado: {
      ...estado,
      tierra: estado.tierra.slice(0, i) + CARACTER_REGADA + estado.tierra.slice(i + 1),
    },
    eventos: [{ tipo: 'tierra-regada', x: x + 0, y: y + 0 }],
  }
}

/** ¿Hay una planta marchita en (x, y)? */
export function hayMarchita(estado: EstadoJuego, x: number, y: number): boolean {
  if (!tierraValida(estado)) return false
  const i = y * ladoValle(estado.valle) + x
  return estado.plantas.some((p) => p[0] === i && p[5] === 1)
}

/**
 * Efecto de limpiar: quita la planta marchita de (x, y) y la casilla queda arada y seca. Sin
 * marchita ahí no cambia nada. Lo usan la azada y (M5-05) la mano.
 */
export function limpiarMarchita(
  estado: EstadoJuego,
  x: number,
  y: number,
): {
  readonly ok: true
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoMarchitaLimpiada[]
} {
  if (!hayMarchita(estado, x, y)) return { ok: true, estado, eventos: [] }
  const i = y * ladoValle(estado.valle) + x
  return {
    ok: true,
    estado: {
      ...estado,
      plantas: estado.plantas.filter((p) => p[0] !== i),
      tierra: estado.tierra.slice(0, i) + CARACTER_ARADA + estado.tierra.slice(i + 1),
    },
    eventos: [{ tipo: 'marchita-limpiada', x: x + 0, y: y + 0 }],
  }
}

/**
 * Crecimiento diario (se llama en el cambio de día, antes de reponer nada más). Plantas:
 * - al cambiar de estación, las que no son de la nueva estación se marchitan (también las maduras);
 * - viva y sin madurar: regada ⇒ +1 día de crecimiento y `diasSinAgua = 0`; sin regar ⇒ se
 *   detiene y `diasSinAgua + 1`, y al llegar a `necesidadAgua.diasSinRegar` se marchita;
 * - las maduras no crecen ni se marchitan por sed (esperan sin prisa) y las marchitas no cambian.
 * Tierra arada sin planta: regada ⇒ vuelve a seca; seca ⇒ suma un día seco y, al llegar a
 * `tierra.diasSinRegarAHierba`, vuelve a hierba. Todo queda sin regar para el día siguiente.
 * Eventos de marchitado en orden de casilla. Con un estado inválido, lo devuelve intacto.
 */
export function crecerPlantas(estado: EstadoJuego): {
  readonly estado: EstadoJuego
  readonly eventos: readonly EventoPlantaMarchita[]
} {
  if (!tierraValida(estado)) return { estado, eventos: [] }
  const lado = ladoValle(estado.valle)
  const eventos: EventoPlantaMarchita[] = []
  const diaNuevo = { dia: estado.dia + 1 }
  const nuevaEstacion = fechaDe(estado).estacion !== fechaDe(diaNuevo).estacion
  const limite = CONFIG_CULTIVOS.tierra.diasSinRegarAHierba
  const celdas = estado.tierra.split('')
  let cambioPlantas = false
  const conPlanta = new Set<number>()

  const plantas = estado.plantas.map((p): Planta => {
    conPlanta.add(p[0])
    const mojada = estado.tierra[p[0]] === CARACTER_REGADA
    celdas[p[0]] = CARACTER_ARADA
    const cultivo = CULTIVOS[p[1]]
    const def = defCultivo(cultivo)
    let nueva: Planta
    if (!cultivo || !def || p[5] === 1) {
      nueva = p
    } else if (nuevaEstacion && !cultivoDeEstacion(cultivo, diaNuevo)) {
      nueva = [p[0], p[1], p[2], 0, p[4], 1]
    } else if (esMadura(p)) {
      nueva = p[4] === 0 ? p : [p[0], p[1], p[2], 0, 0, 0]
    } else if (mojada) {
      nueva = [p[0], p[1], p[2] + 1, 0, 0, 0]
    } else {
      const sinAgua = p[4] + 1
      nueva = [p[0], p[1], p[2], 0, sinAgua, sinAgua >= def.necesidadAgua.diasSinRegar ? 1 : 0]
    }
    if (nueva !== p) cambioPlantas = true
    if (nueva[5] === 1 && p[5] === 0 && cultivo) {
      eventos.push({ tipo: 'planta-marchita', x: p[0] % lado, y: Math.floor(p[0] / lado), cultivo })
    }
    return nueva
  })

  for (let i = 0; i < celdas.length; i++) {
    if (conPlanta.has(i)) continue
    const c = celdas[i]
    if (!esCaracterArada(c)) continue
    const secos = c === CARACTER_REGADA ? 0 : diasSecaDe(c) + 1
    celdas[i] = secos >= limite ? CARACTER_SIN_LABRAR : caracterSeca(secos)
  }

  const tierra = celdas.join('')
  if (tierra === estado.tierra && !cambioPlantas) return { estado, eventos }
  return {
    estado: { ...estado, tierra, plantas: cambioPlantas ? plantas : estado.plantas },
    eventos,
  }
}
