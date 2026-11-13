import { MODOS_JUEGO, tiempoDetenido, type EstadoJuego, type ModoJuego } from './estado'
import { CONFIG_TIEMPO } from './datos/tiempo'
import { parcelaComprable } from './parcelas'
import { aplicarZonas, CARACTER_SIN_ZONA, CARACTER_ZONA, ZONAS, type Zona } from './zonas'
import { moverPersonaje, personajeEnAparicion } from './personaje'

/**
 * Todo cambio de estado del juego ocurre mediante un comando (ADR 0004).
 * Unión discriminada: cada hito añade sus comandos aquí.
 */
export type Comando =
  | { readonly tipo: 'AvanzarTiempo'; readonly minutos: number }
  | {
      readonly tipo: 'MoverPersonaje'
      /** Intención de movimiento en [-1, 1] por eje (x al este, y al sur); se normaliza. */
      readonly dx: number
      readonly dy: number
      /** Milisegundos de movimiento (≥ 0); el núcleo procesa como máximo `maxMsPorComando`. */
      readonly ms: number
    }
  /** Cambia de modo; no toca `pausado` (la pausa del Plano se deriva en `tiempoDetenido`). */
  | { readonly tipo: 'CambiarModo'; readonly modo: ModoJuego }
  | { readonly tipo: 'Pausar' }
  | { readonly tipo: 'Reanudar' }
  | { readonly tipo: 'CambiarVelocidad'; readonly velocidad: number }
  /** Compra la parcela `indice` (reglas en `parcelaComprable`); no depende del reloj. */
  | { readonly tipo: 'ComprarParcela'; readonly indice: number }
  /**
   * Pinta una zona en un rectángulo de casillas globales (esquinas inclusivas, cualquier orden).
   * Solo casillas de parcelas propias que no sean río; planificación: no depende del modo ni del reloj.
   */
  | {
      readonly tipo: 'PintarZona'
      readonly x0: number
      readonly y0: number
      readonly x1: number
      readonly y1: number
      readonly zona: Zona
    }
  /** Quita la zona de las casillas del rectángulo (mismas reglas de validez que `PintarZona`). */
  | {
      readonly tipo: 'BorrarZona'
      readonly x0: number
      readonly y0: number
      readonly x1: number
      readonly y1: number
    }

/**
 * Hechos ocurridos al aplicar un comando, para que la capa de juego reaccione (avisos, efectos).
 * `desmayo`: el avance superó el fin de la jornada (02:00); el reloj pasó al día siguiente a
 * las 06:00 sin penalización y el personaje vuelve a la aparición (aviso en M2-06).
 */
export type EventoJuego =
  | { readonly tipo: 'desmayo' }
  | { readonly tipo: 'parcela-comprada'; readonly indice: number; readonly precio: number }
  /** Zona pintada o borrada; `casillas` es el número de casillas que cambiaron. */
  | { readonly tipo: 'zona-pintada'; readonly casillas: number }

export type ResultadoComando =
  | { readonly ok: true; readonly estado: EstadoJuego; readonly eventos: readonly EventoJuego[] }
  | { readonly ok: false; readonly estado: EstadoJuego; readonly error: ErrorComando }

export type ErrorComando =
  | 'parametro-invalido'
  | 'comando-desconocido'
  | 'limite-de-dia'
  | 'fondos-insuficientes'
  | 'ya-propia'
  | 'no-adyacente'
  | 'precio-invalido'
  | 'sin-casillas-validas'

const SIN_EVENTOS: readonly EventoJuego[] = Object.freeze([])

