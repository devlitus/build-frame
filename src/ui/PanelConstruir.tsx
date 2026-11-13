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
  useEdificioSeleccionado,
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

/**
 * Última confirmación de una obra (lo guarda `PanelConstruir` en una ref): el catálogo recién pintado
 * ignora el segundo toque de un doble toque, sea sobre un edificio o sobre «Listo». Con puntero la
 * guarda vale para los clics cerca del punto confirmado; con teclado (sin posición), para todos.
 */
interface Confirmacion {
  readonly t: number
  readonly x: number | undefined
  readonly y: number | undefined
}
type GuardaConfirmacion = { current: Confirmacion }
const GUARDA_TRAS_CONFIRMAR_MS = 400
const GUARDA_RADIO_PX = 48
const SIN_CONFIRMAR: Confirmacion = { t: Number.NEGATIVE_INFINITY, x: undefined, y: undefined }

function dentroDeGuarda(guarda: GuardaConfirmacion, ev: MouseEvent): boolean {
  const { t, x, y } = guarda.current
  if (performance.now() - t >= GUARDA_TRAS_CONFIRMAR_MS) return false
  if (x === undefined || y === undefined) return true
  return Math.hypot(ev.clientX - x, ev.clientY - y) < GUARDA_RADIO_PX
}

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
  const edificio = useEdificioSeleccionado().id
  if (!plano || abierto || zonas || parcela !== undefined || edificio !== undefined) return null
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

function Opcion(props: { entrada: EntradaCatalogo; guarda: GuardaConfirmacion }) {
  const partida = usePartida()
  const { entrada, guarda } = props
  const { def, tipo } = entrada
  const motivo = textoMotivoCatalogo(entrada)
  return (
    <button
      type="button"
      class={`edificio-opcion edificio-${tipo}${motivo ? ' edificio-opcion-no' : ''}`}
      data-tipo={tipo}
      data-motivo={entrada.motivo}
      onClick={(ev) => {
        if (dentroDeGuarda(guarda, ev)) return
        partida.construccion.elegir(tipo)
        // Con puntero o con teclado: lo siguiente es mover la silueta, que escucha el lienzo.
        devolverFoco()
      }}
    >
      <span class="edificio-nombre">{nombreEdificio(tipo)}</span>
      <span class="edificio-detalle">
        <span class="edificio-huella">
          {tp('edificioHuella', { a: def.ancho, b: def.alto })} ·{' '}
        </span>
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

function Catalogo(props: { guarda: GuardaConfirmacion }) {
  const { guarda } = props
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
          onClick={(ev) => {
            if (dentroDeGuarda(guarda, ev)) return
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
            <Opcion entrada={e} guarda={guarda} />
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
        <span class="ayuda-larga">
          {t(tactil ? 'construirAyudaSilueta' : 'construirAyudaSiluetaTeclado')}
        </span>
        <span class="ayuda-corta">
          {t(tactil ? 'construirAyudaSiluetaCorta' : 'construirAyudaSiluetaTecladoCorta')}
        </span>
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

/** Mover un edificio: la misma silueta y reglas que construir, sin coste; un botón confirma. */
function Moviendo(props: { id: number; tipo: TipoEdificio }) {
  const partida = usePartida()
  const { id, tipo } = props
  const silueta = useSilueta()
  const tactil = useTactil()
  const estado = useEstado((e) => e)
  const actual = estado.edificios.find((b) => b.id === id)
  const resultado = silueta?.resultado
  const mismoSitio = !!silueta && !!actual && silueta.x === actual.x && silueta.y === actual.y
  const valida = resultado?.valida === true && !mismoSitio
  const texto = !resultado
    ? ''
    : mismoSitio
      ? t('moverMismoSitio')
      : resultado.valida
        ? t('moverOk')
        : textoColocacion(resultado.motivo, tipo, estado)
  return (
    <>
      <div class="construir-cabecera">
        <h2 class="construir-titulo">
          {tp('moverTitulo', { edificio: nombreEdificio(tipo) })}
          <span class="construir-coste"> · {t('edificioMoverGratis')}</span>
        </h2>
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
        <span class="ayuda-larga">{t(tactil ? 'moverAyudaTactil' : 'moverAyudaTeclado')}</span>
        <span class="ayuda-corta">
          {t(tactil ? 'moverAyudaTactilCorta' : 'moverAyudaTecladoCorta')}
        </span>
      </p>
      <div class="construir-acciones">
        <button
          type="button"
          class="boton-compra boton-compra-cancelar"
          onClick={() => {
            devolverFoco()
            partida.construccion.cerrar()
          }}
        >
          {t('moverCancelar')}
        </button>
        <button
          type="button"
          class="boton-compra"
          aria-disabled={!valida}
          onClick={(ev) => {
            if (!valida) return
            devolverFocoSiPuntero(ev)
            partida.moverAqui()
          }}
        >
          {t('moverAqui')}
        </button>
      </div>
    </>
  )
}

function PanelConfirmacion(props: {
  tipo: TipoEdificio
  origen: 'puntero' | 'teclado'
  guarda: GuardaConfirmacion
}) {
  const partida = usePartida()
  const { tipo, origen, guarda } = props
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
    <div
      class="construir-confirmacion"
      role="alertdialog"
      aria-labelledby="construir-pregunta"
      aria-describedby="construir-coste construir-resto"
    >
      <p class="compra-confirmar-texto" id="construir-pregunta">
        {tp('confirmarTitulo', { edificio: nombreEdificio(tipo) })}
      </p>
      <p class="construir-linea" id="construir-coste">
        {tp('confirmarCoste', { coste: textoCoste(coste) })}
      </p>
      <p class="construir-linea" id="construir-resto">
        {tp('confirmarResto', { resto: textoResto(resto) })}
      </p>
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
          onClick={(ev) => {
            guarda.current =
              ev.detail > 0
                ? { t: performance.now(), x: ev.clientX, y: ev.clientY }
                : { t: performance.now(), x: undefined, y: undefined }
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
    </div>
  )
}

/**
 * Panel del modo Construir: catálogo, colocación (con el motivo si no se puede) y confirmación con
 * el coste y lo que queda. Va sobre el botón de modo y ocupa todo el ancho (como la barra de zonas)
 * para que la guía de cámara sepa qué tapa.
 */
export function PanelConstruir() {
  const partida = usePartida()
  const { abierto, tipo, origen, confirmando } = useConstruccion()
  const raiz = useRef<HTMLDivElement>(null)
  const guarda = useRef(SIN_CONFIRMAR)

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
        aria-label={t(origen === undefined ? 'construirPanel' : 'moverPanel')}
      >
        {origen !== undefined && tipo !== undefined ? (
          <Moviendo id={origen} tipo={tipo} />
        ) : tipo === undefined ? (
          <Catalogo guarda={guarda} />
        ) : confirmando ? (
          <PanelConfirmacion tipo={tipo} origen={confirmando} guarda={guarda} />
        ) : (
          <Colocando tipo={tipo} />
        )}
      </section>
    </div>
  )
}
