import { createContext } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import type { EstadoJuego } from '../core'
import type { Partida } from '../game/partida'

/** La partida en curso; la pone `Hud` en la raíz de la interfaz de juego. */
export const ContextoPartida = createContext<Partida | undefined>(undefined)

export function usePartida(): Partida {
  const p = useContext(ContextoPartida)
  if (!p) throw new Error('No hay partida: falta el proveedor ContextoPartida')
  return p
}

/** Índice de la parcela seleccionada (estado de interfaz), o undefined; repinta al cambiar. */
export function useSeleccion(): number | undefined {
  const { seleccion } = usePartida()
  const [indice, setIndice] = useState(seleccion.indice)
  useEffect(() => {
    const actualizar = () => {
      setIndice(seleccion.indice)
    }
    actualizar()
    return seleccion.suscribir(actualizar)
  }, [seleccion])
  return indice
}

/** Fuente externa: la porción del estado que elige `selector`. */
export function fuenteDeEstado<T>(partida: Partida, selector: (estado: EstadoJuego) => T) {
  return {
    suscribir: (alCambiar: () => void) => partida.suscribir(alCambiar),
    leer: () => selector(partida.estado),
  }
}

/**
 * Lee una porción del estado de la partida y vuelve a pintar solo cuando cambia (`Object.is`).
 * El selector debe devolver primitivos o referencias estables. La suscripción es una por
 * partida (no se rehace en cada render). Lo reutilizan los demás componentes (hora, fecha...).
 */
export function useEstado<T>(selector: (estado: EstadoJuego) => T): T {
  const partida = usePartida()
  const [valor, setValor] = useState<T>(() => selector(partida.estado))
  // Siempre el selector del último render, sin volver a suscribirse.
  const ref = useRef(selector)
  ref.current = selector
  useEffect(() => {
    const actualizar = () => {
      const nuevo = ref.current(partida.estado)
      setValor((viejo) => (Object.is(viejo, nuevo) ? viejo : nuevo))
    }
    actualizar() // por si cambió entre el render y la suscripción
    return partida.suscribir(actualizar)
  }, [partida])
  return valor
}
