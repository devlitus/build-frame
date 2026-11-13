/* eslint-disable @typescript-eslint/no-non-null-assertion -- datos conocidos en tests */
import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  crearEstadoInicial,
  despiertaEnCasa,
  type EstadoJuego,
} from '../../src/core'
import { limitarEje, limitarVista } from '../../src/game/camara/matematica'
import { calcularSilueta, casillaInicialSilueta } from '../../src/game/construir'
import { unirFrases } from '../../src/ui/Aviso'

describe('límites de cámara con márgenes (Modo Plano)', () => {
  it('sin márgenes, el comportamiento es el de siempre', () => {
    expect(limitarEje(5000, 720, 0.6, 3072)).toBe(3072 - 720 / 0.6 / 2)
    expect(limitarEje(-5, 720, 0.6, 3072)).toBe(720 / 0.6 / 2)
  })

  it('con márgenes se puede centrar cualquier casilla del valle', () => {
    expect(limitarEje(5000, 720, 0.6, 3072, undefined, 72, 72)).toBe(3072)
    expect(limitarEje(-5000, 720, 0.6, 3072, undefined, 72, 72)).toBe(0)
  })

  it('sin márgenes el centro no pasa del límite normal aunque haya extensión de otro eje', () => {
    const v = limitarVista({ zoom: 0.6, cx: 99999, cy: 99999 }, { ancho: 412, alto: 839 }, 3072)
    expect(v.cy).toBeCloseTo(3072 - 839 / 0.6 / 2, 6)
  })

  it('si el valle cabe en el eje sigue centrado', () => {
    expect(limitarEje(10, 4000, 1, 3072, undefined, 72, 72)).toBe(1536)
  })
})

describe('unirFrases', () => {
  it('añade punto a lo que no acaba en puntuación y no duplica', () => {
    expect(
      unirFrases(['Te quedaste dormido… Despiertas en casa', 'Obra terminada: Cobertizo']),
    ).toBe('Te quedaste dormido… Despiertas en casa. Obra terminada: Cobertizo.')
    expect(unirFrases(['¡Parcela comprada!', 'Hecho.'])).toBe('¡Parcela comprada! Hecho.')
    expect(unirFrases(['a', '', ' b '])).toBe('a. b.')
  })
})

describe('despiertaEnCasa', () => {
  const base = crearEstadoInicial({ semilla: 42 })
  it('sin casa terminada, no', () => {
    expect(despiertaEnCasa(base)).toBe(false)
  })
  it('con casa terminada, sí', () => {
    const e: EstadoJuego = {
      ...base,
      obstaculos: [],
      edificios: [
        {
          id: 1,
          tipo: 'casa',
          x: 34,
          y: 82,
          obra: null,
          pagado: { dinero: 0, madera: 0, piedra: 0 },
        } as never,
      ],
      siguienteIdEdificio: 2,
    }
    expect(despiertaEnCasa(e)).toBe(true)
  })
})

describe('casillaInicialSilueta', () => {
  const inicial = crearEstadoInicial({ semilla: 42 })
  const C = inicial.valle.casillasPorParcela
  const N = inicial.valle.parcelasPorLado
  const compra = (e: EstadoJuego, i: number): EstadoJuego => {
    const r = aplicarComando({ ...e, dinero: 100000 }, { tipo: 'ComprarParcela', indice: i })
    if (!r.ok) throw new Error(r.error)
    return r.estado
  }
  const pa = Math.floor(inicial.aparicion.y / C) * N + Math.floor(inicial.aparicion.x / C)
  const base = compra(inicial, pa)
  const fila = Math.floor(pa / N)
  const col = pa % N

  it('en tierra ajena, la silueta nace en la parcela propia más cercana', () => {
    const lejos = { x: col * C + 8, y: Math.max(0, fila * C - 20) }
    const c = casillaInicialSilueta(base, 'caja-envio', lejos)
    const s = calcularSilueta(base, 'caja-envio', c)!
    expect(s.resultado.valida || s.resultado.motivo !== 'no-propia').toBe(true)
    expect(Math.floor(s.y / C)).toBe(fila)
    expect(Math.floor(s.x / C)).toBe(col)
  })

  it('si ya cae en tierra propia se queda donde estaba', () => {
    const p = { x: col * C + 8, y: fila * C + 8 }
    expect(casillaInicialSilueta(base, 'caja-envio', p)).toEqual(p)
  })

  it('sin parcelas propias devuelve la preferida', () => {
    expect(casillaInicialSilueta(inicial, 'caja-envio', { x: 5, y: 5 })).toEqual({ x: 5, y: 5 })
  })
})
