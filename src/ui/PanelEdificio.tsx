import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import { defEdificio, diasRestantes, reembolso } from '../core'
import { nombreEdificio, textoReembolso } from './construirTextos'
import { MS_VENTANA_ANTIDOBLE, RADIO_MISMO_TOQUE_PX } from './compra'
import { t, tp } from './textos'
import { useEdificioSeleccionado, useEstado, usePartida } from './useEstado'

function devolverFoco(): void {
  document.getElementById('juego')?.focus({ preventScroll: true })
}

function Contenido({ id }: { id: number }) {
  const partida = usePartida()
  const raiz = useRef<HTMLElement>(null)
  const edificios = useEstado((e) => e.edificios)
  const dia = useEstado((e) => e.dia)
  const { confirmando } = useEdificioSeleccionado()
  const edificio = edificios.find((b) => b.id === id)
  const def = edificio && defEdificio(edificio.tipo)
  // El mismo cálculo que hace el comando: la confirmación muestra exactamente lo que se devuelve.
  const quitar = useMemo(() => reembolso({ edificios }, id), [edificios, id])

  // El panel informa de la zona que tapa para que la escena deje el edificio a la vista.
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

  const refAccion = useRef<HTMLButtonElement>(null)
  const refSi = useRef<HTMLButtonElement>(null)
  const refNo = useRef<HTMLButtonElement>(null)
  const abierta = confirmando !== undefined
  const origen = confirmando?.origen
  const estabaAbierta = useRef(false)
  // Con el puntero el foco va a «No» (un doble toque no destruye sin leer); con el teclado, a «Sí».
  // Al cerrar la confirmación el foco vuelve al botón que la abrió.
  useEffect(() => {
    if (abierta) {
      ;(origen === 'teclado' ? refSi : refNo).current?.focus({ preventScroll: true })
    } else if (estabaAbierta.current) {
      const a = document.activeElement
      if (!a || a === document.body || raiz.current?.contains(a)) {
        ;(refAccion.current ?? raiz.current)?.focus({ preventScroll: true })
      }
    }
    estabaAbierta.current = abierta
  }, [abierta, origen])

  // Cuándo y dónde se abrió la confirmación con un toque o clic (no con teclado).
  const abiertaEn = useRef<{ t: number; x: number; y: number } | undefined>(undefined)

  if (!edificio || !def) return null
  const enObra = edificio.obra !== null
  const nombre = nombreEdificio(edificio.tipo)
  const dias = edificio.obra ? diasRestantes(edificio.obra, dia) : 0
  const accion = enObra ? 'cancelar' : 'demoler'
  const puedeMover = !enObra
  const puedeQuitar = quitar !== undefined
  const pedir = (ev: MouseEvent) => {
    abiertaEn.current =
      ev.detail > 0 ? { t: performance.now(), x: ev.clientX, y: ev.clientY } : undefined
    partida.edificioSeleccionado.pedirConfirmacion(accion, ev.detail > 0 ? 'puntero' : 'teclado')
  }
  const confirmar = (ev: MouseEvent) => {
    // El segundo toque de un doble toque sobre «Demoler» cae sobre «Sí»: se ignora un instante.
    const a = abiertaEn.current
    if (
      a &&
      ev.detail > 0 &&
      performance.now() - a.t < MS_VENTANA_ANTIDOBLE &&
      Math.hypot(ev.clientX - a.x, ev.clientY - a.y) < RADIO_MISMO_TOQUE_PX
    ) {
      return
    }
    devolverFoco()
    // El segundo toque de un doble toque en «Sí» caería en el lienzo y elegiría la parcela de debajo.
    if (ev.detail > 0) partida.seleccion.bloquearClics(MS_VENTANA_ANTIDOBLE)
    partida.quitarSeleccionado()
  }
  const cerrar = () => {
    partida.edificioSeleccionado.deseleccionar()
    devolverFoco()
  }
  const cancelarConfirmacion = () => {
    partida.edificioSeleccionado.cancelarConfirmacion()
  }
  const textoEstado = enObra
    ? tp(dias === 1 ? 'edificioObraDia' : 'edificioObraDias', { n: dias })
    : t('edificioEstadoListo')
  return (
    <section
      ref={raiz}
      class={`panel-parcela panel-edificio${abierta ? ' panel-confirmando' : ''}`}
      role="region"
      aria-labelledby="panel-edificio-titulo"
      data-edificio={id}
      tabIndex={-1}
      onKeyDown={(ev) => {
        // La confirmación es un ciclo corto: Tab pasa de «No» a «Sí» y Mays+Tab de «Sí» a «No».
        if (ev.key === 'Tab' && abierta) {
          const activo = document.activeElement
          if (!ev.shiftKey && activo === refNo.current) {
            ev.preventDefault()
            refSi.current?.focus({ preventScroll: true })
          } else if (ev.shiftKey && activo === refSi.current) {
            ev.preventDefault()
            refNo.current?.focus({ preventScroll: true })
          }
          return
        }
        if (ev.key === 'Escape') {
          ev.stopPropagation()
          // Primero se cancela la confirmación; el siguiente Esc cierra el panel.
          if (abierta) cancelarConfirmacion()
          else cerrar()
        }
      }}
    >
      <header class="panel-parcela-cabecera">
        <h2 id="panel-edificio-titulo">{nombre}</h2>
        <button
          type="button"
          class="boton-cerrar"
          aria-label={t('edificioCerrarAria')}
          onClick={cerrar}
        >
          <span aria-hidden="true">✕</span> {t('edificioCerrar')}
        </button>
      </header>
      <p class="edificio-estado" role="status">
        <span aria-hidden="true">{enObra ? '🚧 ' : '✓ '}</span>
        {textoEstado}
      </p>
      {!enObra && !puedeQuitar && <p class="edificio-nota">{t('edificioCasaUnica')}</p>}
      <div class="panel-parcela-acciones edificio-acciones" data-hueco="edificio">
        {abierta && quitar ? (
          <div
            class="compra-confirmacion"
            role="alertdialog"
            aria-labelledby="edificio-pregunta"
            aria-describedby="edificio-reembolso"
          >
            <p class="compra-confirmar-texto" id="edificio-pregunta">
              {tp(enObra ? 'cancelarObraTitulo' : 'demolerTitulo', { edificio: nombre })}
            </p>
            <p class="edificio-reembolso" id="edificio-reembolso">
              {tp(enObra ? 'cancelarObraReembolso' : 'demolerReembolso', {
                coste: textoReembolso(quitar.coste),
              })}
            </p>
            <div class="compra-botones">
              <button
                ref={refSi}
                type="button"
                class="boton-compra boton-compra-confirmar"
                onKeyDown={(ev) => {
                  // La repetición automática de Enter o Espacio no destruye: hace falta una pulsación nueva.
                  if (ev.repeat) ev.preventDefault()
                }}
                onClick={confirmar}
              >
                {t(enObra ? 'cancelarObraSi' : 'demolerSi')}
              </button>
              <button
                ref={refNo}
                type="button"
                class="boton-compra boton-compra-cancelar"
                onClick={cancelarConfirmacion}
              >
                {t(enObra ? 'cancelarObraNo' : 'demolerNo')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {puedeMover && (
              <button
                type="button"
                class="boton-compra boton-compra-pedir"
                title={t('edificioMoverAyuda')}
                onClick={() => {
                  // Con ratón o toque el foco vuelve al lienzo (para mover la silueta con las flechas).
                  partida.iniciarMover(id)
                  devolverFoco()
                }}
              >
                {t('edificioMover')}
              </button>
            )}
            {puedeQuitar && (
              <button
                ref={refAccion}
                type="button"
                class="boton-compra boton-compra-cancelar"
                onClick={pedir}
              >
                {enObra ? t('edificioCancelarObra') : t('edificioDemoler')}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** Panel del edificio u obra seleccionado: Mover y Demoler (o Cancelar obra); solo existe en el Modo Plano. */
export function PanelEdificio() {
  const { id } = useEdificioSeleccionado()
  const modo = useEstado((e) => e.modo)
  if (id === undefined || modo !== 'plano') return null
  return <Contenido key={id} id={id} />
}
