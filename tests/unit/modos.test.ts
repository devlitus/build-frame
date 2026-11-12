import { describe, expect, it, vi } from 'vitest'
import { crearEstadoInicial, tiempoDetenido } from '../../src/core'
import { Partida } from '../../src/game/partida'
import { AcumuladorTiempo } from '../../src/game/bucle'
import { leerParametros } from '../../src/game/parametros'
import { fuenteDeEstado } from '../../src/ui/useEstado'

const nueva = () => new Partida(crearEstadoInicial({ semilla: 7, dineroInicial: 0 }))

describe('?modo=plano', () => {
  it('solo `plano` (sin distinguir mayúsculas) arranca en Plano, con o sin debug', () => {
    expect(leerParametros('?semilla=1&modo=plano').modo).toBe('plano')
    expect(leerParametros('?modo=PLANO').modo).toBe('plano')
    expect(leerParametros('?modo=vida').modo).toBeUndefined()
    expect(leerParametros('?modo=x').modo).toBeUndefined()
    expect(leerParametros('?semilla=1').modo).toBeUndefined()
  })
})

describe('tiempo detenido en el bucle', () => {
  it('el acumulador no avanza con el tiempo detenido (Plano)', () => {
    const p = nueva()
    p.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    const a = new AcumuladorTiempo()
    expect(a.acumular(100, 3, tiempoDetenido(p.estado))).toBe(0)
  })
})

describe('fuenteDeEstado (base de useEstado)', () => {
  it('lee la porción del estado y avisa en cada cambio de la partida', () => {
    const p = nueva()
    const f = fuenteDeEstado(p, (e) => e.modo)
    const aviso = vi.fn()
    const baja = f.suscribir(aviso)
    expect(f.leer()).toBe('vida')
    p.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(f.leer()).toBe('plano')
    p.emitir({ tipo: 'CambiarModo', modo: 'plano' }) // sin cambio: no avisa
    expect(aviso).toHaveBeenCalledTimes(1)
    baja()
    p.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    expect(aviso).toHaveBeenCalledTimes(1)
  })
})
