import { describe, expect, it } from 'vitest'
import { formatearHora } from '../../src/ui/Reloj'
import { nombreEstacion, tp } from '../../src/ui/textos'

const h = (horas: number, min = 0) => horas * 60 + min

describe('textos del reloj', () => {
  it('HH:MM con la madrugada como 02:00, no 26:00', () => {
    expect(formatearHora(h(6))).toBe('06:00')
    expect(formatearHora(h(26))).toBe('02:00')
    expect(formatearHora(h(13, 5))).toBe('13:05')
  })

  it('fecha y estaciones visibles', () => {
    expect(tp('fecha', { dia: 3, estacion: nombreEstacion('otono') })).toBe('Día 3 de Otoño')
    expect(nombreEstacion('verano')).toBe('Verano')
    expect(nombreEstacion('desconocida')).toBe('desconocida')
  })
})
