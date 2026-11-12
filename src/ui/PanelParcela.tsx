import { useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import { parcelaComprable, precioParcela } from '../core'
import {
  SIMBOLO_AGUA,
  SIMBOLO_FERTILIDAD,
  SIMBOLO_TERRENO,
  estadoDeCompra,
  nombreParcela,
  textoAgua,
  textoFertilidad,
  textoPrecio,
  textoTerreno,
} from './parcelaTextos'
import { t, tp } from './textos'
import { useEstado, usePartida, useSeleccion } from './useEstado'

const SIMBOLO_TONO = { ok: '✓', no: '✕', propia: '★' } as const

function devolverFoco(): void {
  document.getElementById('juego')?.focus({ preventScroll: true })
}

function Atributo(props: { etiqueta: string; simbolo: string; texto: string; clase: string }) {
  return (
    <div class={`parcela-atributo parcela-${props.clase}`}>
      <dt>{props.etiqueta}</dt>
      <dd>
        <span class="parcela-simbolo" aria-hidden="true">
          {props.simbolo}
        </span>
        <span>{props.texto}</span>
      </dd>
    </div>
  )
}

function Contenido({ indice }: { indice: number }) {
  const partida = usePartida()
  const raiz = useRef<HTMLElement>(null)
  const valle = useEstado((e) => e.valle)
  const dinero = useEstado((e) => e.dinero)
  const compras = useEstado((e) => e.comprasHechas)
  const parcela = valle.parcelas[indice]
  const estado = useMemo(
    () => ({ valle, dinero, comprasHechas: compras }),
    [valle, dinero, compras],
  )
  const compra = useMemo(() => parcelaComprable(estado, indice), [estado, indice])
  const precio = useMemo(() => precioParcela(estado, indice), [estado, indice])

  // El panel informa de la zona que tapa para que la escena deje la parcela a la vista.
  useLayoutEffect(() => {
    const el = raiz.current
    if (!el) return
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
      // Si el foco estaba dentro (p. ej. en «Cerrar»), vuelve al lienzo en vez de perderse.
      if (el.contains(document.activeElement)) devolverFoco()
      partida.seleccion.fijarOcupado(undefined)
    }
  }, [partida])

  if (!parcela) return null
  const cerrar = () => {
    partida.seleccion.deseleccionar()
    devolverFoco()
  }
  const { texto, tono } = estadoDeCompra(compra, dinero)
  const id = nombreParcela(parcela.fila, parcela.columna)
  const titulo = tp('parcelaTitulo', { id })
  return (
    <section
      ref={raiz}
      class="panel-parcela"
      role="region"
      aria-labelledby="panel-parcela-titulo"
      data-parcela={indice}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation()
          cerrar()
        }
      }}
    >
      <header class="panel-parcela-cabecera">
        <h2 id="panel-parcela-titulo">{titulo}</h2>
        <button
          type="button"
          class="boton-cerrar"
          aria-label={t('parcelaCerrarAria')}
          onClick={cerrar}
        >
          <span aria-hidden="true">✕</span> {t('parcelaCerrar')}
        </button>
      </header>
      <dl class="parcela-atributos">
        <Atributo
          clase="terreno"
          etiqueta={t('etiquetaTerreno')}
          simbolo={SIMBOLO_TERRENO[parcela.terreno]}
          texto={textoTerreno(parcela.terreno)}
        />
        <Atributo
          clase="fertilidad"
          etiqueta={t('etiquetaFertilidad')}
          simbolo={SIMBOLO_FERTILIDAD[parcela.fertilidad]}
          texto={textoFertilidad(parcela.fertilidad)}
        />
        <Atributo
          clase="agua"
          etiqueta={t('etiquetaAgua')}
          simbolo={SIMBOLO_AGUA[parcela.agua]}
          texto={textoAgua(parcela.agua)}
        />
        <Atributo
          clase="precio"
          etiqueta={t('etiquetaPrecio')}
          simbolo={parcela.estado === 'propia' ? '★' : '🪙'}
          texto={
            parcela.estado === 'propia'
              ? t('precioTuya')
              : precio === undefined
                ? t('precioDesconocido')
                : textoPrecio(precio)
          }
        />
      </dl>
      <p class={`parcela-compra parcela-compra-${tono}`} role="status">
        <span class="parcela-simbolo" aria-hidden="true">
          {SIMBOLO_TONO[tono]}
        </span>
        <span>{texto}</span>
      </p>
      {/* Hueco reservado para «Comprar» y su confirmación (M3-04). */}
      <div class="panel-parcela-acciones" data-hueco="comprar" />
    </section>
  )
}

/** Panel de detalle de la parcela seleccionada; solo existe en el Modo Plano. */
export function PanelParcela() {
  const indice = useSeleccion()
  const modo = useEstado((e) => e.modo)
  if (indice === undefined || modo !== 'plano') return null
  return <Contenido key={indice} indice={indice} />
}
