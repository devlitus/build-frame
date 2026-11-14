/** Rompedor · pasada global de M1: el estado inicial con valle se puede guardar tal cual (M7). */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, crearEstadoInicial, VERSION_FORMATO } from '../../src/core'

/** Recorre el valor y devuelve la ruta del primer dato que JSON no conserva. */
function noSerializable(v: unknown, ruta = '$'): string | undefined {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return undefined
  if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0) ? undefined : ruta
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = noSerializable(v[i], `${ruta}[${i}]`)
      if (r) return r
    }
    return undefined
  }
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const r = noSerializable(x, `${ruta}.${k}`)
      if (r) return r
    }
    return undefined
  }
  return ruta
}

describe('estado inicial con valle (M1)', () => {
  it('es JSON puro: ida y vuelta exacta, sin undefined, NaN, -0, clases ni funciones', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.integer({ min: 0, max: 1e9 }),
        (semilla, dinero) => {
          const e = crearEstadoInicial({ semilla, dineroInicial: dinero })
          expect(noSerializable(e)).toBeUndefined()
          const vuelta: unknown = JSON.parse(JSON.stringify(e))
          expect(vuelta).toStrictEqual(e)
          expect(structuredClone(e)).toStrictEqual(e)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('el estado restaurado desde JSON se comporta igual ante los comandos', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), fc.nat(10_000), (semilla, m) => {
        const e = crearEstadoInicial({ semilla, dineroInicial: 0 })
        const r = JSON.parse(JSON.stringify(e)) as typeof e
        const c = { tipo: 'AvanzarTiempo', minutos: m } as const
        expect(aplicarComando(r, c)).toStrictEqual(aplicarComando(e, c))
      }),
      { numRuns: 100 },
    )
  })

  it('cabe holgadamente en el presupuesto de ADR 0001 (< 1 MB) y declara la versión vigente', () => {
    const e = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    expect(e.versionFormato).toBe(VERSION_FORMATO)
    expect(VERSION_FORMATO).toBe(9)
    expect(JSON.stringify(e).length).toBeLessThan(100_000) // M2-02: el estado incluye los obstáculos (máximo medido ~65 KB); muy por debajo de 1 MB
  })
})
