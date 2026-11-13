import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { catalogo, restoTrasPagar, type EntradaCatalogo, type TipoEdificio } from '../core'
import {
  nombreEdificio,
  textoColocacion,
  textoCoste,
  textoDias,
  textoMotivoCatalogo,
  textoResto,
  textoZonas,
} from './construirTextos'
import { t, tp } from './textos'
import {
  useConstruccion,
  useEstado,
  usePartida,
  usePincel,
  useSeleccion,
  useSilueta,
} from './useEstado'

/** ¿Se usa un puntero táctil? Parte de `(pointer: coarse)` y sigue al último puntero que tocó la pantalla (sin depender del hover). */
function useTactil(): boolean {
  const [tactil, fijar] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  )
  useEffect(() => {
    const alPuntero = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch' || ev.pointerType === 'pen') fijar(true)
      else if (ev.pointerType === 'mouse') fijar(false)
    }
    window.addEventListener('pointerdown', alPuntero, true)
    return () => window.removeEventListener('pointerdown', alPuntero, true)
  }, [])
  return tactil
}

/** Instante (ms) en que se confirmó la última obra: el catálogo recién pintado ignora el segundo toque de un doble toque. */
let ultimaConfirmacion = Number.NEGATIVE_INFINITY
const GUARDA_TRAS_CONFIRMAR_MS = 400

function devolverFoco(): void {
  document.getElementById('juego')?.focus({ preventScroll: true })
}

/** Tras un clic o toque el foco vuelve al lienzo (para el teclado de la silueta); con teclado se queda. */
function devolverFocoSiPuntero(ev: MouseEvent): void {
  if (ev.detail > 0) devolverFoco()
}

/** Botón «Construir»: visible en el Modo Plano mientras el modo Construir y la barra de zonas están cerrados. */
export function BotonConstruir() {
  const partida = usePartida()
  const plano = useEstado((e) => e.modo === 'plano')
  const { abierto } = useConstruccion()
  const zonas = usePincel().abierto
  // Con el panel de una parcela abierto el botón quedaría bajo él en pantallas bajas: se pide cerrarlo antes.
  const parcela = useSeleccion()
  if (!plano || abierto || zonas || parcela !== undefined) return null
  return (
    <button
      type="button"
      class="boton-construir"
      title={t('construirBotonAyuda')}
      onClick={(ev) => {
        partida.construccion.abrir()
        devolverFocoSiPuntero(ev)
      }}
    >
      {t('construirBoton')}
    </button>
  )
}

function Opcion(props: { entrada: EntradaCatalogo }) {
  const partida = usePartida()
  const { entrada } = props
  const { def, tipo } = entrada
  const motivo = textoMotivoCatalogo(entrada)
  return (
    <button
      type="button"
      class={`edificio-opcion edificio-${tipo}${motivo ? ' edificio-opcion-no' : ''}`}
      data-tipo={tipo}
      data-motivo={entrada.motivo}
      onClick={() => {
        if (performance.now() - ultimaConfirmacion < GUARDA_TRAS_CONFIRMAR_MS) return
        partida.construccion.elegir(tipo)
        // Con puntero o con teclado: lo siguiente es mover la silueta, que escucha el lienzo.
        devolverFoco()
      }}
    >
      <span class="edificio-nombre">{nombreEdificio(tipo)}</span>
      <span class="edificio-detalle">
        {tp('edificioHuella', { a: def.ancho, b: def.alto })} ·{' '}
        {tp('edificioZona', { zonas: textoZonas(def.zonas) })}
      </span>
      <span class="edificio-coste">
        {textoCoste(def.coste)} · {textoDias(def.dias)}
      </span>
      {motivo && (
        <span class="edificio-motivo">
          <span aria-hidden="true">✕ </span>
          {motivo}
        </span>
      )}
    </button>
  )
}

function Catalogo() {
  const partida = usePartida()
  const edificios = useEstado((e) => e.edificios)
  const dinero = useEstado((e) => e.dinero)
  const materiales = useEstado((e) => e.materiales)
  const lista = useMemo(
    () => catalogo({ edificios, dinero, materiales }),
    [edificios, dinero, materiales],
  )
  return (
    <>
      <div class="construir-cabecera">
        <h2 class="construir-titulo">{t('construirCatalogo')}</h2>
        <button
          type="button"
          class="boton-listo"
          title={t('construirListoAyuda')}
          onClick={() => {
            devolverFoco()
            partida.construccion.cerrar()
          }}
        >
          {t('construirListo')}
        </button>
      </div>
      <ul class="catalogo">
        {lista.map((e) => (
          <li key={e.tipo}>
            <Opcion entrada={e} />
          </li>
        ))}
      </ul>
    </>
  )
}

