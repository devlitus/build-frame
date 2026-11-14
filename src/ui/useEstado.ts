import { createContext } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import type { EstadoJuego, TipoEdificio } from '../core'
import type { OrigenConfirmacion, Silueta } from '../game/construir'
import type { AccionConfirmable, OrigenConfirmacionEdificio } from '../game/edificioSeleccion'
import type { OrigenInventario } from '../game/panelInventario'
import type { HerramientaPincel } from '../game/pincel'
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

/** Estado del pincel de zonas (barra abierta y herramienta elegida); repinta al cambiar. */
export function usePincel(): { abierto: boolean; herramienta: HerramientaPincel | undefined } {
  const { pincel } = usePartida()
  const [, repintar] = useState(0)
  // Lo último que se pintó: solo se fuerza el render si cambia alguno de los dos campos.
  const visto = useRef({ abierto: pincel.abierto, herramienta: pincel.herramienta })
  useEffect(() => {
    const actualizar = () => {
      const { abierto, herramienta } = pincel
      if (visto.current.abierto === abierto && visto.current.herramienta === herramienta) return
      visto.current = { abierto, herramienta }
      repintar((n) => n + 1)
    }
    actualizar() // por si cambió entre el render y la suscripción
    return pincel.suscribir(actualizar)
  }, [pincel])
  return { abierto: pincel.abierto, herramienta: pincel.herramienta }
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

/** Estado del modo Construir (abierto, edificio elegido y confirmación); repinta al cambiar. */
export function useConstruccion(): {
  abierto: boolean
  tipo: TipoEdificio | undefined
  /** `id` del edificio que se está moviendo (modo mover), o undefined al construir. */
  origen: number | undefined
  confirmando: OrigenConfirmacion | undefined
} {
  const { construccion } = usePartida()
  const [, repintar] = useState(0)
  const visto = useRef({
    abierto: construccion.abierto,
    tipo: construccion.tipo,
    origen: construccion.origen,
    confirmando: construccion.confirmando,
  })
  useEffect(() => {
    const actualizar = () => {
      const { abierto, tipo, origen, confirmando } = construccion
      const v = visto.current
      if (
        v.abierto === abierto &&
        v.tipo === tipo &&
        v.origen === origen &&
        v.confirmando === confirmando
      ) {
        return
      }
      visto.current = { abierto, tipo, origen, confirmando }
      repintar((n) => n + 1)
    }
    actualizar() // por si cambió entre el render y la suscripción
    return construccion.suscribir(actualizar)
  }, [construccion])
  return {
    abierto: construccion.abierto,
    tipo: construccion.tipo,
    origen: construccion.origen,
    confirmando: construccion.confirmando,
  }
}

/** Edificio u obra seleccionado y confirmación abierta (demoler o cancelar la obra); repinta al cambiar. */
export function useEdificioSeleccionado(): {
  id: number | undefined
  confirmando: { accion: AccionConfirmable; origen: OrigenConfirmacionEdificio } | undefined
} {
  const { edificioSeleccionado } = usePartida()
  const [, repintar] = useState(0)
  const visto = useRef({
    id: edificioSeleccionado.id,
    confirmando: edificioSeleccionado.confirmando,
  })
  useEffect(() => {
    const actualizar = () => {
      const { id, confirmando } = edificioSeleccionado
      if (visto.current.id === id && visto.current.confirmando === confirmando) return
      visto.current = { id, confirmando }
      repintar((n) => n + 1)
    }
    actualizar() // por si cambió entre el render y la suscripción
    return edificioSeleccionado.suscribir(actualizar)
  }, [edificioSeleccionado])
  return { id: edificioSeleccionado.id, confirmando: edificioSeleccionado.confirmando }
}

/**
 * Silueta del edificio elegido (con el veredicto del núcleo); repinta cuando se mueve o cambia el
 * estado. Solo se usa con el modo Construir abierto (el estado del Modo Plano está parado).
 */
export function useSilueta(): Silueta | undefined {
  const partida = usePartida()
  const [, repintar] = useState(0)
  useEffect(() => {
    const avisar = () => repintar((n) => n + 1)
    const a = partida.suscribir(avisar)
    const b = partida.construccion.suscribir(avisar)
    return () => {
      a()
      b()
    }
  }, [partida])
  return partida.silueta()
}

/** ¿Está abierto el panel de inventario (y quién lo abrió)? Repinta al cambiar. */
export function useInventarioAbierto(): { abierto: boolean; origen: OrigenInventario } {
  const { inventario } = usePartida()
  const [, repintar] = useState(0)
  useEffect(() => {
    let visto = inventario.abierto
    const actualizar = () => {
      if (visto === inventario.abierto) return
      visto = inventario.abierto
      repintar((n) => n + 1)
    }
    actualizar() // por si cambió entre el render y la suscripción
    return inventario.suscribir(actualizar)
  }, [inventario])
  return { abierto: inventario.abierto, origen: inventario.origen }
}
