import { fechaDe, horaDe } from '../core'
import { Energia } from './Energia'
import { nombreEstacion, t, tp } from './textos'
import { useEstado } from './useEstado'

/** Hora `HH:MM` de pared (la madrugada es 02:00, no 26:00). */
export function formatearHora(minutoDelDia: number): string {
  const { horas, minutos } = horaDe({ minutoDelDia })
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
}

/** Solo este componente se repinta cada minuto de juego (el selector da el minuto entero). */
function Hora() {
  const minuto = useEstado((e) => Math.floor(e.minutoDelDia))
  return (
    <span class="reloj-hora" aria-label={t('relojAria')} role="timer">
      {formatearHora(minuto)}
    </span>
  )
}

/** Se repinta solo al cambiar de día. */
function Fecha() {
  const dia = useEstado((e) => e.dia)
  const f = fechaDe({ dia })
  return (
    <span class="reloj-fecha">
      {tp('fecha', { dia: f.diaDeEstacion, estacion: nombreEstacion(f.estacion) })}
      {f.año > 1 ? ` · ${tp('año', { año: f.año })}` : ''}
    </span>
  )
}

export function Reloj() {
  return (
    <div class="reloj">
      <Hora />
      <Fecha />
      <Energia />
    </div>
  )
}
