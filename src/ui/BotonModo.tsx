import type { ModoJuego } from '../core'
import { t } from './textos'
import { useEstado, usePartida } from './useEstado'

/**
 * Botón de modo: muestra el modo vigente y cambia al otro. Tras pulsarlo con el puntero el foco
 * vuelve al contenedor del lienzo; con teclado (Enter/Espacio) conserva el foco.
 */
export function BotonModo() {
  const partida = usePartida()
  const modo = useEstado((e) => e.modo)
  const siguiente: ModoJuego = modo === 'vida' ? 'plano' : 'vida'
  const alPulsar = (ev: MouseEvent) => {
    partida.emitir({ tipo: 'CambiarModo', modo: siguiente })
    // `detail` es 0 si lo activó el teclado.
    if (ev.detail > 0) document.getElementById('juego')?.focus({ preventScroll: true })
  }
  return (
    <button
      type="button"
      class="boton-modo"
      aria-label={modo === 'vida' ? t('cambiarAModoPlano') : t('cambiarAModoVida')}
      aria-pressed={modo === 'plano'}
      aria-keyshortcuts="M"
      title={t('botonModoAyuda')}
      onClick={alPulsar}
    >
      {modo === 'vida' ? t('modoVida') : t('modoPlano')}
    </button>
  )
}
