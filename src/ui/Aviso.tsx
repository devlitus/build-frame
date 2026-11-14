import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { leerParametros } from '../game/parametros'
import { casaTerminada, despiertaEnCasa } from '../core'
import { nombreEdificio, textoColocacion, textoReembolso } from './construirTextos'
import { nombreParcela, textoPrecio } from './parcelaTextos'
import { existeTexto, t, tp, type ClaveTexto } from './textos'
import { usePartida } from './useEstado'

/** Milisegundos que se muestra el aviso (`?debug&aviso=<ms>` lo acorta en los e2e). */
const MS_AVISO = 6000
/** Milisegundos máximos que un aviso abierto por el jugador se queda en pantalla. */
const MS_FIJO = 20000
/** Pausa entre quitar y volver a poner el texto, para que se anuncie de nuevo. */
const MS_REANUNCIO = 80

/** Une frases con un espacio; las que no acaban en puntuación reciben un punto (sin dobles puntos). */
export function unirFrases(partes: readonly string[]): string {
  return partes
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => (/[.!?…:]$/.test(p) ? p : p + '.'))
    .join(' ')
}

/**
 * Aviso breve (no bloquea el juego) al recibir el evento `desmayo` o `parcela-comprada` (o un aviso de interfaz de la partida); es una
 * región `status`. Si llega otro con el aviso visible, el texto se quita y se vuelve a poner (se
 * reanuncia) y se reinician los 6 s.
 * Se pinta en una sola línea, sin tarjeta, para no tapar el juego (regla de interfaz); si no cabe
 * se corta con «…» y aparece el botón ▾ (táctil, ratón y teclado) que lo abre entero. Los lectores
 * de pantalla siempre leen el texto completo.
 */
