/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de índices y catálogo conocidos en tests */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  casillaBloqueada,
  crearEstadoInicial,
  defEdificio,
  ladoValle,
  mapaTransitabilidad,
  type Edificio,
  type EstadoJuego,
  type Obstaculo,
  type TipoEdificio,
} from '../../src/core'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 1000 })
const LADO = ladoValle(base.valle)
const TIPOS: TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']

const arbEscenario = fc.record({
  dia: fc.integer({ min: 1, max: 50 }),
  minuto: fc.integer({ min: 360, max: 1560 }),
  avance: fc.integer({ min: 0, max: 5000 }),
  edificios: fc.array(
    fc.record({
      tipo: fc.constantFrom(...TIPOS),
      x: fc.integer({ min: 0, max: LADO - 1 }),
      y: fc.integer({ min: 0, max: LADO - 1 }),
      inicio: fc.integer({ min: 0, max: 60 }),
      dias: fc.integer({ min: 1, max: 10 }),
      terminado: fc.boolean(),
    }),
    { maxLength: 6 },
  ),
  arboles: fc.array(
    fc.record({
      x: fc.integer({ min: 0, max: LADO - 1 }),
      y: fc.integer({ min: 0, max: LADO - 1 }),
    }),
    { maxLength: 30 },
  ),
})

function construir(s: {
  dia: number
  minuto: number
  edificios: {
    tipo: TipoEdificio
    x: number
    y: number
    inicio: number
    dias: number
    terminado: boolean
  }[]
  arboles: { x: number; y: number }[]
}): EstadoJuego {
  const edificios: Edificio[] = s.edificios.map((b, i) => ({
    id: i + 1,
    tipo: b.tipo,
    x: b.x,
    y: b.y,
    obra: b.terminado ? null : { diaInicio: b.inicio, diaFin: b.inicio + b.dias },
  }))
  const obstaculos: Obstaculo[] = s.arboles.map((a) => ({ tipo: 'arbol', ...a, variante: 0 }))
  return { ...base, dia: s.dia, minutoDelDia: s.minuto, edificios, obstaculos }
}

describe('obras: propiedades', () => {
  it('tras un cambio de día no sobrevive ninguna obra con dia >= diaFin, ninguna terminada vuelve a obra y no cambia el número de edificios', () => {
    fc.assert(
      fc.property(arbEscenario, (s) => {
        const e = construir(s)
        const r = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: s.avance })
        expect(r.ok).toBe(true)
        expect(r.estado.edificios).toHaveLength(e.edificios.length)
        for (const [i, b] of r.estado.edificios.entries()) {
          const antes = e.edificios[i]!
          if (r.estado.dia > e.dia && b.obra) expect(b.obra.diaFin).toBeGreaterThan(r.estado.dia)
          if (antes.obra === null) expect(b.obra).toBeNull()
          expect({ ...b, obra: 0 }).toEqual({ ...antes, obra: 0 })
        }
        if (r.estado.dia > e.dia && r.ok) {
          const terminadas = e.edificios.filter(
            (b) => b.obra && b.obra.diaFin <= r.estado.dia,
          ).length
          expect(r.eventos.filter((v) => v.tipo === 'obra-terminada')).toHaveLength(terminadas)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('el personaje tras el desmayo nunca está en casilla bloqueada (o está en la aparición)', () => {
    fc.assert(
      fc.property(arbEscenario, (s) => {
        const e = construir({ ...s, minuto: 1560 })
        const r = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: 1 })
        const p = r.estado.personaje
        expect(p.orientacion).toBe('sur')
        const m = mapaTransitabilidad(r.estado)
        const enAparicion = p.x === e.aparicion.x && p.y === e.aparicion.y
        if (!enAparicion) {
          // Centrado en la casilla y sin tocar nada bloqueado con la caja de colisión.
          expect(p.x - Math.floor(p.x)).toBe(0.5)
          expect(p.y - Math.floor(p.y)).toBe(0.5)
          expect(casillaBloqueada(m, Math.floor(p.x), Math.floor(p.y))).toBe(false)
        }
        // Con casa terminada y aparición libre, nunca queda dentro de un edificio.
        for (const b of r.estado.edificios) {
          const d = defEdificio(b.tipo)!
          const dentro = p.x > b.x && p.x < b.x + d.ancho && p.y > b.y && p.y < b.y + d.alto
          if (!enAparicion) expect(dentro).toBe(false)
        }
      }),
      { numRuns: 200 },
    )
  })
})
