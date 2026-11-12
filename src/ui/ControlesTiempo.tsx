import { useEffect } from 'preact/hooks'
import { CONFIG_TIEMPO } from '../core'
import { t } from './textos'
import { useEstado, usePartida } from './useEstado'

/** Tras un clic con puntero el foco vuelve al lienzo (con teclado se conserva). */
function devolverFoco(ev: MouseEvent): void {
  if (ev.detail > 0) document.getElementById('juego')?.focus({ preventScroll: true })
}

/**
 * Pausa/reanudar y velocidad x1/x2/x3 (las de `data/tiempo.json`). En Plano el reloj está
 * detenido por el modo, aparte de `pausado`: se avisa sin tocar la pausa del jugador.
 * La tecla `P` alterna la pausa.
 */
export function ControlesTiempo() {
  const partida = usePartida()
  const pausado = useEstado((e) => e.pausado)
  const velocidad = useEstado((e) => e.velocidad)
  const plano = useEstado((e) => e.modo === 'plano')

  // La `P` vive aquí y no en `entrada.ts` (teclado del lienzo): es un atajo de la interfaz de
  // tiempo y debe funcionar también con el foco en un botón del HUD. Como la `M` de entrada.ts,
  // ignora repeat y modificadores.
  useEffect(() => {
    const alPulsar = (ev: KeyboardEvent) => {
      if (ev.code !== 'KeyP' || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey) return
      const destino = ev.target
      if (destino instanceof HTMLElement && /^(input|textarea|select)$/i.test(destino.tagName))
        return
      partida.emitir({ tipo: partida.estado.pausado ? 'Reanudar' : 'Pausar' })
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [partida])

  return (
    <div class="controles-tiempo" role="group" aria-label={t('controlesTiempo')}>
      <span class="tiempo-detenido" aria-live="polite">
        {plano ? t('tiempoDetenidoPlano') : ''}
      </span>
      <button
        type="button"
        class="boton-tiempo boton-pausa"
        aria-label={t('pausaSimbolo')}
        aria-pressed={pausado}
        aria-keyshortcuts="P"
        title={`${pausado ? t('reanudar') : t('pausar')} (P)`}
        onClick={(ev) => {
          partida.emitir({ tipo: partida.estado.pausado ? 'Reanudar' : 'Pausar' })
          devolverFoco(ev)
        }}
      >
        {pausado ? '▶\uFE0E' : '⏸\uFE0E'}
      </button>
      {CONFIG_TIEMPO.velocidades.map((v) => (
        <button
          key={v}
          type="button"
          class="boton-tiempo"
          aria-label={`${t('velocidadAria')} x${v}`}
          aria-pressed={velocidad === v}
          onClick={(ev) => {
            partida.emitir({ tipo: 'CambiarVelocidad', velocidad: v })
            devolverFoco(ev)
          }}
        >
          x{v}
        </button>
      ))}
    </div>
  )
}
