import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  CARACTER_ZONA,
  casillasOcupadas,
  crearEstadoInicial,
  ENERGIA_MAXIMA,
  ladoValle,
  zonaEn,
  type Comando,
  type EstadoJuego,
  type EventoJuego,
} from '../../src/core'

/*
 * Propiedades de M5-06 sobre secuencias al azar de talar, picar, plantar, andar y pasar los días:
 * los materiales nunca bajan, un obstáculo nunca da botín dos veces y nunca coinciden un obstáculo y
 * un edificio, ni un obstáculo y un cultivo o huerto (los que crea esta historia: plantones y
 * árboles crecidos; pintar cultivo sobre un árbol ya puesto lo permite M4, GDD §6.4).
 */

type Op = Comando | { readonly tipo: 'recargar' }

/** Valle propio, con una parcela de bosque en el centro del personaje, plantones de sobra y obras de M4. */
const CACHE = new Map<number, EstadoJuego>()
function inicial(semilla: number): EstadoJuego {
  let e = CACHE.get(semilla)
  if (!e) CACHE.set(semilla, (e = crear(semilla)))
  return e
}

function crear(semilla: number): EstadoJuego {
  const base = crearEstadoInicial({ semilla, dineroInicial: 1_000_000 })
  const c = base.valle.casillasPorParcela
  const bosque = base.valle.parcelas.find((p) => p.terreno === 'bosque') ?? base.valle.parcelas[0]
  if (!bosque) throw new Error('sin parcelas')
  const lado = ladoValle(base.valle)
  let e: EstadoJuego = {
    ...base,
    modo: 'plano',
    inventario: [{ objeto: 'planton', cantidad: 40 }],
    valle: {
      ...base.valle,
      parcelas: base.valle.parcelas.map((p) => ({ ...p, estado: 'propia' as const })),
    },
  }
  // Un rincón de cultivo y un cobertizo, sobre casillas sin obstáculo (la invariante parte cierta).
  const x0 = bosque.columna * c
  const y0 = bosque.fila * c
  const pinta = (x: number, y: number, zona: 'cultivo' | 'huerto' | 'almacen') => {
    const r = aplicarComando(e, { tipo: 'PintarZona', x0: x, y0: y, x1: x + 3, y1: y + 1, zona })
    if (r.ok) e = r.estado
  }
  pinta(x0 + 1, y0 + 1, 'cultivo')
  pinta(x0 + 8, y0 + 8, 'huerto')
  pinta(x0 + 8, y0 + 1, 'almacen')
  const obra = aplicarComando(e, {
    tipo: 'Construir',
    tipoEdificio: 'cobertizo',
    x: x0 + 8,
    y: y0 + 1,
  })
  if (obra.ok) e = obra.estado
  const libre = (o: { x: number; y: number }) =>
    zonaEn(e, o.x, o.y) !== 'cultivo' && zonaEn(e, o.x, o.y) !== 'huerto'
  e = {
    ...e,
    obstaculos: e.obstaculos.filter(libre),
    modo: 'vida',
    personaje: junto(e, x0, y0, c),
  }
  expect(lado).toBeGreaterThan(0)
  return e
}

/** Casilla libre junto a algún árbol de la parcela (o su centro si no hay). */
function junto(e: EstadoJuego, x0: number, y0: number, c: number): EstadoJuego['personaje'] {
  const dentro = e.obstaculos.filter(
    (o) => o.x >= x0 + 1 && o.x < x0 + c - 1 && o.y >= y0 + 1 && o.y < y0 + c - 1,
  )
  const hay = (x: number, y: number) => e.obstaculos.some((o) => o.x === x && o.y === y)
  for (const o of dentro) {
    if (!hay(o.x - 1, o.y)) return { x: o.x - 0.5, y: o.y + 0.5, orientacion: 'este' }
  }
  return { x: x0 + 5.5, y: y0 + 5.5, orientacion: 'sur' }
}

const HERRAMIENTAS_OBSTACULO = ['hacha', 'pico', 'mano'] as const
const opSuelta: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 2,
    arbitrary: fc
      .constantFrom(...HERRAMIENTAS_OBSTACULO)
      .map((herramienta): Op => ({ tipo: 'ElegirHerramienta', herramienta })),
  },
  {
    weight: 10,
    arbitrary: fc
      .tuple(fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))
      .map(([dx, dy]): Op => ({ tipo: 'UsarHerramienta', x: dx, y: dy })),
  },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))
      .map(([dx, dy]): Op => ({ tipo: 'MoverPersonaje', dx, dy, ms: 300 })),
  },
  { weight: 1, arbitrary: fc.constant<Op>({ tipo: 'AvanzarTiempo', minutos: 1560 }) },
  { weight: 3, arbitrary: fc.constant<Op>({ tipo: 'recargar' }) },
)

