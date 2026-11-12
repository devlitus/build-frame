import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { aplicarComando, crearEstadoInicial, type Comando, type EstadoJuego } from '../../src/core'

const comando: fc.Arbitrary<Comando> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      tipo: fc.constant('ComprarParcela' as const),
      indice: fc.oneof(fc.integer({ min: -2, max: 30 }), fc.double()),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      tipo: fc.constant('AvanzarTiempo' as const),
      minutos: fc.integer({ min: 0, max: 1440 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      tipo: fc.constant('CambiarModo' as const),
      modo: fc.constantFrom('vida' as const, 'plano' as const),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ tipo: 'Pausar' as const }) },
  { weight: 1, arbitrary: fc.constant({ tipo: 'Reanudar' as const }) },
)

function ejecutar(inicial: EstadoJuego, comandos: readonly Comando[]) {
  let estado = inicial
  let gastado = 0
  for (const c of comandos) {
    const r = aplicarComando(estado, c)
    if (r.ok) {
      for (const ev of r.eventos) if (ev.tipo === 'parcela-comprada') gastado += ev.precio
    }
    estado = r.estado
  }
  return { estado, gastado }
}

const VECINOS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function conexo(e: EstadoJuego): boolean {
  const n = e.valle.parcelasPorLado
  const propias = e.valle.parcelas.flatMap((p, i) => (p.estado === 'propia' ? [i] : []))
  const [primera] = propias
  if (primera === undefined) return true
  const vistas = new Set([primera])
  const pila = [primera]
  while (pila.length > 0) {
    const i = pila.pop() as number
    const f = Math.floor(i / n)
    const c = i % n
    for (const [df, dc] of VECINOS) {
      const ff = f + df
      const cc = c + dc
      if (ff < 0 || cc < 0 || ff >= n || cc >= n) continue
      const j = ff * n + cc
      if (e.valle.parcelas[j]?.estado === 'propia' && !vistas.has(j)) {
        vistas.add(j)
        pila.push(j)
      }
    }
  }
  return vistas.size === propias.length
}

describe('compra de parcelas: propiedades', () => {
  it('invariantes con secuencias mezcladas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.array(comando, { maxLength: 60 }),
        (semilla, dineroInicial, comandos) => {
          const inicial = crearEstadoInicial({ semilla, dineroInicial })
          const { estado, gastado } = ejecutar(inicial, comandos)
          expect(estado.dinero).toBeGreaterThanOrEqual(0)
          expect(estado.dinero + gastado).toBe(dineroInicial)
          const propias = estado.valle.parcelas.filter((p) => p.estado === 'propia').length
          expect(estado.comprasHechas).toBe(propias)
          expect(conexo(estado)).toBe(true)
          expect(ejecutar(inicial, comandos).estado).toEqual(estado)
        },
      ),
      { numRuns: 100 },
    )
  })
})
