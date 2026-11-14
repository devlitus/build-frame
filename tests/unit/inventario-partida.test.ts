import { describe, expect, it, vi } from 'vitest'
import { casillaDeEnfrente, crearEstadoInicial, type EstadoJuego } from '../../src/core'
import { conTierraLabrable } from './fixtures/labranza'
import { Partida, type AvisoInterfaz } from '../../src/game/partida'

const base = crearEstadoInicial({ semilla: 7 })
const estado: EstadoJuego = conTierraLabrable(
  { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'este' } },
  50,
  50,
)
const nueva = () => new Partida(estado)

describe('Partida: herramientas', () => {
  it('elegir «semillas» sin semilla elegida toma la primera del inventario', () => {
    const p = nueva()
    p.elegirHerramienta('semillas')
    expect(p.estado.herramienta).toBe('semillas')
    expect(p.estado.semillaElegida).toBe('semilla-rabano')
  })

  it('elegir «semillas» respeta la semilla ya elegida', () => {
    const p = nueva()
    p.elegirSemilla('semilla-fresa')
    p.elegirHerramienta('azada')
    p.elegirHerramienta('semillas')
    expect(p.estado.semillaElegida).toBe('semilla-fresa')
  })

  it('elegir «semillas» sin ninguna semilla deja la elegida en null (no una agotada)', () => {
    const sinSemillas: EstadoJuego = {
      ...estado,
      inventario: estado.inventario.filter((r) => !r.objeto.startsWith('semilla-')),
      semillaElegida: 'semilla-fresa',
    }
    const p = new Partida(sinSemillas)
    p.elegirHerramienta('semillas')
    expect(p.estado.herramienta).toBe('semillas')
    expect(p.estado.semillaElegida).toBeNull()
  })

  it('elegirSemilla deja activa la herramienta «semillas»', () => {
    const p = nueva()
    p.elegirSemilla('semilla-patata')
    expect(p.estado).toMatchObject({ herramienta: 'semillas', semillaElegida: 'semilla-patata' })
  })

  it('usarEnfrente actúa sobre la casilla de enfrente y deja constancia', () => {
    const p = nueva()
    const r = p.usarEnfrente()
    expect(r.ok).toBe(true)
    expect(casillaDeEnfrente(p.estado.personaje)).toEqual({ x: 51, y: 50 })
    expect(p.ultimoUso).toMatchObject({
      n: 1,
      herramienta: 'azada',
      x: 51,
      y: 50,
      error: undefined,
    })
  })

  it('un uso rechazado avisa a la interfaz con el motivo y no cambia el estado', () => {
    const p = nueva()
    const avisos: AvisoInterfaz[] = []
    p.suscribirAvisos((a) => avisos.push(a))
    const antes = p.estado
    const r = p.usarHerramienta(60, 50)
    expect(r.ok).toBe(false)
    expect(p.estado).toBe(antes)
    expect(avisos).toEqual([{ tipo: 'herramienta-rechazada', error: 'fuera-de-alcance' }])
    expect(p.ultimoUso).toMatchObject({ n: 1, error: 'fuera-de-alcance' })
  })

  it('un uso aceptado avisa a los suscriptores del estado con su evento', () => {
    const p = nueva()
    const f = vi.fn()
    p.suscribir(f)
    p.usarHerramienta(50, 51)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0]?.[0].eventos).toEqual([
      { tipo: 'herramienta-usada', herramienta: 'azada', x: 50, y: 51 },
      { tipo: 'tierra-arada', x: 50, y: 51 },
    ])
  })
})

describe('Partida: panel de inventario', () => {
  it('se cierra al pasar al Modo Plano y cuando se abre otro panel del Plano', () => {
    const p = nueva()
    p.inventario.abrir('teclado')
    expect(p.inventario.abierto).toBe(true)
    expect(p.inventario.origen).toBe('teclado')
    p.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    expect(p.inventario.abierto).toBe(false)

    p.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    p.inventario.abrir()
    p.pincel.abrir()
    expect(p.inventario.abierto).toBe(false)

    p.inventario.abrir()
    p.construccion.abrir()
    expect(p.inventario.abierto).toBe(false)

    p.inventario.abrir()
    p.seleccion.seleccionar(3)
    expect(p.inventario.abierto).toBe(false)
  })

  it('alternar abre y cierra, y avisa solo cuando cambia', () => {
    const p = nueva()
    const f = vi.fn()
    p.inventario.suscribir(f)
    p.inventario.alternar()
    p.inventario.abrir()
    p.inventario.alternar()
    p.inventario.cerrar()
    expect(f).toHaveBeenCalledTimes(2)
    expect(p.inventario.abierto).toBe(false)
  })

  it('reemplazar el estado cierra el panel', () => {
    const p = nueva()
    p.inventario.abrir()
    p.reemplazar(estado)
    expect(p.inventario.abierto).toBe(false)
  })
})