/** Una ráfaga: elige herramienta y la usa varias veces sobre la misma casilla, hasta quitar lo que haya. */
const rafaga: fc.Arbitrary<Op[]> = fc
  .tuple(
    fc.constantFrom('hacha', 'hacha', 'pico', 'mano'),
    // Casi siempre hacia el este, donde empieza el árbol; a veces a las otras casillas.
    fc.constantFrom(1, 1, 1, 1, 0, -1),
    fc.constantFrom(0, 0, 0, 0, 1, -1),
    fc.integer({ min: 3, max: 6 }),
  )
  .map(([herramienta, dx, dy, n]) => [
    { tipo: 'recargar' },
    { tipo: 'ElegirHerramienta', herramienta },
    ...Array.from({ length: n }, (): Op => ({ tipo: 'UsarHerramienta', x: dx, y: dy })),
  ])
const secuencia: fc.Arbitrary<Op[]> = fc
  .array(
    fc.oneof(
      opSuelta.map((o) => [o]),
      rafaga,
    ),
    { minLength: 1, maxLength: 80 },
  )
  .map((l) => l.flat())

/** Aplica la operación; los `UsarHerramienta` son relativos a la casilla del personaje. */
function paso(e: EstadoJuego, o: Op): { estado: EstadoJuego; eventos: readonly EventoJuego[] } {
  if (o.tipo === 'recargar') return { estado: { ...e, energia: ENERGIA_MAXIMA }, eventos: [] }
  const cmd: Comando =
    o.tipo === 'UsarHerramienta'
      ? { ...o, x: Math.floor(e.personaje.x) + o.x, y: Math.floor(e.personaje.y) + o.y }
      : o
  const r = aplicarComando(e, cmd)
  return r.ok ? { estado: r.estado, eventos: r.eventos } : { estado: e, eventos: [] }
}

const clave = (x: number, y: number) => `${x},${y}`

describe('propiedades de talar, picar y replantar', () => {
  it('los materiales nunca bajan, el botín cuadra con los eventos y nada da botín dos veces', () => {
    fc.assert(
      fc.property(fc.constantFrom(3, 7, 42, 99), secuencia, (semilla, ops) => {
        let e = inicial(semilla)
        const gana = { madera: 0, piedra: 0 }
        const quitadas = new Set<string>()
        for (const o of ops) {
          const antes = e.materiales
          const r = paso(e, o)
          e = r.estado
          expect(e.materiales.madera).toBeGreaterThanOrEqual(antes.madera)
          expect(e.materiales.piedra).toBeGreaterThanOrEqual(antes.piedra)
          for (const ev of r.eventos) {
            if (ev.tipo === 'planton-plantado') quitadas.delete(clave(ev.x, ev.y))
            if (ev.tipo !== 'obstaculo-quitado') continue
            // Una casilla solo da botín otra vez si en medio se replantó un plantón.
            expect(quitadas.has(clave(ev.x, ev.y))).toBe(false)
            quitadas.add(clave(ev.x, ev.y))
            gana.madera += ev.madera
            gana.piedra += ev.piedra
          }
        }
        const inicio = inicial(semilla).materiales
        expect(e.materiales.madera).toBe(inicio.madera + gana.madera)
        expect(e.materiales.piedra).toBe(inicio.piedra + gana.piedra)
      }),
      { numRuns: 40 },
    )
  })

  it('nunca coinciden obstáculo y edificio, ni obstáculo y cultivo o huerto, ni dos obstáculos', () => {
    fc.assert(
      fc.property(fc.constantFrom(3, 7, 42, 99), secuencia, (semilla, ops) => {
        let e = inicial(semilla)
        const lado = ladoValle(e.valle)
        let visto: readonly unknown[] | undefined
        const comprueba = () => {
          // Solo si cambió la lista de obstáculos (los golpes y las zonas no la mueven).
          if (e.obstaculos === visto) return
          visto = e.obstaculos
          const vistas = new Set<number>()
          const ocupadas = casillasOcupadas(e.edificios, lado)
          for (const o of e.obstaculos) {
            const k = o.y * lado + o.x
            expect(o.x >= 0 && o.y >= 0 && o.x < lado && o.y < lado).toBe(true)
            expect(vistas.has(k)).toBe(false)
            vistas.add(k)
            expect(ocupadas.has(k)).toBe(false)
            const z = e.zonas[k]
            expect(z === CARACTER_ZONA.cultivo || z === CARACTER_ZONA.huerto).toBe(false)
          }
        }
        comprueba()
        for (const o of ops) {
          e = paso(e, o).estado
          comprueba()
        }
      }),
      { numRuns: 40 },
    )
  })
})
