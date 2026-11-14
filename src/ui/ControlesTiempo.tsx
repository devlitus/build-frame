import { useEffect, useRef, useState } from 'preact/hooks'
import { CONFIG_TIEMPO } from '../core'
import { t, tp } from './textos'
import { useEstado, usePartida } from './useEstado'

/** Símbolos de pausa y de reanudar, en forma de texto (U+FE0E: sin el emoji a color). */
const SIMBOLO_PAUSA = '⏸\uFE0E'
const SIMBOLO_REANUDAR = '▶\uFE0E'
const ID_LISTA = 'controles-tiempo-lista'

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
  // En pantallas muy bajas (CSS `max-height: 340px`) la lista se esconde tras un botón con la
  // velocidad vigente; en las demás la lista se ve siempre y el botón no se muestra.
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  // Abierta, la lista se cierra con Escape (el foco vuelve al botón) y al tocar fuera de ella.
  useEffect(() => {
    if (!abierto) return
    const alPulsarTecla = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      setAbierto(false)
      raiz.current?.querySelector<HTMLElement>('.boton-tiempo-menu')?.focus({ preventScroll: true })
    }
    const alTocar = (ev: PointerEvent) => {
      if (ev.target instanceof Node && !raiz.current?.contains(ev.target)) setAbierto(false)
    }
    window.addEventListener('keydown', alPulsarTecla)
    window.addEventListener('pointerdown', alTocar)
    return () => {
      window.removeEventListener('keydown', alPulsarTecla)
      window.removeEventListener('pointerdown', alTocar)
    }
  }, [abierto])

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
    <div ref={raiz} class="controles-tiempo" data-abierto={abierto ? 'true' : 'false'}>
      <span class="tiempo-detenido" aria-live="polite">
        {plano ? t('tiempoDetenidoPlano') : ''}
      </span>
      <button
        type="button"
        class="boton-tiempo boton-tiempo-menu"
        aria-label={tp('tiempoMenu', {
          estado: pausado ? t('tiempoEnPausa') : `x${velocidad}`,
        })}
        aria-expanded={abierto}
        aria-controls={ID_LISTA}
        onClick={(ev) => {
          setAbierto(!abierto)
          devolverFoco(ev)
        }}
      >
        {pausado ? SIMBOLO_PAUSA : `x${velocidad}`}
      </button>
      <div
        id={ID_LISTA}
        class="controles-tiempo-lista"
        role="group"
        aria-label={t('controlesTiempo')}
      >
        <button
          type="button"
          class="boton-tiempo boton-pausa"
          aria-label={t('pausaSimbolo')}
          aria-pressed={pausado}
          aria-keyshortcuts="P"
          title={`${pausado ? t('reanudar') : t('pausar')} (P)`}
          onClick={(ev) => {
            partida.emitir({ tipo: partida.estado.pausado ? 'Reanudar' : 'Pausar' })
            setAbierto(false)
            devolverFoco(ev)
          }}
        >
          {pausado ? SIMBOLO_REANUDAR : SIMBOLO_PAUSA}
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
              setAbierto(false)
              devolverFoco(ev)
            }}
          >
            x{v}
          </button>
        ))}
      </div>
    </div>
  )
}
