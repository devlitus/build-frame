import type { EstadoJuego } from './estado'

/**
 * Todo cambio de estado del juego ocurre mediante un comando (ADR 0004).
 * Unión discriminada: cada hito añade sus comandos aquí.
 */
export type Comando = { readonly tipo: 'AvanzarTiempo'; readonly minutos: number }

export type ResultadoComando =
  | { readonly ok: true; readonly estado: EstadoJuego }
  | { readonly ok: false; readonly estado: EstadoJuego; readonly error: ErrorComando }

export type ErrorComando = 'parametro-invalido'

/** Función pura: mismo estado + mismo comando ⇒ mismo resultado. Nunca muta `estado`. */
export function aplicarComando(estado: EstadoJuego, comando: Comando): ResultadoComando {
  switch (comando.tipo) {
    case 'AvanzarTiempo': {
      if (!Number.isInteger(comando.minutos) || comando.minutos < 0) {
        return { ok: false, estado, error: 'parametro-invalido' }
      }
      return { ok: true, estado: { ...estado, minutos: estado.minutos + comando.minutos } }
    }
  }
}

/** Aplica una secuencia de comandos; los rechazados no cambian el estado. */
export function aplicarComandos(estado: EstadoJuego, comandos: readonly Comando[]): EstadoJuego {
  return comandos.reduce((e, c) => aplicarComando(e, c).estado, estado)
}
