import type { ModoJuego } from '../core'
import type { Partida } from '../game/partida'
import { Aviso } from './Aviso'
import { ControlesTiempo } from './ControlesTiempo'
import { Dinero } from './Dinero'
import { BarraZonas, BotonZonas } from './BarraZonas'
import { PanelParcela } from './PanelParcela'
import { Reloj } from './Reloj'
import { t } from './textos'
import { ContextoPartida, useEstado, usePartida, usePincel } from './useEstado'

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

/** Ayuda de teclado del Modo Plano para lectores de pantalla (la enlaza el lienzo con `aria-describedby`). */
function AyudaPlano() {
  const plano = useEstado((e) => e.modo === 'plano')
  const zonas = usePincel().abierto
  return plano ? (
    <>
      <p id="ayuda-plano" class="solo-lector">
        {t('ayudaPlano')}
      </p>
      {zonas && (
        <p id="ayuda-zonas" class="solo-lector">
          {t('ayudaZonas')}
        </p>
      )}
    </>
  ) : null
}

/**
 * Interfaz de partida: arriba hora, fecha, controles de tiempo y aviso (en columna, sin
 * solaparse); abajo a la derecha el modo. Con `debug` el contador de fps ocupa la esquina
 * superior izquierda y la columna baja debajo.
 */
export function Hud({ partida, debug = false }: { partida: Partida; debug?: boolean }) {
  return (
    <ContextoPartida.Provider value={partida}>
      <div class={debug ? 'hud hud-debug' : 'hud'}>
        <div class={debug ? 'hud-arriba hud-arriba-debug' : 'hud-arriba'}>
          <div class="hud-superior">
            <div class="hud-izquierda">
              <Reloj />
              <Dinero />
            </div>
            <ControlesTiempo />
          </div>
          <Aviso />
        </div>
        <AyudaPlano />
        <PanelParcela />
        <BarraZonas />
        <BotonZonas />
        <BotonModo />
      </div>
    </ContextoPartida.Provider>
  )
}
