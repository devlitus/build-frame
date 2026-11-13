/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de catálogo conocido en tests */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  casillasOcupadas,
  colocacionValida,
  crearEstadoInicial,
  defEdificio,
  ladoValle,
  reembolso,
  type Comando,
  type EstadoJuego,
  type TipoEdificio,
} from '../../src/core'

const TIPOS: readonly TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']
const DINERO = 5000

/** Plano con las parcelas propias, vivienda a la izquierda y almacén a la derecha. */
function preparar(semilla: number): EstadoJuego {
  let e = crearEstadoInicial({ semilla, dineroInicial: DINERO + 20_000 })
  const paso = (c: Comando): void => {
    const r = aplicarComando(e, c)
    if (r.ok) e = r.estado
  }
  const n = e.valle.parcelasPorLado
  for (let i = 0; i < n * n; i++) paso({ tipo: 'ComprarParcela', indice: i })
  const lado = ladoValle(e.valle)
  const mitad = Math.floor(lado / 2)
  paso({ tipo: 'PintarZona', x0: 0, y0: 0, x1: mitad - 1, y1: lado - 1, zona: 'vivienda' })
  paso({ tipo: 'PintarZona', x0: mitad, y0: 0, x1: lado - 1, y1: lado - 1, zona: 'almacen' })
  paso({ tipo: 'CambiarModo', modo: 'plano' })
  return { ...e, dinero: DINERO, materiales: { madera: 500, piedra: 200 } }
}

/**
 * Parte de un valle con dos edificios ya terminados y una obra en marcha: así moverlos, demolerlos y
 * cancelar la obra no dependen de que el generador acierte antes con construir y esperar un día.
 */
function conEdificios(
  base: EstadoJuego,
  sitios: Record<TipoEdificio, { x: number; y: number }[]>,
): EstadoJuego {
  let e = base
  const levantar = (tipo: TipoEdificio, i: number): void => {
    const l = sitios[tipo]
    const sitio = l[Math.floor((l.length * i) / 4)]
    if (!sitio) return
    const r = aplicarComando(e, { tipo: 'Construir', tipoEdificio: tipo, ...sitio })
    if (r.ok) e = r.estado
  }
  levantar('caja-envio', 0)
  levantar('cobertizo', 1)
  const dias = aplicarComando(e, { tipo: 'CambiarModo', modo: 'vida' })
  if (dias.ok) {
    const t = aplicarComando(dias.estado, { tipo: 'AvanzarTiempo', minutos: 100_000 })
    const v = t.ok ? aplicarComando(t.estado, { tipo: 'CambiarModo', modo: 'plano' }) : undefined
    if (v?.ok) e = v.estado
  }
  levantar('caja-envio', 3)
  return e
}

const SEMILLAS = [3, 42]
const ESCENARIOS = SEMILLAS.map((semilla) => {
  const e = preparar(semilla)
  const lado = ladoValle(e.valle)
  // Sitios válidos de cada tipo en el estado vacío, espaciados para tener variedad sin pasarse de tamaño.
  const sitios = Object.fromEntries(
    TIPOS.map((t) => {
      const l: { x: number; y: number }[] = []
      for (let y = 0; y < lado; y += 2) {
        for (let x = 0; x < lado; x += 2) {
          if (colocacionValida(e, t, x, y, { ignorarCostes: true }).valida) l.push({ x, y })
        }
      }
      return [t, l]
    }),
  ) as Record<TipoEdificio, { x: number; y: number }[]>
  return { e, sitios }
})

type Paso =
  | { k: 'construir'; tipo: TipoEdificio; i: number }
  | { k: 'mover'; id: number; tipo: TipoEdificio; i: number }
  | { k: 'demoler'; id: number }
  | { k: 'cancelar'; id: number }
  | { k: 'dia' }

const arbPaso: fc.Arbitrary<Paso> = fc.oneof(
  fc.record({
    k: fc.constant('construir' as const),
    tipo: fc.constantFrom(...TIPOS),
    i: fc.nat(100_000),
  }),
  fc.record({
    k: fc.constant('mover' as const),
    id: fc.integer({ min: 1, max: 6 }),
    tipo: fc.constantFrom(...TIPOS),
    i: fc.nat(100_000),
  }),
  fc.record({ k: fc.constant('demoler' as const), id: fc.integer({ min: 1, max: 6 }) }),
  fc.record({ k: fc.constant('cancelar' as const), id: fc.integer({ min: 1, max: 6 }) }),
  fc.record({ k: fc.constant('dia' as const) }),
)

