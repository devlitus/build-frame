import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  casillasRio,
  crearEstadoInicial,
  ladoValle,
  type Comando,
  type EstadoJuego,
} from '../../src/core'

const base = crearEstadoInicial({ semilla: 7, dineroInicial: 10_000_000 })
const LADO = ladoValle(base.valle)
const agua = new Set(casillasRio(base.valle, base.cauce.ancho).map((k) => k.y * LADO + k.x))
const coord = fc.integer({ min: -5, max: LADO + 5 })

const comando: fc.Arbitrary<Comando> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({
      tipo: fc.constant('ComprarParcela' as const),
      indice: fc.integer({ min: 0, max: 24 }),
    }),
  },
  {
    weight: 6,
    arbitrary: fc.record({
      tipo: fc.constant('PintarZona' as const),
      x0: coord,
      y0: coord,
      x1: coord,
      y1: coord,
      zona: fc.constantFrom(
        'cultivo' as const,
        'huerto' as const,
        'vivienda' as const,
        'almacen' as const,
      ),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      tipo: fc.constant('BorrarZona' as const),
      x0: coord,
      y0: coord,
      x1: coord,
      y1: coord,
    }),
  },
)

describe('zonas (propiedades)', () => {
  it('las casillas con zona están en parcelas propias y no son agua', () => {
    fc.assert(
      fc.property(fc.array(comando, { maxLength: 40 }), (cs) => {
        let e: EstadoJuego = base
        for (const c of cs) e = aplicarComando(e, c).estado
        const c = e.valle.casillasPorParcela
        expect(e.zonas.length).toBe(LADO * LADO)
        for (let i = 0; i < e.zonas.length; i++) {
          if (e.zonas[i] === '.') continue
          const x = i % LADO
          const y = Math.floor(i / LADO)
          const p =
            e.valle.parcelas[Math.floor(y / c) * e.valle.parcelasPorLado + Math.floor(x / c)]
          expect(p?.estado).toBe('propia')
          expect(agua.has(i)).toBe(false)
        }
      }),
      { numRuns: 100 },
    )
  })
})
