import type { EstadoJuego } from './estado'
import { CONFIG_TIEMPO } from './datos/tiempo'

/**
 * Todo cambio de estado del juego ocurre mediante un comando (ADR 0004).
 * Unión discriminada: cada hito añade sus comandos aquí.
 */
export type Comando =
  | { readonly tipo: 'AvanzarTiempo'; readonly minutos: number }
  | { readonly tipo: 'Pausar' }
  | { readonly tipo: 'Reanudar' }
  | { readonly tipo: 'CambiarVelocidad'; readonly velocidad: number }

/**
 * Hechos ocurridos al aplicar un comando, para que la capa de juego reaccione (avisos, efectos).
 * `desmayo`: el avance superó el fin de la jornada (02:00); el reloj pasó al día siguiente a
 * las 06:00 sin penalización (aviso en M2-06, personaje a la aparición en M2-02).
 */
export type EventoJuego = { readonly tipo: 'desmayo' }

export type ResultadoComando =
  | { readonly ok: true; readonly estado: EstadoJuego; readonly eventos: readonly EventoJuego[] }
  | { readonly ok: false; readonly estado: EstadoJuego; readonly error: ErrorComando }

export type ErrorComando = 'parametro-invalido' | 'comando-desconocido' | 'limite-de-dia'

const SIN_EVENTOS: readonly EventoJuego[] = Object.freeze([])

/** Función pura: mismo estado + mismo comando ⇒ mismo resultado. Nunca muta `estado`. */
export function aplicarComando(estado: EstadoJuego, comando: Comando): ResultadoComando {
  switch (comando.tipo) {
    case 'AvanzarTiempo': {
      if (!Number.isInteger(comando.minutos) || comando.minutos < 0) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      if (estado.pausado || comando.minutos === 0) return { ok: true, estado, eventos: SIN_EVENTOS }
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
          estado: { ...estado, dia: estado.dia + 1, minutoDelDia: CONFIG_TIEMPO.horaInicio },
        }
      }
      return { ok: true, eventos: SIN_EVENTOS, estado: { ...estado, minutoDelDia: minuto } }
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
    default:
      return { ok: false, estado, error: 'comando-desconocido' }
  }
}

/** Aplica una secuencia de comandos; los rechazados no cambian el estado. */
export function aplicarComandos(estado: EstadoJuego, comandos: readonly Comando[]): EstadoJuego {
  return comandos.reduce((e, c) => aplicarComando(e, c).estado, estado)
}
