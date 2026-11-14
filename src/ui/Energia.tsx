import { ENERGIA_MAXIMA } from '../core'
import { tp, t } from './textos'
import { useEstado } from './useEstado'

/**
 * Barra de energía del HUD (GDD §6.8). Es un `meter` accesible con valor, mínimo y máximo; la
 * cifra se ve siempre, así el estado no depende solo del color o del largo de la barra.
 */
export function Energia() {
  const energia = useEstado((e) => e.energia)
  const porcentaje = Math.max(0, Math.min(100, (energia / ENERGIA_MAXIMA) * 100))
  return (
    <div
      class="energia"
      role="meter"
      aria-label={t('energiaAria')}
      aria-valuemin={0}
      aria-valuemax={ENERGIA_MAXIMA}
      aria-valuenow={energia}
      aria-valuetext={tp('energiaValor', { n: energia, max: ENERGIA_MAXIMA })}
      data-energia={energia}
      data-baja={energia * 4 <= ENERGIA_MAXIMA ? 'true' : 'false'}
    >
      <svg
        class="energia-simbolo"
        viewBox="0 0 20 20"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <polygon
          points="11,1 3,11 9,11 8,19 17,8 11,8"
          fill="#f2c94c"
          stroke="#5a3a1a"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
      <span class="energia-barra" aria-hidden="true">
        <span class="energia-relleno" style={{ width: `${porcentaje}%` }} />
      </span>
      <span class="energia-cifra" aria-hidden="true">
        {energia}
      </span>
    </div>
  )
}
