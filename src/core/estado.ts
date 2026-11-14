import { CONFIG_VALLE } from './datos/valle'
import { CONFIG_ECONOMIA } from './datos/economia'
import { CONFIG_EDIFICIOS } from './datos/edificios'
import { CONFIG_TIEMPO } from './datos/tiempo'
import type { ConfigValle } from './datos/esquemas'
import { generarValle, type Valle } from './valle'
import { CONFIG_PERSONAJE } from './datos/personaje'
import type { Obstaculo } from './decoracion'
import { generarMundo, ladoValle, type Cauce } from './mapa'
import { zonasVacias } from './zonas'
import { tierraVacia, type Planta } from './tierra'
import type { Edificio, Materiales } from './edificios'
import { personajeEnAparicion, type Personaje } from './personaje'
import { CONFIG_INVENTARIO } from './datos/inventario'
import { CONFIG_ENERGIA } from './datos/energia'
import {
  inventarioInicial,
  inventarioValido,
  type Herramienta,
  type Inventario,
  type ObjetoId,
} from './inventario'

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
 * v8 (M4-02): se añaden `materiales` (madera y piedra), `edificios` (obras y edificios
 * colocados) y `siguienteIdEdificio`. Sin migración: sigue sin haber partidas guardadas.
 * v9 (M5-01): se añaden `inventario` (ranuras `{objeto, cantidad}`), `herramienta` (la activa) y
 * `semillaElegida` (objeto o `null`). Sin migración: sigue sin haber partidas guardadas.
 * v10 (M5-02): se añade `energia` (entero en 0..máximo de `data/energia.json`). Sin migración:
 * sigue sin haber partidas guardadas.
 * v11 (M5-03): se añaden `tierra` (cadena de `lado*lado` caracteres: sin labrar o arada) y
 * `plantas` (una tupla por casilla plantada). Sin migración: sigue sin haber partidas guardadas.
 */
export const VERSION_FORMATO = 11

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
  /** Energía del personaje: entero en 0..`CONFIG_ENERGIA.maximo`. Cada uso de herramienta gasta; dormir la llena. */
  readonly energia: number
  /** Materiales de construcción (enteros ≥ 0); el lote de bienvenida está en `data/edificios.json`. */
  readonly materiales: Materiales
  /**
   * Objetos del jugador (semillas, productos, plantones) en ranuras; la capacidad depende de los
   * cobertizos terminados (`capacidadInventario`). Madera y piedra no van aquí (`materiales`).
   */
  readonly inventario: Inventario
  /** Herramienta activa del Modo Vida (no ocupa ranura). */
  readonly herramienta: Herramienta
  /** Semilla que planta la herramienta «semillas» (un objeto del inventario), o `null` si no hay ninguna elegida. */
  readonly semillaElegida: ObjetoId | null
  /** Parcelas compradas hasta ahora; cada una encarece las siguientes (`precioParcela`). */
  readonly comprasHechas: number
  readonly valle: Valle
  /** Zona pintada por casilla (índice y*lado+x): `.` ninguna, `c` cultivo, `h` huerto, `v` vivienda, `a` almacén. */
  readonly zonas: string
  /** Tierra trabajada por casilla (índice y*lado+x): `.` sin labrar, `a` arada (ver `tierra.ts`). */
  readonly tierra: string
  /** Plantas de las casillas aradas, ordenadas por casilla (ver `Planta` en `tierra.ts`). */
  readonly plantas: readonly Planta[]
  /** Obras y edificios; bloquean el paso. `obra` es `null` cuando el edificio está terminado. */
  readonly edificios: readonly Edificio[]
  /** Id que tendrá el próximo edificio (crece siempre; los ids no se reutilizan). */
  readonly siguienteIdEdificio: number
  /** Ancho del río y vados (casillas de río transitables). */
  readonly cauce: Cauce
  /** Árboles, rocas y plantones (los plantones aún no bloquean el paso); se talan, pican y replantan en M5-06. */
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
  /** Materiales iniciales; por defecto `CONFIG_EDIFICIOS.materialesIniciales` (data/edificios.json). */
  readonly materialesIniciales?: Materiales
  /** Inventario inicial; por defecto el lote de regalo de `data/inventario.json`. */
  readonly inventarioInicial?: Inventario
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
  const materiales = opciones.materialesIniciales ?? CONFIG_EDIFICIOS.materialesIniciales
  if (
    !Number.isSafeInteger(materiales.madera) ||
    materiales.madera < 0 ||
    !Number.isSafeInteger(materiales.piedra) ||
    materiales.piedra < 0
  ) {
    throw new RangeError('materialesIniciales inválidos')
  }
  const inventario = opciones.inventarioInicial ?? inventarioInicial()
  if (!inventarioValido(inventario)) throw new RangeError('inventarioInicial inválido')
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
    energia: CONFIG_ENERGIA.maximo,
    materiales: { madera: materiales.madera, piedra: materiales.piedra },
    inventario: inventario.map((r) => ({ ...r })),
    herramienta: CONFIG_INVENTARIO.herramientaInicial,
    semillaElegida: null,
    comprasHechas: 0,
    valle,
    zonas: zonasVacias(ladoValle(valle)),
    tierra: tierraVacia(ladoValle(valle)),
    plantas: [],
    edificios: [],
    siguienteIdEdificio: 1,
    ...mundo,
    personaje: personajeEnAparicion(mundo.aparicion),
  }
}
