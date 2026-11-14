import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  aplicarComandos,
  comprobarDormir,
  costeEnergia,
  crearEstadoInicial,
  ENERGIA_MAXIMA,
  HERRAMIENTAS,
  ladoValle,
  type Comando,
  type EstadoJuego,
} from '../../src/core'
import { conTierraLabrable } from '../unit/fixtures/labranza'

const inicial = crearEstadoInicial({ semilla: 7 })
const labrable = conTierraLabrable(
  { ...crearEstadoInicial({ semilla: 42 }), personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
  50,
  50,
)

const comando: fc.Arbitrary<Comando> = fc.oneof(
  fc.record({
    tipo: fc.constant('UsarHerramienta' as const),
    x: fc.integer({ min: -1, max: 1 }),
    y: fc.integer({ min: -1, max: 1 }),
  }),
  fc.constant({ tipo: 'Dormir' as const }),
  fc.record({
    tipo: fc.constant('AvanzarTiempo' as const),
    minutos: fc.integer({ min: 0, max: 2000 }),
  }),
  fc.record({
    tipo: fc.constant('ElegirHerramienta' as const),
    herramienta: fc.constantFrom(...HERRAMIENTAS),
  }),
  fc.record({
    tipo: fc.constant('MoverPersonaje' as const),
    dx: fc.integer({ min: -1, max: 1 }),
    dy: fc.integer({ min: -1, max: 1 }),
    ms: fc.integer({ min: 0, max: 250 }),
  }),
  fc.record({
    tipo: fc.constant('CambiarModo' as const),
    modo: fc.constantFrom('vida' as const, 'plano' as const),
  }),
)

const secuencia = fc.array(comando, { maxLength: 80 })

/** Los usos de herramienta se dan sobre casillas pegadas al personaje (x e y son desplazamientos). */
function apunta(e: EstadoJuego, c: Comando): Comando {
  return c.tipo === 'UsarHerramienta'
    ? { ...c, x: Math.floor(e.personaje.x) + c.x, y: Math.floor(e.personaje.y) + c.y }
    : c
}

function correr(cs: readonly Comando[]): { estado: EstadoJuego; comando: Comando }[] {
  const pasos: { estado: EstadoJuego; comando: Comando }[] = []
  let e = inicial
  for (const c of cs) {
    pasos.push({ estado: e, comando: apunta(e, c) })
    e = aplicarComando(e, apunta(e, c)).estado
  }
  pasos.push({ estado: e, comando: { tipo: 'Pausar' } })
  return pasos
}

describe('propiedades de la energía', () => {
  it('la energía nunca sale de [0, máximo] y es entera', () => {
    fc.assert(
      fc.property(secuencia, (cs) => {
        for (const { estado } of correr(cs)) {
          expect(Number.isInteger(estado.energia)).toBe(true)
          expect(estado.energia).toBeGreaterThanOrEqual(0)
          expect(estado.energia).toBeLessThanOrEqual(ENERGIA_MAXIMA)
        }
      }),
    )
  })

  it('dormir, si se acepta, siempre deja la energía al máximo a las 06:00 del día siguiente', () => {
    fc.assert(
      fc.property(secuencia, fc.integer({ min: 0, max: ENERGIA_MAXIMA }), (cs, energia) => {
        for (const { estado } of correr(cs)) {
          const e = { ...estado, energia }
          const r = aplicarComando(e, { tipo: 'Dormir' })
          if (comprobarDormir(e) !== undefined) {
            expect(r.ok).toBe(false)
            expect(r.estado).toBe(e)
            continue
          }
          expect(r.ok).toBe(true)
          expect(r.estado.energia).toBe(ENERGIA_MAXIMA)
          expect(r.estado.dia).toBe(e.dia + 1)
          expect(r.estado.minutoDelDia).toBe(360)
        }
      }),
    )
  })

  it('cualquier comando rechazado (herramientas incluidas) devuelve el mismo estado (misma referencia)', () => {
    fc.assert(
      fc.property(secuencia, (cs) => {
        for (const { estado, comando: c } of correr(cs)) {
          const r = aplicarComando(estado, c)
          if (!r.ok) expect(r.estado).toBe(estado)
        }
      }),
    )
  })

  it('un uso aceptado gasta exactamente su coste; uno rechazado por falta de energía no gasta nada', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HERRAMIENTAS),
        fc.integer({ min: 0, max: ENERGIA_MAXIMA }),
        (herramienta, energia) => {
          // Casilla del personaje lista para arar (y ya arada si se va a sembrar).
          const x = Math.floor(labrable.personaje.x)
          const y = Math.floor(labrable.personaje.y)
          const i = y * ladoValle(labrable.valle) + x
          const tierra =
            herramienta === 'semillas'
              ? labrable.tierra.slice(0, i) + 'a' + labrable.tierra.slice(i + 1)
              : labrable.tierra
          const e: EstadoJuego = {
            ...labrable,
            tierra,
            herramienta,
            energia,
            semillaElegida: 'semilla-patata',
          }
          const r = aplicarComando(e, { tipo: 'UsarHerramienta', x, y })
          if (r.ok) {
            expect(energia).toBeGreaterThanOrEqual(costeEnergia(herramienta))
            expect(r.estado.energia).toBe(energia - costeEnergia(herramienta))
          } else {
            // Con la casilla labrable, el único rechazo posible es la falta de energía.
            expect(r.estado).toBe(e)
            expect(r.error).toBe('sin-energia')
            expect(energia).toBeLessThan(costeEnergia(herramienta))
          }
        },
      ),
    )
  })

  it('las secuencias de usar, dormir, avanzar y desmayarse son deterministas', () => {
    fc.assert(
      fc.property(secuencia, (cs) => {
        const a = correr(cs)
        const b = correr(cs)
        expect(b).toEqual(a)
        const final = aplicarComandos(
          inicial,
          a.slice(0, -1).map((p) => p.comando),
        )
        expect(final).toEqual(a[a.length - 1]?.estado)
      }),
    )
  })
})