function Colocando(props: { tipo: TipoEdificio }) {
  const partida = usePartida()
  const { tipo } = props
  const silueta = useSilueta()
  const tactil = useTactil()
  const estado = useEstado((e) => e)
  const entrada = useMemo(() => catalogo(estado).find((e) => e.tipo === tipo), [estado, tipo])
  const resultado = silueta?.resultado
  const valida = resultado?.valida === true
  const texto = !resultado
    ? ''
    : resultado.valida
      ? t('colocacionOk')
      : textoColocacion(resultado.motivo, tipo, estado)
  const coste = entrada?.def.coste
  return (
    <>
      <div class="construir-cabecera">
        <h2 class="construir-titulo">
          {nombreEdificio(tipo)}
          {coste && <span class="construir-coste"> · {textoCoste(coste)}</span>}
        </h2>
        <button
          type="button"
          class="boton-listo"
          title={t('construirListoAyuda')}
          onClick={() => {
            devolverFoco()
            partida.construccion.cerrar()
          }}
        >
          {t('construirListo')}
        </button>
      </div>
      <p
        class={`construir-estado ${valida ? 'construir-estado-ok' : 'construir-estado-no'}`}
        role="status"
        data-valida={valida}
      >
        <span aria-hidden="true">{valida ? '✓ ' : '✕ '}</span>
        {texto}
      </p>
      <p class="construir-ayuda">
        {t(tactil ? 'construirAyudaSilueta' : 'construirAyudaSiluetaTeclado')}
      </p>
      <div class="construir-acciones">
        <button
          type="button"
          class="boton-compra boton-compra-cancelar"
          onClick={(ev) => {
            partida.construccion.elegir(undefined)
            devolverFocoSiPuntero(ev)
          }}
        >
          {t('construirCambiar')}
        </button>
        <button
          type="button"
          class="boton-compra"
          aria-disabled={!valida}
          onClick={(ev) => {
            if (!valida) return
            partida.construccion.pedirConfirmacion(ev.detail > 0 ? 'puntero' : 'teclado')
          }}
        >
          {t('construirAqui')}
        </button>
      </div>
    </>
  )
}

function Confirmacion(props: { tipo: TipoEdificio; origen: 'puntero' | 'teclado' }) {
  const partida = usePartida()
  const { tipo, origen } = props
  const estado = useEstado((e) => e)
  const silueta = useSilueta()
  const entrada = useMemo(() => catalogo(estado).find((e) => e.tipo === tipo), [estado, tipo])
  const refConstruir = useRef<HTMLButtonElement>(null)
  const refCancelar = useRef<HTMLButtonElement>(null)
  // Con el puntero el foco va a «Cancelar» (un doble toque no construye sin leer la pregunta);
  // con el teclado, a «Construir» (Enter y otro Enter construyen).
  useEffect(() => {
    ;(origen === 'teclado' ? refConstruir : refCancelar).current?.focus({ preventScroll: true })
  }, [origen])
  // Si lo colocado deja de valer con la confirmación abierta, se cierra.
  const valida = silueta?.resultado.valida === true
  useEffect(() => {
    if (!valida) partida.construccion.cancelarConfirmacion()
  }, [partida, valida])
  if (!entrada) return null
  const { coste, dias } = entrada.def
  const resto = restoTrasPagar(estado, coste)
  return (
    <>
      <p class="compra-confirmar-texto" id="construir-pregunta">
        {tp('confirmarTitulo', { edificio: nombreEdificio(tipo) })}
      </p>
      <p class="construir-linea">{tp('confirmarCoste', { coste: textoCoste(coste) })}</p>
      <p class="construir-linea">{tp('confirmarResto', { resto: textoResto(resto) })}</p>
      <p class="construir-linea">
        {tp(dias === 1 ? 'confirmarDuracionUno' : 'confirmarDuracion', { n: dias })}
      </p>
      <div class="construir-acciones">
        <button
          type="button"
          class="boton-compra"
          ref={refConstruir}
          onKeyDown={(ev) => {
            // La repetición automática de Enter o Espacio no construye: hace falta una pulsación nueva.
            // (El clic de Enter nace en el keydown; cancelarlo aquí evita ese clic.)
            if (ev.repeat) ev.preventDefault()
          }}
          onClick={() => {
            ultimaConfirmacion = performance.now()
            devolverFoco()
            partida.construirAqui()
          }}
        >
          {t('confirmarSi')}
        </button>
        <button
          type="button"
          class="boton-compra boton-compra-cancelar"
          ref={refCancelar}
          onClick={() => {
            partida.construccion.cancelarConfirmacion()
            devolverFoco()
          }}
        >
          {t('confirmarNo')}
        </button>
      </div>
    </>
  )
}

/**
 * Panel del modo Construir: catálogo, colocación (con el motivo si no se puede) y confirmación con
 * el coste y lo que queda. Va sobre el botón de modo y ocupa todo el ancho (como la barra de zonas)
 * para que la guía de cámara sepa qué tapa.
 */
export function PanelConstruir() {
  const partida = usePartida()
  const { abierto, tipo, confirmando } = useConstruccion()
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
      if (el.contains(document.activeElement)) devolverFoco()
      partida.seleccion.fijarOcupado(undefined)
    }
  }, [partida, abierto])

  // Un botón que desaparece (elegir edificio, volver al catálogo, cancelar) no deja el foco en <body>.
  useEffect(() => {
    if (!abierto) return
    const a = document.activeElement
    if (!a || a === document.body) devolverFoco()
  }, [abierto, tipo, confirmando])

  if (!abierto) return null
  return (
    <div class="panel-construir" ref={raiz}>
      <section
        class={`panel-construir-caja${confirmando ? ' panel-construir-confirmando' : ''}`}
        aria-label={t('construirPanel')}
      >
        {tipo === undefined ? (
          <Catalogo />
        ) : confirmando ? (
          <Confirmacion tipo={tipo} origen={confirmando} />
        ) : (
          <Colocando tipo={tipo} />
        )}
      </section>
    </div>
  )
}
