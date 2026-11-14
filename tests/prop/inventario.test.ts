/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de catálogo conocido en tests */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  anadirObjeto,
  aplicarComando,
  cantidadDe,
  capacidadInventario,
  CONFIG_INVENTARIO,
  crearEstadoInicial,
  defObjeto,
  HERRAMIENTAS,
  inventarioValido,
  OBJETOS,
  quitarObjeto,
  type Comando,
  type Edificio,
  type EstadoJuego,
  type Inventario,
  type ObjetoId,
} from '../../src/core'

const objeto = fc.constantFrom(...OBJETOS)
const capacidad = fc.integer({ min: 1, max: 48 })

type Op = { t: 'anadir'; o: ObjetoId; n: number } | { t: 'quitar'; o: ObjetoId; n: number }
const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ t: fc.constant('anadir' as const), o: objeto, n: fc.integer({ min: 1, max: 400 }) }),
  fc.record({ t: fc.constant('quitar' as const), o: objeto, n: fc.integer({ min: 1, max: 400 }) }),
)

const totales = (inv: Inventario) => Object.fromEntries(OBJETOS.map((o) => [o, cantidadDe(inv, o)]))

describe('propiedades del inventario', () => {
  it('añadir y quitar mantienen los invariantes y conservan las cantidades', () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 60 }), capacidad, (ops, cap) => {
        let inv: Inventario = []
        for (const x of ops) {
          const antes = totales(inv)
          const r =
            x.t === 'anadir' ? anadirObjeto(inv, x.o, x.n, cap) : quitarObjeto(inv, x.o, x.n)
          if (r === undefined) {
            // Rechazado: nada cambia (el inventario es inmutable y la función pura).
            expect(totales(inv)).toEqual(antes)
            continue
          }
          // Cantidades enteras > 0, ninguna pila por encima del máximo, ≤ 1 incompleta por objeto.
          expect(inventarioValido(r)).toBe(true)
          for (const s of r) {
            expect(Number.isInteger(s.cantidad)).toBe(true)
            expect(s.cantidad).toBeGreaterThan(0)
            expect(s.cantidad).toBeLessThanOrEqual(defObjeto(s.objeto)?.pilaMaxima ?? 0)
          }
          // Solo cambia el objeto tocado, exactamente en `n`.
          const delta = x.t === 'anadir' ? x.n : -x.n
          for (const o of OBJETOS) {
            expect(cantidadDe(r, o)).toBe(antes[o]! + (o === x.o ? delta : 0))
          }
          if (x.t === 'anadir') expect(r.length).toBeLessThanOrEqual(cap)
          inv = r
        }
      }),
      { numRuns: 300 },
    )
  })

  it('un inventario por encima de su capacidad no admite nada hasta que baja', () => {
    fc.assert(
      fc.property(objeto, objeto, fc.integer({ min: 1, max: 11 }), (a, b, cap) => {
        const lleno: Inventario = Array.from({ length: cap + 1 }, (_, i) => ({
          objeto: i % 2 === 0 ? a : b,
          cantidad: defObjeto(i % 2 === 0 ? a : b)?.pilaMaxima ?? 1,
        }))
        // Con a === b las ranuras son todas completas: el inventario es válido.
        expect(inventarioValido(lleno)).toBe(true)
        expect(anadirObjeto(lleno, a, 1, cap)).toBeUndefined()
        expect(anadirObjeto(lleno, b, 1, cap)).toBeUndefined()
        const aun = quitarObjeto(lleno, a, defObjeto(a)?.pilaMaxima ?? 1)
        expect(aun).toBeDefined()
      }),
    )
  })

  it('la capacidad es la base más 12 por cada cobertizo terminado', () => {
    const edificio = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      tipo: fc.constantFrom('casa', 'caja-envio', 'cobertizo' as const),
      x: fc.integer({ min: 0, max: 60 }),
      y: fc.integer({ min: 0, max: 60 }),
      obra: fc.option(
        fc.record({
          diaInicio: fc.integer({ min: 1, max: 9 }),
          diaFin: fc.integer({ min: 10, max: 20 }),
        }),
        { nil: null },
      ),
    })
    fc.assert(
      fc.property(fc.array(edificio, { maxLength: 20 }), (edificios) => {
        const terminados = edificios.filter((e) => e.tipo === 'cobertizo' && e.obra === null).length
        expect(capacidadInventario(edificios as Edificio[])).toBe(
          CONFIG_INVENTARIO.capacidadBase +
            terminados * CONFIG_INVENTARIO.ranurasPorEdificio.cobertizo,
        )
      }),
    )
  })
})

const base = crearEstadoInicial({ semilla: 7 })
const inicio: EstadoJuego = { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } }

const comando: fc.Arbitrary<Comando> = fc.oneof(
  fc
    .constantFrom(...HERRAMIENTAS)
    .map((herramienta) => ({ tipo: 'ElegirHerramienta' as const, herramienta })),
  fc.anything().map((herramienta) => ({
    tipo: 'ElegirHerramienta' as const,
    herramienta: herramienta as never,
  })),
  fc
    .oneof(objeto, fc.constant(null), fc.string())
    .map((o) => ({ tipo: 'ElegirSemilla' as const, objeto: o as never })),
  fc
    .tuple(fc.integer({ min: 46, max: 54 }), fc.integer({ min: 46, max: 54 }))
    .map(([x, y]) => ({ tipo: 'UsarHerramienta' as const, x, y })),
  fc
    .tuple(fc.double({ noNaN: false }), fc.anything())
    .map(([x, y]) => ({ tipo: 'UsarHerramienta' as const, x, y: y as never })),
  fc.constantFrom('vida', 'plano' as const).map((modo) => ({ tipo: 'CambiarModo' as const, modo })),
  fc.constantFrom('Pausar', 'Reanudar' as const).map((tipo) => ({ tipo })),
)

describe('propiedades de los comandos del inventario y las herramientas', () => {
  it('un comando rechazado deja el estado intacto y el inventario nunca se rompe', () => {
    fc.assert(
      fc.property(fc.array(comando, { maxLength: 40 }), (comandos) => {
        let e = inicio
        for (const c of comandos) {
          const r = aplicarComando(e, c)
          if (!r.ok) expect(r.estado).toBe(e)
          else if (c.tipo === 'UsarHerramienta') {
            // Sin efecto en esta historia: el estado no cambia.
            expect(r.estado).toBe(e)
          }
          e = r.estado
          expect(inventarioValido(e.inventario)).toBe(true)
          expect(e.inventario).toBe(inicio.inventario)
          expect(HERRAMIENTAS).toContain(e.herramienta)
          if (e.semillaElegida !== null) {
            expect(cantidadDe(e.inventario, e.semillaElegida)).toBeGreaterThan(0)
          }
        }
      }),
      { numRuns: 300 },
    )
  })
})