function aComando(p: Paso, sitios: Record<TipoEdificio, { x: number; y: number }[]>): Comando[] {
  const en = (t: TipoEdificio, i: number) => {
    const l = sitios[t]
    return l[i % Math.max(1, l.length)] ?? { x: 0, y: 0 }
  }
  switch (p.k) {
    case 'construir':
      return [{ tipo: 'Construir', tipoEdificio: p.tipo, ...en(p.tipo, p.i) }]
    case 'mover':
      return [{ tipo: 'MoverEdificio', id: p.id, ...en(p.tipo, p.i) }]
    case 'demoler':
      return [{ tipo: 'DemolerEdificio', id: p.id }]
    case 'cancelar':
      return [{ tipo: 'CancelarObra', id: p.id }]
    case 'dia':
      return [
        { tipo: 'CambiarModo', modo: 'vida' },
        { tipo: 'AvanzarTiempo', minutos: 100_000 },
        { tipo: 'CambiarModo', modo: 'plano' },
      ]
  }
}

function sinSolapes(e: EstadoJuego): boolean {
  const lado = ladoValle(e.valle)
  let celdas = 0
  for (const b of e.edificios) {
    const d = defEdificio(b.tipo)!
    celdas += d.ancho * d.alto
  }
  // Si dos huellas se pisaran, el mapa de ocupadas tendría menos casillas que la suma de huellas.
  return casillasOcupadas(e.edificios, lado).size === celdas
}

