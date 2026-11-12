import { describe, expect, it, vi } from 'vitest'
import { CONFIG_PERSONAJE, CONFIG_TIEMPO, crearEstadoInicial } from '../../src/core'
import { Partida } from '../../src/game/partida'
import {
  AcumuladorTiempo,
  DELTA_MAXIMO_MS,
  acotarDelta,
  comandosMovimiento,
} from '../../src/game/bucle'
import { leerParametros } from '../../src/game/parametros'

const nueva = () => new Partida(crearEstadoInicial({ semilla: 7, dineroInicial: 0 }))

describe('Partida', () => {
  it('aplica comandos y avisa a los suscriptores con el estado nuevo', () => {
    const p = nueva()
    const f = vi.fn()
    p.suscribir(f)
    const r = p.emitir({ tipo: 'AvanzarTiempo', minutos: 10 })
    expect(r.ok).toBe(true)
    expect(p.estado.minutoDelDia).toBe(CONFIG_TIEMPO.horaInicio + 10)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0]?.[0].estado).toBe(p.estado)
  })

  it('un comando rechazado no cambia el estado ni avisa', () => {
    const p = nueva()
    const antes = p.estado
    const f = vi.fn()
    p.suscribir(f)
    expect(p.emitir({ tipo: 'AvanzarTiempo', minutos: -1 }).ok).toBe(false)
    expect(p.estado).toBe(antes)
    expect(f).not.toHaveBeenCalled()
  })

  it('los eventos del núcleo (desmayo) llegan a los suscriptores', () => {
    const p = nueva()
    const f = vi.fn()
    p.suscribir(f)
    p.emitir({ tipo: 'AvanzarTiempo', minutos: 5000 })
    expect(f.mock.calls[0]?.[0].eventos).toEqual([{ tipo: 'desmayo' }])
  })

  it('se puede cancelar la suscripción', () => {
    const p = nueva()
    const f = vi.fn()
    const baja = p.suscribir(f)
    baja()
    p.emitir({ tipo: 'Pausar' })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('bucle de tiempo', () => {
  it('acota el delta', () => {
    expect(acotarDelta(5000)).toBe(DELTA_MAXIMO_MS)
    expect(acotarDelta(16)).toBe(16)
    expect(acotarDelta(-3)).toBe(0)
    expect(acotarDelta(NaN)).toBe(0)
  })

  it('a x1 un día dura unos 15 minutos reales', () => {
    const a = new AcumuladorTiempo()
    let min = 0
    const pasos = (15 * 60_000) / 16
    for (let i = 0; i < pasos; i++) min += a.acumular(16, 1, false)
    expect(min).toBeGreaterThan(CONFIG_TIEMPO.horaFin - CONFIG_TIEMPO.horaInicio - 2)
    expect(min).toBeLessThanOrEqual(CONFIG_TIEMPO.horaFin - CONFIG_TIEMPO.horaInicio)
  })

  it('en pausa no acumula', () => {
    const a = new AcumuladorTiempo()
    expect(a.acumular(100, 1, true)).toBe(0)
    expect(a.acumular(0, 1, false)).toBe(0)
  })
})

describe('movimiento por teclado', () => {
  it('sin intención no emite comandos', () => {
    expect(comandosMovimiento({ dx: 0, dy: 0 }, 16)).toEqual([])
  })

  it('trocea los fotogramas largos', () => {
    const max = CONFIG_PERSONAJE.maxMsPorComando
    const cs = comandosMovimiento({ dx: 1, dy: 0 }, max * 2 + 10)
    expect(cs).toHaveLength(3)
    const total = cs.reduce((s, c) => s + (c.tipo === 'MoverPersonaje' ? c.ms : 0), 0)
    expect(total).toBeCloseTo(max * 2 + 10)
    for (const c of cs) if (c.tipo === 'MoverPersonaje') expect(c.ms).toBeLessThanOrEqual(max)
  })
})

describe('parámetro ?en', () => {
  it('solo vale con debug', () => {
    expect(leerParametros('?debug&en=vado').en).toBe('vado')
    expect(leerParametros('?en=vado').en).toBeUndefined()
    expect(leerParametros('?debug&en=otro').en).toBeUndefined()
  })
})

describe('contra un muro y suscriptores rotos', () => {
  it('MoverPersonaje sin cambio de posición devuelve el mismo estado y no avisa', () => {
    const e = crearEstadoInicial({ semilla: 7, dineroInicial: 0 })
    // Personaje ya pegado al borde del valle y mirando al oeste: ir al noroeste no cambia nada.
    const p = new Partida({ ...e, personaje: { x: 0.5, y: 0.5, orientacion: 'oeste' as const } })
    p.emitir({ tipo: 'MoverPersonaje', dx: -1, dy: 0, ms: 250 }) // se pega al borde
    const pegado = p.estado
    const f = vi.fn()
    p.suscribir(f)
    const r = p.emitir({ tipo: 'MoverPersonaje', dx: -1, dy: 0, ms: 100 })
    expect(r.ok && r.estado === pegado).toBe(true)
    expect(p.estado).toBe(pegado)
    expect(f).not.toHaveBeenCalled()
  })

  it('un suscriptor que falla no impide avisar a los demás', () => {
    const p = nueva()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bueno = vi.fn()
    p.suscribir(() => {
      throw new Error('roto')
    })
    p.suscribir(bueno)
    p.emitir({ tipo: 'Pausar' })
    expect(bueno).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('reemplazar conserva a los suscriptores', () => {
    const p = nueva()
    const f = vi.fn()
    p.suscribir(f)
    p.reemplazar(crearEstadoInicial({ semilla: 8, dineroInicial: 0 }))
    expect(f).toHaveBeenCalledTimes(1)
  })
})