/** Función pura: mismo estado + mismo comando ⇒ mismo resultado. Nunca muta `estado`. */
export function aplicarComando(estado: EstadoJuego, comando: Comando): ResultadoComando {
  switch (comando.tipo) {
    case 'AvanzarTiempo': {
      if (!Number.isInteger(comando.minutos) || comando.minutos < 0) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (tiempoDetenido(estado) || comando.minutos === 0)
        return { ok: true, estado, eventos: SIN_EVENTOS }
      const minuto = estado.minutoDelDia + comando.minutos
      if (minuto > CONFIG_TIEMPO.horaFin) {
        if (!Number.isSafeInteger(estado.dia + 1)) {
          return { ok: false, estado, error: 'limite-de-dia' }
        }
        // Desmayo: el avance se corta en el fin de jornada y el sobrante se descarta,
        // así un avance enorme nunca salta días de golpe.
        return {
          ok: true,
          eventos: [{ tipo: 'desmayo' }],
          estado: {
            ...estado,
            dia: estado.dia + 1,
            minutoDelDia: CONFIG_TIEMPO.horaInicio,
            personaje: personajeEnAparicion(estado.aparicion),
          },
        }
      }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, minutoDelDia: minuto } }
    }
    case 'MoverPersonaje': {
      const { dx, dy, ms } = comando
      const eje = (n: unknown): boolean => typeof n === 'number' && n >= -1 && n <= 1
      if (!eje(dx) || !eje(dy) || typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (tiempoDetenido(estado) || ms === 0 || (dx === 0 && dy === 0)) {
        return { ok: true, estado, eventos: SIN_EVENTOS }
      }
      const personaje = moverPersonaje(estado, estado.personaje, dx, dy, ms)
      const antes = estado.personaje
      // Contra un muro no cambia nada: se devuelve el mismo estado (sin avisos por fotograma).
      if (
        personaje.x === antes.x &&
        personaje.y === antes.y &&
        personaje.orientacion === antes.orientacion
      ) {
        return { ok: true, estado, eventos: SIN_EVENTOS }
      }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, personaje } }
    }
    case 'CambiarModo': {
      if (!MODOS_JUEGO.includes(comando.modo)) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (comando.modo === estado.modo) return { ok: true, estado, eventos: SIN_EVENTOS }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, modo: comando.modo } }
    }
    case 'Pausar':
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, pausado: true } }
    case 'Reanudar':
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, pausado: false } }
    case 'CambiarVelocidad': {
      if (!CONFIG_TIEMPO.velocidades.includes(comando.velocidad)) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, velocidad: comando.velocidad } }
    }
    case 'ComprarParcela': {
      const r = parcelaComprable(estado, comando.indice)
      if (!r.comprable) return { ok: false, estado, error: r.motivo }
      const indice = comando.indice + 0 // -0 se normaliza a 0
      const parcelas = estado.valle.parcelas.map((p, i) =>
        i === indice ? { ...p, estado: 'propia' as const } : p,
      )
      return {
        ok: true,
        eventos: [{ tipo: 'parcela-comprada', indice, precio: r.precio }],
        estado: {
          ...estado,
          dinero: estado.dinero - r.precio,
          comprasHechas: estado.comprasHechas + 1,
          valle: { ...estado.valle, parcelas },
        },
      }
    }
    case 'PintarZona':
    case 'BorrarZona': {
      const caracter =
        comando.tipo === 'BorrarZona'
          ? CARACTER_SIN_ZONA
          : ZONAS.includes(comando.zona)
            ? CARACTER_ZONA[comando.zona]
            : undefined
      if (caracter === undefined) return { ok: false, estado, error: 'parametro-invalido' }
      const r = aplicarZonas(estado, comando, caracter)
      if (!r.ok) return { ok: false, estado, error: r.error }
      if (r.cambiadas === 0) return { ok: true, estado, eventos: SIN_EVENTOS }
      return {
        ok: true,
        eventos: [{ tipo: 'zona-pintada', casillas: r.cambiadas }],
        estado: { ...estado, zonas: r.zonas },
      }
    }
    default:
      return { ok: false, estado, error: 'comando-desconocido' }
  }
}

/** Aplica una secuencia de comandos; los rechazados no cambian el estado. */
export function aplicarComandos(estado: EstadoJuego, comandos: readonly Comando[]): EstadoJuego {
  return comandos.reduce((e, c) => aplicarComando(e, c).estado, estado)
}
