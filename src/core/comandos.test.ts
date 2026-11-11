import { describe, expect, it } from 'vitest'
import { aplicarComando, crearEstadoInicial } from './index'

const inicial = crearEstadoInicial({ semilla: 42, dineroInicial: 1000 })

describe('AvanzarTiempo', () => {
  it('suma los minutos al reloj', () => {
    const r = aplicarComando(inicial, { tipo: 'AvanzarTiempo', minutos: 30 })
    expect(r.ok).toBe(true)
    expect(r.estado.minutos).toBe(30)
  })

  it.each([-1, 1.5, Number.NaN])('rechaza %s sin cambiar el estado', (minutos) => {
    const r = aplicarComando(inicial, { tipo: 'AvanzarTiempo', minutos })
    expect(r).toEqual({ ok: false, estado: inicial, error: 'parametro-invalido' })
  })

  it('no muta el estado de entrada', () => {
    const copia = structuredClone(inicial)
    aplicarComando(inicial, { tipo: 'AvanzarTiempo', minutos: 10 })
    expect(inicial).toEqual(copia)
  })
})
