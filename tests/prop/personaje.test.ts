import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  casillaBloqueada,
  casillasRio,
  claveCasilla,
  CONFIG_PERSONAJE,
  crearEstadoInicial,
  ladoValle,
  mapaTransitabilidad,
  type Comando,
  type EstadoJuego,
} from '../../src/core'

const semilla = fc.integer({ min: 0, max: 2 ** 32 - 1 })
const eje = fc.oneof(fc.constantFrom(-1, 0, 1), fc.double({ min: -1, max: 1, noNaN: true }))
const comando: fc.Arbitrary<Comando> = fc.oneof(
  {
    weight: 8,
    arbitrary: fc.record({
      tipo: fc.constant('MoverPersonaje' as const),
      dx: eje,
      dy: eje,
      ms: fc.integer({ min: 0, max: 600 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      tipo: fc.constant('AvanzarTiempo' as const),
      minutos: fc.integer({ min: 0, max: 1440 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom({ tipo: 'Pausar' as const }, { tipo: 'Reanudar' as const }),
  },
)

function cajaLibre(e: EstadoJuego): boolean {
  const mapa = mapaTransitabilidad(e)
  const m = CONFIG_PERSONAJE.tamanoCaja / 2
  const { x, y } = e.personaje
  for (let cy = Math.floor(y - m); cy <= Math.ceil(y + m) - 1; cy++) {
    for (let cx = Math.floor(x - m); cx <= Math.ceil(x + m) - 1; cx++) {
      if (casillaBloqueada(mapa, cx, cy)) return false
    }
  }
  return true
}

describe('personaje (propiedades)', () => {
  it('ninguna secuencia de comandos deja al personaje en una casilla bloqueada', () => {
    fc.assert(
      fc.property(semilla, fc.array(comando, { maxLength: 60 }), (s, comandos) => {
        let e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
        expect(cajaLibre(e)).toBe(true)
        for (const c of comandos) {
          e = aplicarComando(e, c).estado
          expect(cajaLibre(e)).toBe(true)
        }
      }),
      { numRuns: 60 },
    )
  })

  it('moverse a lo largo de muchos pulsos no cruza el río fuera de los vados ni sale del valle', () => {
    fc.assert(
      fc.property(
        semilla,
        fc.array(fc.record({ dx: eje, dy: eje }), { minLength: 20, maxLength: 80 }),
        (s, dirs) => {
          let e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
          const lado = ladoValle(e.valle)
          const rio = new Set(casillasRio(e.valle).map((c) => claveCasilla(lado, c.x, c.y)))
          const vados = new Set(e.cauce.vados)
          for (const d of dirs) {
            for (let i = 0; i < 5; i++) {
              e = aplicarComando(e, { tipo: 'MoverPersonaje', ...d, ms: 250 }).estado
            }
            const k = claveCasilla(lado, Math.floor(e.personaje.x), Math.floor(e.personaje.y))
            expect(e.personaje.x).toBeGreaterThan(0)
            expect(e.personaje.x).toBeLessThan(lado)
            expect(e.personaje.y).toBeGreaterThan(0)
            expect(e.personaje.y).toBeLessThan(lado)
            expect(!rio.has(k) || vados.has(k)).toBe(true)
          }
        },
      ),
      { numRuns: 30 },
    )
  })
})

describe('conectividad del valle', () => {
  it('todas las casillas transitables son alcanzables desde la aparición', () => {
    fc.assert(
      fc.property(semilla, (s) => {
        const e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
        const lado = ladoValle(e.valle)
        // Cálculo independiente del mapa: libre = no es río (salvo vado) ni obstáculo.
        const libre = new Uint8Array(lado * lado).fill(1)
        for (const c of casillasRio(e.valle)) libre[claveCasilla(lado, c.x, c.y)] = 0
        for (const k of e.cauce.vados) libre[k] = 1
        for (const o of e.obstaculos) libre[claveCasilla(lado, o.x, o.y)] = 0
        const inicio = claveCasilla(lado, Math.floor(e.aparicion.x), Math.floor(e.aparicion.y))
        expect(libre[inicio]).toBe(1)
        const visto = new Uint8Array(lado * lado)
        const pila = [inicio]
        visto[inicio] = 1
        for (let i = pila.pop(); i !== undefined; i = pila.pop()) {
          const x = i % lado
          const y = (i - x) / lado
          for (const [vx, vy] of [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ] as const) {
            if (vx < 0 || vy < 0 || vx >= lado || vy >= lado) continue
            const k = vy * lado + vx
            if (libre[k] === 1 && visto[k] === 0) {
              visto[k] = 1
              pila.push(k)
            }
          }
        }
        const mapa = mapaTransitabilidad(e)
        for (let k = 0; k < lado * lado; k++) {
          // Toda casilla libre es alcanzable (y por tanto transitable en el mapa).
          expect(visto[k]).toBe(libre[k])
          expect(mapa.bloqueada[k]).toBe(libre[k] === 1 ? 0 : 1)
        }
      }),
      { numRuns: 80 },
    )
  }, 30_000)
})

describe('determinismo del movimiento', () => {
  it('mismo estado y mismos comandos de movimiento dan el mismo personaje', () => {
    fc.assert(
      fc.property(semilla, fc.array(comando, { maxLength: 40 }), (s, comandos) => {
        const correr = () =>
          comandos.reduce(
            (e, c) => aplicarComando(e, c).estado,
            crearEstadoInicial({ semilla: s, dineroInicial: 0 }),
          )
        expect(correr().personaje).toEqual(correr().personaje)
      }),
      { numRuns: 40 },
    )
  })
})
