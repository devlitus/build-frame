import { CONFIG_CULTIVOS } from './datos/cultivos'
import { CULTIVOS } from './datos/claves'
import { obstaculosDe } from './construccion'
import { cultivoDeEstacion, cultivoDeSemilla, type Cultivo } from './cultivos'
import type { EstadoJuego } from './estado'
import { casillaConEdificio, aguaDe, zonaEn } from './zonas'
import { ladoValle } from './mapa'
import { cantidadDe, inventarioValido, quitarObjeto } from './inventario'
import { edificiosValidos } from './edificios'
import {
  CARACTER_ARADA,
  CARACTER_REGADA,
  esCaracterArada,
  plantaNueva,
  tierraValida,
} from './tierra'

/**
 * Motivos de rechazo de la azada y de las semillas (los textos están en `src/ui/textos/es.json`).
 * Los comunes (`estado-invalido`, `sin-semillas`...) los comparte `ErrorUsoHerramienta`.
 */
export type ErrorLabranza =
  | 'estado-invalido'
  /** La casilla es de una parcela que no se ha comprado. */
  | 'no-propia'
  /** La casilla es de río (vados incluidos). */
  | 'agua'
  /** La casilla tiene un árbol o una roca. */
  | 'obstaculo'
  /** La casilla tiene un edificio, una obra o (al sembrar) ya una planta. */
  | 'ocupada'
  /** Azada: la casilla no es de zona cultivo ni huerto (o el cultivo no admite su zona). */
  | 'zona'
  /** Azada: la casilla ya está arada. */
  | 'ya-arada'
  /** Semillas: la casilla no está arada. */
  | 'no-arada'
  /** Semillas: el cultivo no se siembra en la estación actual. */
  | 'fuera-de-estacion'
  /** Semillas: la semilla elegida no es de ningún cultivo (por ejemplo, un plantón: llega con M5-06). */
  | 'semilla-invalida'

/** Hecho: la casilla (x, y) se aró. */
export interface EventoTierraArada {
  readonly tipo: 'tierra-arada'
  readonly x: number
  readonly y: number
}

/** Hecho: se sembró `cultivo` en la casilla (x, y) y se gastó 1 semilla. */
export interface EventoPlantaSembrada {
  readonly tipo: 'planta-sembrada'
  readonly x: number
  readonly y: number
  readonly cultivo: Cultivo
}

export type ResultadoLabranza =
  | {
      readonly ok: true
      readonly estado: EstadoJuego
      readonly eventos: readonly (EventoTierraArada | EventoPlantaSembrada)[]
    }
  | { readonly ok: false; readonly error: ErrorLabranza }

function estadoValido(estado: EstadoJuego): boolean {
  return edificiosValidos(estado.edificios) && tierraValida(estado)
}

/**
 * Por qué no se puede arar (x, y), o `undefined` si se puede. Orden: `no-propia`, `agua`,
 * `obstaculo`, `ocupada` (edificio u obra), `zona` (no es cultivo ni huerto), `ya-arada`.
 */
export function motivoNoArar(estado: EstadoJuego, x: number, y: number): ErrorLabranza | undefined {
  if (!estadoValido(estado)) return 'estado-invalido'
  const { valle } = estado
  const lado = ladoValle(valle)
  const c = valle.casillasPorParcela
  const parcela = valle.parcelas[Math.floor(y / c) * valle.parcelasPorLado + Math.floor(x / c)]
  if (parcela?.estado !== 'propia') return 'no-propia'
  const i = y * lado + x
  if (aguaDe(valle, estado.cauce.ancho, lado).has(i)) return 'agua'
  if (obstaculosDe(estado, lado).has(i)) return 'obstaculo'
  if (casillaConEdificio(estado, x, y)) return 'ocupada'
  const zona = zonaEn(estado, x, y)
  if (zona !== 'cultivo' && zona !== 'huerto') return 'zona'
  if (esCaracterArada(estado.tierra[i])) return 'ya-arada'
  return undefined
}

