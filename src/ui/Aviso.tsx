import { useEffect, useState } from 'preact/hooks'
import { nombreParcela, textoPrecio } from './parcelaTextos'
import { t, tp } from './textos'
import { usePartida } from './useEstado'

/** Milisegundos que se muestra el aviso. */
const MS_AVISO = 6000
/** Pausa entre quitar y volver a poner el texto, para que se anuncie de nuevo. */
const MS_REANUNCIO = 80

/**
 * Aviso breve (no bloquea el juego) al recibir el evento `desmayo` o `parcela-comprada`; es una
 * región `status`. Si llega otro con el aviso visible, el texto se quita y se vuelve a poner (se
 * reanuncia) y se reinician los 6 s.
 */
export function Aviso() {
  const partida = usePartida()
  const [texto, setTexto] = useState<string | undefined>(undefined)
  useEffect(() => {
    let mostrar: ReturnType<typeof setTimeout> | undefined
    let ocultar: ReturnType<typeof setTimeout> | undefined
    const baja = partida.suscribir(({ eventos, estado }) => {
      let nuevo: string | undefined
      for (const ev of eventos) {
        if (ev.tipo === 'desmayo') nuevo = t('avisoDesmayo')
        else if (ev.tipo === 'parcela-comprada') {
          const p = estado.valle.parcelas[ev.indice]
          nuevo = tp('avisoCompra', {
            id: p ? nombreParcela(p.fila, p.columna) : '',
            n: textoPrecio(ev.precio),
          })
        }
      }
      if (nuevo === undefined) return
      clearTimeout(mostrar)
      clearTimeout(ocultar)
      setTexto(undefined)
      mostrar = setTimeout(() => {
        setTexto(nuevo)
        ocultar = setTimeout(() => setTexto(undefined), MS_AVISO)
      }, MS_REANUNCIO)
    })
    return () => {
      baja()
      clearTimeout(mostrar)
      clearTimeout(ocultar)
    }
  }, [partida])
  return (
    <div class="aviso-zona" role="status">
      {texto !== undefined && <p class="aviso">{texto}</p>}
    </div>
  )
}
