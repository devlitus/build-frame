import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { crearEstadoInicial, parcelaComprable, type EstadoJuego } from '../../src/core'
import { Partida } from '../../src/game/partida'
import { conPropiasDeDepuracion } from '../../src/game/valle/debug'
import { clasificarParcelas, crearClasificador } from '../../src/game/valle/estadoVisual'
import { intentarCompra } from '../../src/ui/compra'
import { formatearDinero } from '../../src/ui/formatoDinero'
import { estadoDeCompra, textoErrorCompra } from '../../src/ui/parcelaTextos'

/** M3-04 · Rompedor: partidas simuladas de compra, memo del clasificador y formato del dinero. */

const base = (dinero: number, semilla = 42): EstadoJuego => ({
  ...crearEstadoInicial({ semilla }),
  dinero,
})

describe('partidas simuladas de compra (rompedor M3-04)', () => {
  it('el dinero cuadra, nunca es negativo y el clasificador memorizado no se queda viejo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff }),
        fc.integer({ min: 0, max: 20_000 }),
        fc.array(
          fc.oneof(
            fc.record({ t: fc.constant('comprar' as const), i: fc.integer({ min: -2, max: 40 }) }),
            fc.record({ t: fc.constant('tiempo' as const), m: fc.integer({ min: 1, max: 30 }) }),
            // Cambios que solo tocan `comprasHechas` o `dinero` (p. ej. cargar o depurar).
            fc.record({ t: fc.constant('compras' as const), d: fc.integer({ min: -1, max: 3 }) }),
            fc.record({
              t: fc.constant('dinero' as const),
              d: fc.integer({ min: -500, max: 500 }),
            }),
          ),
          { maxLength: 40 },
        ),
        (semilla, dinero0, pasos) => {
          const partida = new Partida(base(dinero0, semilla))
          const clasificar = crearClasificador()
          let gastado = 0
          let ajustes = 0
          for (const p of pasos) {
            const antes = partida.estado
            if (p.t === 'comprar') {
              const c = parcelaComprable(antes, p.i)
              const r = intentarCompra(partida, p.i)
              expect(r.ok).toBe(c.comprable)
              if (r.ok && c.comprable) gastado += c.precio
              else expect(partida.estado).toBe(antes)
            } else if (p.t === 'tiempo') {
              partida.emitir({ tipo: 'AvanzarTiempo', minutos: p.m })
            } else if (p.t === 'compras') {
              partida.reemplazar({
                ...antes,
                comprasHechas: Math.max(0, antes.comprasHechas + p.d),
              })
            } else {
              const d = Math.max(-antes.dinero, p.d)
              ajustes += d
              partida.reemplazar({ ...antes, dinero: antes.dinero + d })
            }
            const e = partida.estado
            expect(e.dinero).toBeGreaterThanOrEqual(0)
            expect(e.dinero).toBe(dinero0 - gastado + ajustes)
            expect(clasificar(e)).toEqual(clasificarParcelas(e))
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('comprar sin parar hasta quedarse sin dinero: termina, y al final nada es comprable', () => {
    for (const dinero0 of [0, 299, 1100, 5000, 1_000_000_000]) {
      const partida = new Partida(base(dinero0))
      let compras = 0
      for (;;) {
        const v = clasificarParcelas(partida.estado)
        const i = v.indexOf('comprable')
        if (i < 0) break
        expect(intentarCompra(partida, i).ok).toBe(true)
        compras++
        expect(compras).toBeLessThanOrEqual(36)
      }
      const fin = clasificarParcelas(partida.estado)
      expect(fin.includes('comprable')).toBe(false)
      // O se compró todo, o lo que queda es más caro que el dinero (o no es adyacente).
      for (let i = 0; i < 36; i++) {
        const c = parcelaComprable(partida.estado, i)
        expect(c.comprable).toBe(false)
      }
      expect(partida.estado.comprasHechas).toBe(compras)
    }
  })
})

describe('textos de compra (rompedor M3-04)', () => {
  it('«te faltan» es exactamente precio − dinero, con punto de millar', () => {
    const e = conPropiasDeDepuracion(base(3), [14])
    const c = parcelaComprable(e, 15)
    expect(c.comprable).toBe(false)
    if (c.comprable || c.precio === undefined) throw new Error('debía faltar dinero')
    expect(estadoDeCompra(c, 3).texto).toBe(
      `No te llega el dinero (te faltan ${formatearDinero(c.precio - 3)})`,
    )
  })

  it('todos los motivos de rechazo tienen un texto no vacío', () => {
    for (const m of [
      'parametro-invalido',
      'ya-propia',
      'no-adyacente',
      'fondos-insuficientes',
      'precio-invalido',
    ] as const)
      expect(textoErrorCompra(m).length).toBeGreaterThan(5)
  })
})

describe('formatearDinero (rompedor M3-04)', () => {
  it('cualquier entero seguro: quitar los puntos devuelve la cifra y los grupos son de 3', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (n) => {
        const s = formatearDinero(n)
        expect(s).toMatch(/^-?\d{1,3}(\.\d{3})*$/)
        expect(Number(s.replaceAll('.', ''))).toBe(n === 0 ? 0 : n)
      }),
      { numRuns: 2000 },
    )
  })

  it('-0 y decimales negativos pequeños no muestran «-0»', () => {
    expect(formatearDinero(-0)).toBe('0')
    expect(formatearDinero(-0.4)).toBe('0')
    expect(formatearDinero(999.99)).toBe('999')
  })

  // FALLA (S3): con números de 22 cifras o más `String(n)` da notación científica y el HUD
  // mostraría «1e+21». No se llega por comandos (el núcleo exige enteros seguros), pero sí con
  // un estado corrupto: el contrato dice «número entero formateado con punto de millar».
  it('enteros enormes (fuera de los seguros) siguen saliendo con puntos, sin notación científica', () => {
    expect(formatearDinero(1e21)).toBe('1.000.000.000.000.000.000.000')
    expect(formatearDinero(-1e21)).not.toContain('e')
  })
})
