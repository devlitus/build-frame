import { useLayoutEffect, useRef } from 'preact/hooks'
import { BarraHerramientas, BotonAccion, BotonDormir } from './BarraHerramientas'
import { BotonZonas } from './BarraZonas'
import { BotonModo } from './BotonModo'
import { BotonConstruir } from './PanelConstruir'
import { BotonInventario } from './PanelInventario'
import {
  useConstruccion,
  useEdificioSeleccionado,
  useEstado,
  usePincel,
  useSeleccion,
} from './useEstado'

/**
 * Publica en `.hud` la variable `--reserva-barra`: lo que la barra ocupa desde su borde superior
 * hasta el pie de la pantalla. Los paneles se colocan encima de la barra con ella, aunque la barra
 * pase a dos filas (móvil en vertical) o cambie de contenido.
 */
function useReservaBarra(caja: { current: HTMLElement | null }): void {
  useLayoutEffect(() => {
    const el = caja.current
    const hud = el?.closest<HTMLElement>('.hud')
    if (!el || !hud) return
    const medir = (): void => {
      const reserva = Math.ceil(hud.getBoundingClientRect().bottom - el.getBoundingClientRect().top)
      hud.style.setProperty('--reserva-barra', `${Math.max(0, reserva)}px`)
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    observador.observe(hud)
    return () => {
      observador.disconnect()
    }
  }, [caja])
}

/**
 * Barra inferior única, compacta y centrada (petición de la PO tras M5): reúne lo que antes estaba
 * suelto abajo a la derecha, para dejar libres las esquinas (la parcela de aparición y la casa).
 * - Vida: ranuras de herramientas (1–6), «Usar …» (E o Espacio), «Inventario» (I) y el modo (M).
 *   «Dormir» (Z) aparece encima de la barra, junto al modo, sin mover los demás botones.
 * - Plano: «Construir», «Zonas» y el modo.
 * En apaisado bajo, con un panel de Plano abierto a la izquierda, la barra se arrima a la derecha.
 */
export function BarraInferior() {
  const vida = useEstado((e) => e.modo === 'vida')
  const construir = useConstruccion().abierto
  const zonas = usePincel().abierto
  const parcela = useSeleccion()
  const edificio = useEdificioSeleccionado().id
  const conPanel = !vida && (construir || zonas || parcela !== undefined || edificio !== undefined)
  const caja = useRef<HTMLDivElement>(null)
  useReservaBarra(caja)
  return (
    <div class={conPanel ? 'barra-inferior barra-inferior-con-panel' : 'barra-inferior'}>
      <div ref={caja} class="barra-inferior-caja" data-modo={vida ? 'vida' : 'plano'}>
        <BarraHerramientas />
        <div class="barra-inferior-acciones">
          <BotonAccion />
          <BotonInventario />
          <BotonConstruir />
          <BotonZonas />
          <BotonModo />
          <BotonDormir />
        </div>
      </div>
    </div>
  )
}
