import type { Partida } from '../game/partida'
import { Aviso } from './Aviso'
import { BarraInferior } from './BarraInferior'
import { PanelInventario } from './PanelInventario'
import { ControlesTiempo } from './ControlesTiempo'
import { Dinero } from './Dinero'
import { Materiales } from './Materiales'
import { PanelConstruir } from './PanelConstruir'
import { BarraZonas } from './BarraZonas'
import { PanelEdificio } from './PanelEdificio'
import { PanelParcela } from './PanelParcela'
import { Reloj } from './Reloj'
import { t } from './textos'
import { ContextoPartida, useConstruccion, useEstado, usePincel } from './useEstado'

/** Ayuda de teclado del Modo Vida para lectores de pantalla (la enlaza el contenedor del juego con `aria-describedby`). */
function AyudaVida() {
  const vida = useEstado((e) => e.modo === 'vida')
  return vida ? (
    <p id="ayuda-vida" class="solo-lector">
      {t('ayudaVida')}
    </p>
  ) : null
}

/** Ayuda de teclado del Modo Plano para lectores de pantalla (la enlaza el lienzo con `aria-describedby`). */
function AyudaPlano() {
  const plano = useEstado((e) => e.modo === 'plano')
  const zonas = usePincel().abierto
  const { abierto: construir, origen } = useConstruccion()
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
      {construir && origen === undefined && (
        <p id="ayuda-construir" class="solo-lector">
          {t('ayudaConstruir')}
        </p>
      )}
      {construir && origen !== undefined && (
        <p id="ayuda-mover" class="solo-lector">
          {t('ayudaMover')}
        </p>
      )}
    </>
  ) : null
}

/**
 * Interfaz de partida: arriba hora, fecha, controles de tiempo y aviso (en columna, sin
 * solaparse); abajo, centrada, la barra inferior única (herramientas, acciones y modo). Con `debug` el contador de fps ocupa la esquina
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
              <Materiales />
            </div>
            <ControlesTiempo />
          </div>
          <Aviso />
        </div>
        <AyudaPlano />
        <AyudaVida />
        <PanelParcela />
        <PanelEdificio />
        <BarraZonas />
        <PanelConstruir />
        <PanelInventario />
        <BarraInferior />
      </div>
    </ContextoPartida.Provider>
  )
}
