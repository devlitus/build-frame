import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { nombreEdificio, textoColocacion, textoReembolso } from './construirTextos'
import { nombreParcela, textoPrecio } from './parcelaTextos'
import { t, tp } from './textos'
import { usePartida } from './useEstado'

/** Milisegundos que se muestra el aviso. */
const MS_AVISO = 6000
/** Pausa entre quitar y volver a poner el texto, para que se anuncie de nuevo. */
const MS_REANUNCIO = 80

/**
 * Aviso breve (no bloquea el juego) al recibir el evento `desmayo` o `parcela-comprada` (o un aviso de interfaz de la partida); es una
 * región `status`. Si llega otro con el aviso visible, el texto se quita y se vuelve a poner (se
 * reanuncia) y se reinician los 6 s.
 */
export function Aviso() {
  const partida = usePartida()
  const [texto, setTexto] = useState<string | undefined>(undefined)
  useEffect(() => {
    let mostrar: ReturnType<typeof setTimeout> | undefined
    let ocultar: ReturnType<typeof setTimeout> | undefined
    const mostrarAviso = (nuevo: string): void => {
      clearTimeout(mostrar)
      clearTimeout(ocultar)
      setTexto(undefined)
      mostrar = setTimeout(() => {
        setTexto(nuevo)
        ocultar = setTimeout(() => setTexto(undefined), MS_AVISO)
      }, MS_REANUNCIO)
    }
    const baja = partida.suscribir(({ eventos, estado }) => {
      // Un cambio de día puede traer a la vez el desmayo y obras terminadas: se anuncian juntos.
      const partes: string[] = []
      for (const ev of eventos) {
        if (ev.tipo === 'desmayo') partes.push(t('avisoDesmayo'))
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
      if (partes.length > 0) mostrarAviso(partes.join(' '))
    })
    const bajaUi = partida.suscribirAvisos((aviso) => {
      if (aviso === 'zona-sin-casillas') mostrarAviso(t('avisoZonaSinCasillas'))
      else if (aviso.tipo === 'edificio-rechazado') {
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
  return (
    <div class="aviso-zona" role="status">
      {texto !== undefined && <p class="aviso">{texto}</p>}
    </div>
  )
}