describe('mover y demoler: invariantes con partidas aleatorias', () => {
  it('nunca hay dinero ni materiales negativos o no enteros, ni solapes, ni ids repetidos', () => {
    for (const { e: inicial, sitios } of ESCENARIOS) {
      fc.assert(
        fc.property(fc.array(arbPaso, { maxLength: 25 }), (pasos) => {
          let e = inicial
          for (const p of pasos) {
            for (const c of aComando(p, sitios)) {
              const r = aplicarComando(e, c)
              // Un comando rechazado no toca el estado.
              if (!r.ok) expect(r.estado).toBe(e)
              e = r.estado
            }
            expect(Number.isSafeInteger(e.dinero) && e.dinero >= 0).toBe(true)
            for (const m of [e.materiales.madera, e.materiales.piedra]) {
              expect(Number.isSafeInteger(m) && m >= 0).toBe(true)
            }
            expect(sinSolapes(e)).toBe(true)
            expect(new Set(e.edificios.map((b) => b.id)).size).toBe(e.edificios.length)
            expect(e.edificios.filter((b) => b.tipo === 'casa').length).toBeLessThanOrEqual(1)
          }
        }),
        { numRuns: 60 },
      )
    }
  })

  it('sin ingresos, construir, mover, demoler y cancelar nunca dejan más dinero ni materiales que al inicio', () => {
    for (const { e: inicial, sitios } of ESCENARIOS) {
      fc.assert(
        fc.property(fc.array(arbPaso, { maxLength: 25 }), (pasos) => {
          let e = inicial
          for (const p of pasos) {
            for (const c of aComando(p, sitios)) e = aplicarComando(e, c).estado
            expect(e.dinero).toBeLessThanOrEqual(inicial.dinero)
            expect(e.materiales.madera).toBeLessThanOrEqual(inicial.materiales.madera)
            expect(e.materiales.piedra).toBeLessThanOrEqual(inicial.materiales.piedra)
          }
        }),
        { numRuns: 60 },
      )
    }
  })

  it('mover no cambia el dinero, los materiales ni la cuenta de edificios; solo la posición', () => {
    for (const { e: inicial, sitios } of ESCENARIOS) {
      fc.assert(
        fc.property(fc.array(arbPaso, { maxLength: 15 }), (pasos) => {
          let e = inicial
          for (const p of pasos) {
            for (const c of aComando(p, sitios)) {
              const r = aplicarComando(e, c)
              if (c.tipo === 'MoverEdificio' && r.ok) {
                expect(r.estado.dinero).toBe(e.dinero)
                expect(r.estado.materiales).toEqual(e.materiales)
                expect(r.estado.edificios.length).toBe(e.edificios.length)
                const antes = e.edificios.find((b) => b.id === c.id)!
                const despues = r.estado.edificios.find((b) => b.id === c.id)!
                expect({ ...despues, x: 0, y: 0 }).toEqual({ ...antes, x: 0, y: 0 })
              }
              e = r.estado
            }
          }
        }),
        { numRuns: 60 },
      )
    }
  })

  it('el reembolso previsto es el que se aplica y nunca supera lo pagado', () => {
    for (const { e: inicial, sitios } of ESCENARIOS) {
      fc.assert(
        fc.property(fc.array(arbPaso, { maxLength: 20 }), (pasos) => {
          let e = inicial
          for (const p of pasos) {
            for (const c of aComando(p, sitios)) {
              if (c.tipo === 'DemolerEdificio' || c.tipo === 'CancelarObra') {
                const prev = reembolso(e, c.id)
                const b = e.edificios.find((x) => x.id === c.id)
                const r = aplicarComando(e, c)
                if (r.ok) {
                  expect(prev).toBeDefined()
                  expect(r.estado.dinero - e.dinero).toBe(prev!.coste.dinero)
                  expect(r.estado.materiales.madera - e.materiales.madera).toBe(prev!.coste.madera)
                  expect(r.estado.materiales.piedra - e.materiales.piedra).toBe(prev!.coste.piedra)
                  const pagado = b!.pagado!
                  expect(prev!.coste.dinero).toBeLessThanOrEqual(pagado.dinero)
                  expect(prev!.coste.madera).toBeLessThanOrEqual(pagado.madera)
                  expect(prev!.coste.piedra).toBeLessThanOrEqual(pagado.piedra)
                  if (prev!.accion === 'cancelar') expect(prev!.coste).toEqual(pagado)
                }
              }
              e = aplicarComando(e, c).estado
            }
          }
        }),
        { numRuns: 60 },
      )
    }
  })

  it('construir y luego cancelar o demoler no deja más que al inicio (todas las posiciones)', () => {
    for (const { e: inicial, sitios } of ESCENARIOS) {
      for (const tipo of TIPOS) {
        for (const s of sitios[tipo].slice(0, 25)) {
          const c = aplicarComando(inicial, { tipo: 'Construir', tipoEdificio: tipo, ...s })
          if (!c.ok) continue
          const id = c.estado.siguienteIdEdificio - 1
          const cancelada = aplicarComando(c.estado, { tipo: 'CancelarObra', id })
          expect(cancelada.ok && cancelada.estado.dinero).toBe(inicial.dinero)
          expect(cancelada.ok && cancelada.estado.materiales).toEqual(inicial.materiales)
          let plano = c.estado
          for (let d = 0; d < 3; d++) {
            const dia = aplicarComando(
              aplicarComando(plano, { tipo: 'CambiarModo', modo: 'vida' }).estado,
              { tipo: 'AvanzarTiempo', minutos: 100_000 },
            ).estado
            plano = aplicarComando(dia, { tipo: 'CambiarModo', modo: 'plano' }).estado
          }
          const demolida = aplicarComando(plano, { tipo: 'DemolerEdificio', id })
          if (tipo === 'casa') expect(demolida.ok).toBe(false)
          else {
            expect(demolida.ok && demolida.estado.dinero).toBeLessThanOrEqual(inicial.dinero)
            expect(demolida.ok && demolida.estado.materiales.madera).toBeLessThanOrEqual(
              inicial.materiales.madera,
            )
            expect(demolida.ok && demolida.estado.materiales.piedra).toBeLessThanOrEqual(
              inicial.materiales.piedra,
            )
          }
        }
      }
    }
  })

  it('las partidas aleatorias llegan a mover, demoler y cancelar de verdad', () => {
    const vistos = new Set<string>()
    for (const { e: base, sitios } of ESCENARIOS) {
      const inicial = conEdificios(base, sitios)
      fc.assert(
        fc.property(fc.array(arbPaso, { maxLength: 25 }), (pasos) => {
          let e = inicial
          for (const p of pasos) {
            for (const c of aComando(p, sitios)) {
              const r = aplicarComando(e, c)
              if (r.ok) for (const ev of r.eventos) vistos.add(ev.tipo)
              e = r.estado
            }
          }
        }),
        // Semilla fija: la cobertura (que alguna partida termine un edificio antes de demolerlo) no depende del azar.
        { numRuns: 60, seed: 20261113 },
      )
    }
    for (const t of ['edificio-movido', 'edificio-demolido', 'obra-cancelada', 'obra-terminada']) {
      expect(vistos.has(t), t).toBe(true)
    }
  })
})
