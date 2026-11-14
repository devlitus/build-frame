import { useLayoutEffect, useRef } from 'preact/hooks'
import { ZONAS, type Zona } from '../core'
import type { HerramientaPincel } from '../game/pincel'
import { rutaTiraZona } from '../game/valle/arte'
import { ESTILO_PREVIA } from '../game/valle/estilo'
import { dprActual, sufijoArte } from '../game/resolucion'
import { t, type ClaveTexto } from './textos'
import { useEstado, usePartida, usePincel } from './useEstado'

/** Tras un clic o toque el foco vuelve al lienzo (para el teclado del pincel); con teclado se queda. */
function devolverFoco(ev: MouseEvent): void {
  if (ev.detail > 0) document.getElementById('juego')?.focus({ preventScroll: true })
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`

/** Botón «Zonas»: visible en el Modo Plano mientras la barra está cerrada. */
export function BotonZonas() {
  const partida = usePartida()
  const plano = useEstado((e) => e.modo === 'plano')
  const { abierto } = usePincel()
  if (!plano || abierto) return null
  return (
    <button
      type="button"
      class="boton-zonas"
      title={t('zonasBotonAyuda')}
      onClick={(ev) => {
        partida.pincel.abrir()
        devolverFoco(ev)
      }}
    >
      {t('zonasBoton')}
    </button>
  )
}

function Herramienta(props: { id: HerramientaPincel; actual: HerramientaPincel | undefined }) {
  const partida = usePartida()
  const { id } = props
  const pulsada = props.actual === id
  const clave = (id === 'borrar' ? 'zonasBorrar' : `zona_${id}`) as ClaveTexto
  return (
    <button
      type="button"
      class={`herramienta-zona herramienta-${id}`}
      aria-pressed={pulsada}
      onClick={(ev) => {
        partida.pincel.elegir(pulsada ? undefined : id)
        devolverFoco(ev)
      }}
    >
      <span
        class={`muestra-zona muestra-${id}`}
        aria-hidden="true"
        style={
          id === 'borrar'
            ? { '--zona': hex(ESTILO_PREVIA.borrar) }
            : { backgroundImage: `url(${rutaTiraZona(id as Zona, sufijoArte(dprActual()))})` }
        }
      />
      <span>{t(clave)}</span>
    </button>
  )
}

/**
 * Barra del pincel de zonas: las cuatro zonas, el borrador y «Listo». Va sobre el botón de modo y
 * ocupa todo el ancho (como la hoja del panel de parcela) para que la guía de cámara sepa qué tapa.
 */
export function BarraZonas() {
  const partida = usePartida()
  const { abierto, herramienta } = usePincel()
  const raiz = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = raiz.current
    if (!abierto || !el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      partida.seleccion.fijarOcupado({ x: r.x, y: r.y, ancho: r.width, alto: r.height })
    }
    medir()
    const obs = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(medir)
    obs?.observe(el)
    window.addEventListener('resize', medir)
    return () => {
      obs?.disconnect()
      window.removeEventListener('resize', medir)
      if (el.contains(document.activeElement)) {
        document.getElementById('juego')?.focus({ preventScroll: true })
      }
      partida.seleccion.fijarOcupado(undefined)
    }
  }, [partida, abierto])

  if (!abierto) return null
  return (
    <div class="barra-zonas" ref={raiz}>
      <div class="barra-zonas-caja" role="group" aria-label={t('zonasBarra')}>
        {ZONAS.map((z) => (
          <Herramienta key={z} id={z} actual={herramienta} />
        ))}
        <Herramienta id="borrar" actual={herramienta} />
        <button
          type="button"
          class="boton-listo"
          title={t('zonasListoAyuda')}
          onClick={() => {
            // Con teclado también: al desmontarse la barra el foco se perdería en <body>.
            document.getElementById('juego')?.focus({ preventScroll: true })
            partida.pincel.cerrar()
          }}
        >
          {t('zonasListo')}
        </button>
      </div>
    </div>
  )
}
