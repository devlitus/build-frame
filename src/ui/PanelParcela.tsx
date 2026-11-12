import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
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
import { intentarCompra } from './compra'
import { formatearDinero } from './formatoDinero'
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

  // Confirmación de compra dentro del panel. Vive aquí (no en el botón) para que Esc la cancele
  // desde cualquier punto del panel antes de cerrarlo. Cambiar de parcela desmonta `Contenido`
  // (clave = índice) y cambiar de modo desmonta el panel: ambas la descartan.
  const [confirmando, setConfirmando] = useState(false)
  const [errorCompra, setErrorCompra] = useState<string | undefined>(undefined)
  const refComprar = useRef<HTMLButtonElement>(null)
  const refCancelar = useRef<HTMLButtonElement>(null)
  const pedirFoco = useRef<'comprar' | 'cancelar' | 'panel' | undefined>(undefined)
  const puedeConfirmar = confirmando && compra.comprable
  // Si la parcela deja de ser comprable con la confirmación abierta (p. ej. falta dinero), se cierra.
  useEffect(() => {
    if (!confirmando || compra.comprable) return
    setConfirmando(false)
    const a = document.activeElement
    if (!a || a === document.body || raiz.current?.contains(a)) pedirFoco.current = 'panel'
  }, [confirmando, compra.comprable])
  // El foco se mueve tras pintar, cuando el botón de destino ya existe.
  useEffect(() => {
    const f = pedirFoco.current
    if (!f) return
    pedirFoco.current = undefined
    const destino =
      f === 'comprar' ? refComprar.current : f === 'cancelar' ? refCancelar.current : undefined
    ;(destino ?? raiz.current)?.focus({ preventScroll: true })
  })

  if (!parcela) return null
  const pedirConfirmacion = () => {
    if (!compra.comprable) return
    setErrorCompra(undefined)
    setConfirmando(true)
    pedirFoco.current = 'cancelar'
  }
  const cancelarConfirmacion = () => {
    setConfirmando(false)
    pedirFoco.current = 'comprar'
  }
  const confirmarCompra = () => {
    const r = intentarCompra(partida, indice)
    setConfirmando(false)
    if (r.ok) {
      setErrorCompra(undefined)
      // El botón desaparece al pasar a «Tuya»: el foco se queda en el propio panel.
      pedirFoco.current = 'panel'
    } else {
      setErrorCompra(r.texto)
      pedirFoco.current = 'comprar'
    }
  }
  const cerrar = () => {
    partida.seleccion.deseleccionar()
    devolverFoco()
  }
  const { texto, tono } = estadoDeCompra(compra, dinero)
  const propia = !compra.comprable && compra.motivo === 'ya-propia'
  const id = nombreParcela(parcela.fila, parcela.columna)
  const titulo = tp('parcelaTitulo', { id })
  return (
    <section
      ref={raiz}
      class={puedeConfirmar ? 'panel-parcela panel-confirmando' : 'panel-parcela'}
      role="region"
      aria-labelledby="panel-parcela-titulo"
      data-parcela={indice}
      tabIndex={-1}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation()
          // Primero se cancela la confirmación; el siguiente Esc cierra el panel.
          if (puedeConfirmar) cancelarConfirmacion()
          else cerrar()
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
          simbolo={propia ? '★' : '🪙'}
          texto={
            propia
              ? t('precioTuya')
              : precio === undefined
                ? t('precioDesconocido')
                : textoPrecio(precio)
          }
        />
      </dl>
      <p id="parcela-compra-estado" class={`parcela-compra parcela-compra-${tono}`} role="status">
        <span class="parcela-simbolo" aria-hidden="true">
          {SIMBOLO_TONO[tono]}
        </span>
        <span>{texto}</span>
      </p>
      <div class="panel-parcela-acciones" data-hueco="comprar">
        {!propia &&
          (puedeConfirmar ? (
            <div class="compra-confirmacion" role="group" aria-labelledby="compra-confirmar-texto">
              <p id="compra-confirmar-texto" class="compra-confirmar-texto">
                {tp('compraConfirmar', {
                  n: textoPrecio(compra.precio),
                  m: textoPrecio(dinero - compra.precio),
                })}
              </p>
              <div class="compra-botones">
                <button
                  ref={refCancelar}
                  type="button"
                  class="boton-compra boton-compra-cancelar"
                  onClick={cancelarConfirmacion}
                >
                  {t('compraCancelar')}
                </button>
                <button
                  type="button"
                  class="boton-compra boton-compra-confirmar"
                  onClick={confirmarCompra}
                >
                  {t('compraConfirmarSi')}
                </button>
              </div>
            </div>
          ) : (
            <button
              ref={refComprar}
              type="button"
              class="boton-compra boton-compra-pedir"
              aria-disabled={!compra.comprable}
              aria-describedby="parcela-compra-estado"
              onClick={pedirConfirmacion}
            >
              {precio === undefined
                ? t('comprarSinPrecio')
                : tp(precio === 1 ? 'comprarPorMoneda' : 'comprarPorMonedas', {
                    n: formatearDinero(precio),
                  })}
            </button>
          ))}
        {errorCompra !== undefined && (
          <p class="parcela-error" role="alert">
            {errorCompra}
          </p>
        )}
      </div>
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
