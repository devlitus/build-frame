import { CONFIG_VALLE } from './datos/valle'
import { CONFIG_ECONOMIA } from './datos/economia'
import { CONFIG_TIEMPO } from './datos/tiempo'
import type { ConfigValle } from './datos/esquemas'
import { generarValle, type Valle } from './valle'
import { CONFIG_PERSONAJE } from './datos/personaje'
import type { Obstaculo } from './decoracion'
import { generarMundo, ladoValle, type Cauce } from './mapa'
import { zonasVacias } from './zonas'
import { personajeEnAparicion, type Personaje } from './personaje'

/**
 * Versión del formato del estado. Cualquier cambio exige una migración (ADR 0001).
 * v2 (M1-01): se añade `valle`. No hay migración de v1 porque aún no existen
 * partidas guardadas (el guardado llega en M7).
 * v3 (M2-01): `minutos` se sustituye por `dia` + `minutoDelDia`, y se añaden `pausado` y
 * `velocidad`. Sin migración: sigue sin haber partidas guardadas.
 * v4 (M2-02): se añaden `cauce` (ancho y vados del río), `obstaculos` (árboles y rocas),
 * `aparicion` y `personaje`. Sin migración: sigue sin haber partidas guardadas.
 * v5 (M2-05): se añade `modo` (Vida o Plano). Sin migración: sigue sin haber partidas guardadas.
 * v6 (M3-01): se añade `comprasHechas` (parcelas compradas; sube el precio). Sin migración:
 * sigue sin haber partidas guardadas.
 * v7 (M4-01): se añade `zonas` (cadena de `lado*lado` caracteres, una zona por casilla).
 * Sin migración: sigue sin haber partidas guardadas.
 */
export const VERSION_FORMATO = 7

/** Velocidad del tiempo al empezar una partida. */
export const VELOCIDAD_INICIAL = 1

/** Modo de juego (GDD §4): Vida (mover al personaje) o Plano (gestionar el valle). */
export type ModoJuego = 'vida' | 'plano'

export const MODOS_JUEGO: readonly ModoJuego[] = ['vida', 'plano']

export interface EstadoJuego {
  readonly versionFormato: number
  readonly semilla: number
  readonly rng: number
  /** Día de la partida, desde 1. Estación y año se derivan con `fechaDe`. */
  readonly dia: number
  /** Minutos desde las 00:00 del día; rango [horaInicio, horaFin] (360..1560 = 06:00..02:00). */
  readonly minutoDelDia: number
  /** Pausa elegida por el jugador. La del Modo Plano es derivada (`tiempoDetenido`), no se guarda aquí. */
  readonly pausado: boolean
  readonly modo: ModoJuego
  /** Velocidad del tiempo (una de `CONFIG_TIEMPO.velocidades`). */
  readonly velocidad: number
  readonly dinero: number
  /** Parcelas compradas hasta ahora; cada una encarece las siguientes (`precioParcela`). */
  readonly comprasHechas: number
  readonly valle: Valle
  /** Zona pintada por casilla (índice y*lado+x): `.` ninguna, `c` cultivo, `h` huerto, `v` vivienda, `a` almacén. */
  readonly zonas: string
  /** Ancho del río y vados (casillas de río transitables). */
  readonly cauce: Cauce
  /** Árboles y rocas: bloquean el paso. Se talarán en M5. */
  // TODO: compactar obstáculos y derivar `variante` en la capa de juego antes de fijar el formato de guardado (M7).
  readonly obstaculos: readonly Obstaculo[]
  /** Centro de la casilla de aparición («entrada del valle»), en unidades de casilla. */
  readonly aparicion: { readonly x: number; readonly y: number }
  readonly personaje: Personaje
}

/** El reloj y el personaje están quietos: pausa del jugador o Modo Plano (pausa automática). */
export function tiempoDetenido(estado: Pick<EstadoJuego, 'pausado' | 'modo'>): boolean {
  return estado.pausado || estado.modo === 'plano'
}

export interface OpcionesNuevaPartida {
  readonly semilla: number
  /** Ahorros iniciales; por defecto `CONFIG_ECONOMIA.dineroInicial` (data/economia.json). */
  readonly dineroInicial?: number
  /** Configuración del valle; por defecto `CONFIG_VALLE` (data/valle.json). */
  readonly configValle?: ConfigValle
  /**
   * Minuto del día con el que empieza (solo pruebas y depuración); debe estar en la jornada
   * `horaInicio..horaFin`. Por defecto `horaInicio` (06:00).
   */
  readonly minutoInicial?: number
}

export function crearEstadoInicial(opciones: OpcionesNuevaPartida): EstadoJuego {
  const semilla = opciones.semilla >>> 0
  const config = opciones.configValle ?? CONFIG_VALLE
  const { valle, estadoRng } = generarValle(config, semilla)
  const minuto = opciones.minutoInicial ?? CONFIG_TIEMPO.horaInicio
  if (
    !Number.isInteger(minuto) ||
    minuto < CONFIG_TIEMPO.horaInicio ||
    minuto > CONFIG_TIEMPO.horaFin
  ) {
    throw new RangeError(`minutoInicial fuera de la jornada: ${minuto}`)
  }
  const dinero = opciones.dineroInicial ?? CONFIG_ECONOMIA.dineroInicial
  if (!Number.isSafeInteger(dinero) || dinero < 0) {
    throw new RangeError(`dineroInicial inválido: ${dinero}`)
  }
  const mundo = generarMundo(valle, semilla, config, CONFIG_PERSONAJE)
  return {
    versionFormato: VERSION_FORMATO,
    semilla,
    rng: estadoRng,
    dia: 1,
    minutoDelDia: minuto,
    pausado: false,
    modo: 'vida',
    velocidad: VELOCIDAD_INICIAL,
    dinero,
    comprasHechas: 0,
    valle,
    zonas: zonasVacias(ladoValle(valle)),
    ...mundo,
    personaje: personajeEnAparicion(mundo.aparicion),
  }
}
