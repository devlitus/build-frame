import { useEffect, useState } from 'preact/hooks'
import { t } from './textos'
import { usePartida } from './useEstado'

/** Milisegundos que se muestra el aviso de desmayo. */
const MS_AVISO = 6000
/** Pausa entre quitar y volver a poner el texto, para que se anuncie de nuevo. */
const MS_REANUNCIO = 80

/**
 * Aviso breve (no bloquea el juego) al recibir el evento `desmayo`; es una región `status`.
 * Si llega otro desmayo con el aviso visible, el texto se quita y se vuelve a poner (se
 * reanuncia) y se reinician los 6 s.
 */
export function Aviso() {
  const partida = usePartida()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let mostrar: ReturnType<typeof setTimeout> | undefined
    let ocultar: ReturnType<typeof setTimeout> | undefined
    const baja = partida.suscribir(({ eventos }) => {
      if (!eventos.some((e) => e.tipo === 'desmayo')) return
      clearTimeout(mostrar)
      clearTimeout(ocultar)
      setVisible(false)
      mostrar = setTimeout(() => {
        setVisible(true)
        ocultar = setTimeout(() => setVisible(false), MS_AVISO)
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
      {visible && <p class="aviso">{t('avisoDesmayo')}</p>}
    </div>
  )
}
