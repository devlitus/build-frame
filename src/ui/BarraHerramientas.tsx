import { comprobarDormir, HERRAMIENTAS, type Herramienta } from '../core'
import { rutaIconoHerramienta } from './iconos'
import { t, tp, type ClaveTexto } from './textos'
import { useEstado, usePartida } from './useEstado'

/** Tras un clic o toque el foco vuelve al lienzo (para E y Espacio); con teclado se queda. */
function devolverFoco(ev: MouseEvent): void {
  if (ev.detail > 0) document.getElementById('juego')?.focus({ preventScroll: true })
}

export function nombreHerramienta(h: Herramienta): string {
  return t(`herramienta_${h}` as ClaveTexto)
}

/**
 * Barra de herramientas del Modo Vida (GDD §8: herramienta activa en el HUD): un botón de al menos
 * 48 px por herramienta, con su icono y su tecla (1 a 6). La activa va marcada con `aria-pressed`
 * y con su nombre en texto (no solo con el color). Con «Semillas» se ve qué semilla está elegida.
 */
export function BarraHerramientas() {
  const partida = usePartida()
  const vida = useEstado((e) => e.modo === 'vida')
  const actual = useEstado((e) => e.herramienta)
  const semilla = useEstado((e) => e.semillaElegida)
  if (!vida) return null
  const nombre = nombreHerramienta(actual)
  const activa =
    actual === 'semillas'
      ? tp('herramientaActivaSemilla', {
          herramienta: nombre,
          semilla:
            semilla === null ? t('herramientaSinSemilla') : t(`objeto_${semilla}` as ClaveTexto),
        })
      : tp('herramientaActiva', { herramienta: nombre })
  return (
    <div class="barra-herramientas">
      <div class="barra-herramientas-caja" role="group" aria-label={t('herramientasBarra')}>
        <div class="herramientas-fila">
          {HERRAMIENTAS.map((h, i) => (
            <button
              key={h}
              type="button"
              class="herramienta-boton"
              data-herramienta={h}
              aria-pressed={actual === h}
              aria-label={nombreHerramienta(h)}
              aria-keyshortcuts={String(i + 1)}
              title={tp('herramientaTitulo', { herramienta: nombreHerramienta(h), n: i + 1 })}
              onClick={(ev) => {
                partida.elegirHerramienta(h)
                devolverFoco(ev)
              }}
            >
              <img
                src={rutaIconoHerramienta(h)}
                alt=""
                width="32"
                height="32"
                draggable={false}
                aria-hidden="true"
              />
              <span class="herramienta-tecla" aria-hidden="true">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
        <p class="herramienta-activa" aria-live="polite">
          {activa}
        </p>
      </div>
    </div>
  )
}

/** Botón de acción contextual: usa la herramienta activa en la casilla de enfrente (como E o Espacio). Solo en Vida. */
export function BotonAccion() {
  const partida = usePartida()
  const vida = useEstado((e) => e.modo === 'vida')
  const actual = useEstado((e) => e.herramienta)
  if (!vida) return null
  const nombre = nombreHerramienta(actual).toLowerCase()
  return (
    <button
      type="button"
      class="boton-accion"
      aria-keyshortcuts="E Space"
      title={t('accionBotonAyuda')}
      onClick={(ev) => {
        partida.usarEnfrente()
        devolverFoco(ev)
      }}
    >
      {tp('accionBoton', { herramienta: nombre })}
    </button>
  )
}

/**
 * Botón «Dormir»: aparece solo donde se puede dormir (Vida y junto a la puerta de la casa terminada,
 * o de la aparición si aún no hay casa), con la misma comprobación que el comando. Tecla Z.
 */
export function BotonDormir() {
  const partida = usePartida()
  const puede = useEstado((e) => comprobarDormir(e) === undefined)
  if (!puede) return null
  return (
    <button
      type="button"
      class="boton-dormir"
      aria-keyshortcuts="Z"
      title={t('dormirBotonAyuda')}
      onClick={(ev) => {
        partida.dormir()
        devolverFoco(ev)
      }}
    >
      {t('dormirBoton')}
    </button>
  )
}
