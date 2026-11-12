import { formatearDinero } from './formatoDinero'
import { t } from './textos'
import { useEstado } from './useEstado'

/** Dinero del jugador, siempre visible: moneda y cifra con punto de millar («🪙 1.100»). */
export function Dinero() {
  const dinero = useEstado((e) => e.dinero)
  const cifra = formatearDinero(dinero)
  return (
    <div class="dinero" role="group" aria-label={t('dineroAria')} data-dinero={dinero}>
      <span class="dinero-simbolo" aria-hidden="true">
        🪙
      </span>
      <span class="dinero-cifra">{cifra}</span>
      <span class="solo-lector"> {t('dineroMonedas')}</span>
    </div>
  )
}
