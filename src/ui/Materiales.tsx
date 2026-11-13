import { formatearDinero } from './formatoDinero'
import { t } from './textos'
import { useEstado } from './useEstado'

/** Madera y piedra del jugador, siempre visibles junto al dinero («🪵 80 🪨 20»). */
export function Materiales() {
  const { madera, piedra } = useEstado((e) => e.materiales)
  return (
    <div
      class="materiales"
      role="group"
      aria-label={t('materialesAria')}
      data-madera={madera}
      data-piedra={piedra}
    >
      <span class="material material-madera">
        <span class="material-simbolo" aria-hidden="true">
          🪵
        </span>
        <span class="material-cifra">{formatearDinero(madera)}</span>
        <span class="solo-lector"> {t('maderaEtiqueta')}</span>
      </span>
      <span class="material material-piedra">
        <span class="material-simbolo" aria-hidden="true">
          🪨
        </span>
        <span class="material-cifra">{formatearDinero(piedra)}</span>
        <span class="solo-lector"> {t('piedraEtiqueta')}</span>
      </span>
    </div>
  )
}