export function Aviso() {
  const partida = usePartida()
  const [texto, setTexto] = useState<string | undefined>(undefined)
  useEffect(() => {
    const msAviso = leerParametros(window.location.search).aviso ?? MS_AVISO
    let mostrar: ReturnType<typeof setTimeout> | undefined
    let ocultar: ReturnType<typeof setTimeout> | undefined
    const mostrarAviso = (nuevo: string): void => {
      clearTimeout(mostrar)
      clearTimeout(ocultar)
      setTexto(undefined)
      mostrar = setTimeout(() => {
        setTexto(nuevo)
        ocultar = setTimeout(() => {
          // Abierto por el jugador para leerlo (`data-fijo`): el temporizador no lo quita.
          if (document.querySelector('.aviso')?.getAttribute('data-fijo') !== 'true')
            setTexto(undefined)
        }, msAviso)
      }, MS_REANUNCIO)
    }
    const baja = partida.suscribir(({ eventos, estado }) => {
      // Un cambio de día puede traer a la vez el desmayo y obras terminadas: se anuncian juntos.
      const partes: string[] = []
      for (const ev of eventos) {
        if (ev.tipo === 'desmayo')
          partes.push(t(despiertaEnCasa(estado) ? 'avisoDesmayoCasa' : 'avisoDesmayo'))
        else if (ev.tipo === 'dormido')
          partes.push(t(despiertaEnCasa(estado) ? 'avisoDormidoCasa' : 'avisoDormido'))
        else if (ev.tipo === 'parcela-comprada') {
          const p = estado.valle.parcelas[ev.indice]
          partes.push(
            tp('avisoCompra', {
              id: p ? nombreParcela(p.fila, p.columna) : '',
              n: textoPrecio(ev.precio),
            }),
          )
        } else if (ev.tipo === 'obra-iniciada') {
          const dias = estado.edificios.find((e) => e.id === ev.id)?.obra
          const n = dias ? dias.diaFin - dias.diaInicio : 0
          partes.push(
            tp(n === 1 ? 'avisoObraIniciadaManana' : 'avisoObraIniciada', {
              edificio: nombreEdificio(ev.tipoEdificio),
              n,
            }),
          )
        } else if (ev.tipo === 'obra-terminada') {
          partes.push(tp('avisoObraTerminada', { edificio: nombreEdificio(ev.tipoEdificio) }))
        } else if (ev.tipo === 'obstaculo-golpeado') {
          const arbol = ev.obstaculo !== 'roca'
          const clave = `avisoGolpe${arbol ? 'Arbol' : 'Roca'}${ev.restantes === 1 ? 'Uno' : ''}`
          partes.push(tp(clave as ClaveTexto, { n: ev.restantes }))
        } else if (ev.tipo === 'obstaculo-quitado') {
          if (ev.obstaculo === 'planton') partes.push(t('avisoPlantonArrancado'))
          else if (ev.obstaculo === 'roca')
            partes.push(tp('avisoRocaPicada', { piedra: ev.piedra }))
          else
            partes.push(
              tp(ev.plantones > 0 ? 'avisoArbolTaladoPlanton' : 'avisoArbolTalado', {
                madera: ev.madera,
              }),
            )
        } else if (ev.tipo === 'planton-plantado') {
          partes.push(t('avisoPlantonPlantado'))
        } else if (ev.tipo === 'planta-cosechada') {
          partes.push(
            tp('avisoCosecha', {
              cantidad: ev.cantidad,
              producto: t(`objeto_${ev.producto}` as ClaveTexto),
            }),
          )
        } else if (ev.tipo === 'planton-perdido') {
          partes.push(t('avisoPlantonPerdido'))
        } else if (ev.tipo === 'edificio-movido') {
          partes.push(tp('avisoEdificioMovido', { edificio: nombreEdificio(ev.tipoEdificio) }))
        } else if (ev.tipo === 'edificio-demolido' || ev.tipo === 'obra-cancelada') {
          partes.push(
            tp(ev.tipo === 'edificio-demolido' ? 'avisoEdificioDemolido' : 'avisoObraCancelada', {
              edificio: nombreEdificio(ev.tipoEdificio),
              coste: textoReembolso(ev.reembolso),
            }),
          )
        }
      }
      if (partes.length > 0) mostrarAviso(unirFrases(partes))
    })
    const bajaUi = partida.suscribirAvisos((aviso) => {
      if (aviso === 'zona-sin-casillas') mostrarAviso(t('avisoZonaSinCasillas'))
      else if (aviso.tipo === 'herramienta-rechazada') {
        const clave = `errorHerramienta_${aviso.error}`
        mostrarAviso(t(existeTexto(clave) ? clave : ('errorHerramienta_otro' as ClaveTexto)))
      } else if (aviso.tipo === 'dormir-rechazado') {
        const sinCasa = aviso.error === 'lejos-de-la-cama' && !casaTerminada(partida.estado)
        const clave = sinCasa
          ? 'errorDormir_lejos-de-la-cama-sin-casa'
          : `errorDormir_${aviso.error}`
        mostrarAviso(t(existeTexto(clave) ? clave : ('errorDormir_otro' as ClaveTexto)))
      } else if (aviso.tipo === 'edificio-rechazado') {
        mostrarAviso(
          tp('avisoEdificioRechazado', {
            accion: t(`accion_${aviso.accion}`),
            motivo: textoColocacion(aviso.error, aviso.edificio, partida.estado),
          }),
        )
      } else if (aviso.tipo === 'construir-rechazado') {
        const e = partida.estado
        mostrarAviso(
          tp('avisoConstruirRechazado', {
            motivo: textoColocacion(aviso.error, aviso.edificio, e),
          }),
        )
      }
    })
    return () => {
      baja()
      bajaUi()
      clearTimeout(mostrar)
      clearTimeout(ocultar)
    }
  }, [partida])
  // El aviso ocupa sitio en el HUD: la guía de cámara vuelve a medir cuando aparece o se quita.
  useLayoutEffect(() => {
    partida.seleccion.reservasCambiadas()
  }, [partida, texto])
  /**
   * Abre el aviso cortado (se lee entero y se queda) o, si ya está abierto, lo quita. Abierto se
   * cierra solo a los `MS_FIJO` o al tocar fuera (ese toque sigue su camino hacia el lienzo). El
   * estado vive en el DOM (el elemento se crea de nuevo con cada aviso), no en un hook.
   */
  const alternar = (caja: HTMLElement | null): void => {
    const el = caja?.querySelector<HTMLElement>('.aviso')
    if (!caja || !el) return
    if (caja.getAttribute('data-abierto') === 'true') {
      setTexto(undefined)
      return
    }
    caja.setAttribute('data-abierto', 'true')
    el.classList.add('aviso-completo')
    el.setAttribute('data-fijo', 'true')
    const boton = caja.querySelector('.aviso-abrir')
    boton?.setAttribute('aria-expanded', 'true')
    boton?.setAttribute('aria-label', t('avisoCerrar'))
    const limpiar = (): void => {
      clearTimeout(plazo)
      document.removeEventListener('pointerdown', fuera, true)
    }
    const cerrar = (): void => {
      limpiar()
      if (caja.isConnected) setTexto(undefined)
    }
    const fuera = (ev: PointerEvent): void => {
      if (!caja.isConnected) limpiar()
      else if (ev.target instanceof Node && !caja.contains(ev.target)) cerrar()
    }
    const plazo = setTimeout(cerrar, MS_FIJO)
    document.addEventListener('pointerdown', fuera, true)
  }
  /** Si el texto no cabe en su línea, deja ver el botón que lo abre. */
  const medirCorte = (el: HTMLElement | null): void => {
    if (!el) return
    requestAnimationFrame(() => {
      if (el.scrollHeight > el.clientHeight + 1)
        el.closest('.aviso-caja')?.setAttribute('data-cortado', 'true')
    })
  }
  return (
    <div class="aviso-zona" role="status">
      {texto !== undefined && (
        <div class="aviso-caja">
          <p
            class="aviso"
            title={texto}
            ref={medirCorte}
            onClick={(ev) => alternar(ev.currentTarget.closest<HTMLElement>('.aviso-caja'))}
          >
            {texto}
          </p>
          <button
            type="button"
            class="aviso-abrir"
            aria-expanded="false"
            aria-label={t('avisoAbrir')}
            onClick={(ev) => alternar(ev.currentTarget.closest<HTMLElement>('.aviso-caja'))}
          >
            <span aria-hidden="true">▾</span>
          </button>
        </div>
      )}
    </div>
  )
}