/** Efecto de la azada sobre (x, y): ara la casilla (sin gastar nada; la energía la gasta `usarHerramienta`). */
export function arar(estado: EstadoJuego, x: number, y: number): ResultadoLabranza {
  const error = motivoNoArar(estado, x, y)
  if (error) return { ok: false, error }
  const i = y * ladoValle(estado.valle) + x
  const tierra = estado.tierra.slice(0, i) + CARACTER_ARADA + estado.tierra.slice(i + 1)
  return {
    ok: true,
    estado: { ...estado, tierra },
    eventos: [{ tipo: 'tierra-arada', x: x + 0, y: y + 0 }],
  }
}

/**
 * Por qué no se puede sembrar `cultivo` en (x, y), o `undefined` si se puede. Orden:
 * `no-arada`, `ocupada` (planta, edificio, obra, obstáculo o agua), `zona` (el cultivo no admite
 * la zona de la casilla), `fuera-de-estacion`.
 */
export function motivoNoPlantar(
  estado: EstadoJuego,
  cultivo: Cultivo,
  x: number,
  y: number,
): ErrorLabranza | undefined {
  if (!estadoValido(estado)) return 'estado-invalido'
  const lado = ladoValle(estado.valle)
  const i = y * lado + x
  if (!esCaracterArada(estado.tierra[i])) return 'no-arada'
  if (
    estado.plantas.some((p) => p[0] === i) ||
    casillaConEdificio(estado, x, y) ||
    obstaculosDe(estado, lado).has(i) ||
    aguaDe(estado.valle, estado.cauce.ancho, lado).has(i)
  ) {
    return 'ocupada'
  }
  const zona = zonaEn(estado, x, y)
  if (zona === undefined || !CONFIG_CULTIVOS.cultivos[cultivo].zonas.some((z) => z === zona)) {
    return 'zona'
  }
  if (!cultivoDeEstacion(cultivo, estado)) return 'fuera-de-estacion'
  return undefined
}

/**
 * Por qué no se puede sembrar la semilla elegida en (x, y), o `undefined` si se puede: la
 * semilla debe ser la de un cultivo (`semilla-invalida`) y luego rige `motivoNoPlantar`.
 */
export function motivoNoSembrar(
  estado: EstadoJuego,
  x: number,
  y: number,
): ErrorLabranza | undefined {
  const cultivo = cultivoDeSemilla(estado.semillaElegida)
  if (!cultivo) return 'semilla-invalida'
  return motivoNoPlantar(estado, cultivo, x, y)
}

/**
 * Efecto de la herramienta «semillas» con la semilla elegida sobre (x, y): planta el cultivo y
 * gasta exactamente 1 semilla del inventario. Con un plantón (o cualquier objeto que no sea la
 * semilla de un cultivo) se rechaza con `semilla-invalida`: el plantón llega con M5-06.
 */
export function plantar(estado: EstadoJuego, x: number, y: number): ResultadoLabranza {
  const cultivo = cultivoDeSemilla(estado.semillaElegida)
  if (!cultivo || estado.semillaElegida === null) return { ok: false, error: 'semilla-invalida' }
  const error = motivoNoPlantar(estado, cultivo, x, y)
  if (error) return { ok: false, error }
  if (
    !inventarioValido(estado.inventario) ||
    cantidadDe(estado.inventario, estado.semillaElegida) < 1
  ) {
    return { ok: false, error: 'estado-invalido' }
  }
  const inventario = quitarObjeto(estado.inventario, estado.semillaElegida, 1)
  if (!inventario) return { ok: false, error: 'estado-invalido' }
  const i = y * ladoValle(estado.valle) + x
  const planta = plantaNueva(i, CULTIVOS.indexOf(cultivo))
  // La cuenta de días secos de la tierra vacía no sirve con planta: la casilla vuelve a `a`.
  const caracter = estado.tierra[i] === CARACTER_REGADA ? CARACTER_REGADA : CARACTER_ARADA
  const tierra = estado.tierra.slice(0, i) + caracter + estado.tierra.slice(i + 1)
  const plantas = [...estado.plantas, planta].sort((a, b) => a[0] - b[0])
  return {
    ok: true,
    estado: { ...estado, inventario, plantas, tierra },
    eventos: [{ tipo: 'planta-sembrada', x: x + 0, y: y + 0, cultivo }],
  }
}
