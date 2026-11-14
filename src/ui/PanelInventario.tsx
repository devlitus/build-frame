import { useLayoutEffect, useRef } from 'preact/hooks'
import {
  capacidadInventario,
  esSemilla,
  type Inventario,
  type ObjetoId,
  type Ranura,
} from '../core'
import { rutaIconoObjeto } from './iconos'
import { t, tp, type ClaveTexto } from './textos'
import { useEstado, useInventarioAbierto, usePartida } from './useEstado'

function devolverFoco(): void {
  document.getElementById('juego')?.focus({ preventScroll: true })
}

export function nombreObjeto(o: ObjetoId): string {
  return t(`objeto_${o}` as ClaveTexto)
}

/** Botón «Inventario»: visible en el Modo Vida mientras el panel está cerrado. */
export function BotonInventario() {
  const partida = usePartida()
  const vida = useEstado((e) => e.modo === 'vida')
  const { abierto } = useInventarioAbierto()
  if (!vida || abierto) return null
  return (
    <button
      type="button"
      class="boton-inventario"
      aria-keyshortcuts="I"
      title={t('inventarioBotonAyuda')}
      onClick={(ev) => {
        // `detail` es 0 si lo activó el teclado: entonces el foco pasa al panel.
        partida.inventario.abrir(ev.detail > 0 ? 'puntero' : 'teclado')
        if (ev.detail > 0) devolverFoco()
      }}
    >
      {t('inventarioBoton')}
    </button>
  )
}

/** Icono del objeto: su imagen o, mientras no tenga arte, una ficha con su inicial. */
function IconoObjeto(props: { objeto: ObjetoId }) {
  const ruta = rutaIconoObjeto(props.objeto)
  if (ruta) {
    return (
      <img
        class="ranura-icono"
        src={ruta}
        alt=""
        width="32"
        height="32"
        draggable={false}
        aria-hidden="true"
      />
    )
  }
  return (
    <span class="ranura-icono ranura-placeholder" aria-hidden="true">
      {nombreObjeto(props.objeto).charAt(0)}
    </span>
  )
}

function ContenidoRanura(props: { ranura: Ranura }) {
  const { objeto, cantidad } = props.ranura
  return (
    <>
      <IconoObjeto objeto={objeto} />
      <span class="ranura-nombre">{nombreObjeto(objeto)}</span>
      <span class="ranura-cantidad">{cantidad}</span>
    </>
  )
}

function CeldaRanura(props: {
  ranura: Ranura | undefined
  fuera: boolean
  elegida: ObjetoId | null
}) {
  const partida = usePartida()
  const { ranura, fuera, elegida } = props
  const clase = `ranura${ranura ? '' : ' ranura-vacia'}${fuera ? ' ranura-fuera' : ''}`
  if (!ranura) {
    return (
      <li class={clase}>
        <span class="solo-lector">{t('ranuraVacia')}</span>
      </li>
    )
  }
  const fueraTexto = fuera ? `, ${t('ranuraFuera')}` : ''
  if (!esSemilla(ranura.objeto)) {
    return (
      <li class={clase} data-objeto={ranura.objeto}>
        <ContenidoRanura ranura={ranura} />
        {fuera && <span class="solo-lector">{fueraTexto}</span>}
      </li>
    )
  }
  const esLaElegida = elegida === ranura.objeto
  const etiqueta = tp('ranuraCantidad', { objeto: nombreObjeto(ranura.objeto), n: ranura.cantidad })
  return (
    <li class={clase} data-objeto={ranura.objeto}>
      <button
        type="button"
        class="ranura-boton"
        aria-pressed={esLaElegida}
        aria-label={`${etiqueta}${fueraTexto}. ${esLaElegida ? t('ranuraElegida') : t('ranuraElegir')}`}
        onClick={(ev) => {
          partida.elegirSemilla(ranura.objeto)
          if (ev.detail > 0) devolverFoco()
        }}
      >
        <ContenidoRanura ranura={ranura} />
      </button>
    </li>
  )
}

/** Cuadrícula de ranuras: las de la capacidad (vacías o llenas) y, si sobran objetos, las de más. */
function Ranuras(props: { inventario: Inventario; capacidad: number; elegida: ObjetoId | null }) {
  const total = Math.max(props.capacidad, props.inventario.length)
  const celdas = Array.from({ length: total }, (_, i) => i)
  return (
    <ul class="ranuras" aria-label={t('inventarioRanuras')}>
      {celdas.map((i) => (
        <CeldaRanura
          key={i}
          ranura={props.inventario[i]}
          fuera={i >= props.capacidad}
          elegida={props.elegida}
        />
      ))}
    </ul>
  )
}

/**
 * Panel de inventario (Modo Vida): ranuras, cantidades y capacidad. Se abre con el botón o la tecla
 * I y se cierra con Escape, I o «Cerrar». Las semillas se pueden elegir (botón por ranura) y las
 * herramientas no ocupan ranuras. Con el teclado el foco entra en el panel; al cerrar vuelve al lienzo.
 */
export function PanelInventario() {
  const partida = usePartida()
  const vida = useEstado((e) => e.modo === 'vida')
  const inventario = useEstado((e) => e.inventario)
  const edificios = useEstado((e) => e.edificios)
  const elegida = useEstado((e) => e.semillaElegida)
  const { abierto, origen } = useInventarioAbierto()
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (abierto && origen === 'teclado') ref.current?.focus({ preventScroll: true })
  }, [abierto, origen])
  if (!vida || !abierto) return null
  const capacidad = capacidadInventario(edificios)
  const sobra = inventario.length > capacidad
  const cerrar = (): void => {
    devolverFoco()
    partida.inventario.cerrar()
  }
  return (
    <section
      ref={ref}
      class="panel-inventario"
      aria-label={t('inventarioPanel')}
      tabIndex={-1}
      onKeyDown={(ev) => {
        if (ev.ctrlKey || ev.altKey || ev.metaKey) return
        if (ev.key === 'i' || ev.key === 'I') {
          ev.preventDefault()
          cerrar()
        }
      }}
    >
      <div class="panel-inventario-caja">
        <div class="inventario-cabecera">
          <h2 class="inventario-titulo">{t('inventarioTitulo')}</h2>
          <p
            class={
              sobra ? 'inventario-capacidad inventario-capacidad-sobra' : 'inventario-capacidad'
            }
          >
            {tp('inventarioCapacidad', { n: inventario.length, m: capacidad })}
          </p>
          <button
            type="button"
            class="boton-cerrar"
            aria-label={t('inventarioCerrarAria')}
            onClick={cerrar}
          >
            {t('inventarioCerrar')}
          </button>
        </div>
        {sobra && (
          <p class="inventario-aviso" role="status">
            {t('inventarioSobra')}
          </p>
        )}
        <p class="inventario-ayuda">{t('inventarioAyuda')}</p>
        <Ranuras inventario={inventario} capacidad={capacidad} elegida={elegida} />
      </div>
    </section>
  )
}
