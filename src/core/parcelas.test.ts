import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  crearEstadoInicial,
  mapaTransitabilidad,
  parcelaComprable,
  precioParcela,
  type EstadoJuego,
} from './index'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100000 })
const N = base.valle.parcelasPorLado
const comprar = (e: EstadoJuego, indice: number) =>
  aplicarComando(e, { tipo: 'ComprarParcela', indice })
const ok = (e: EstadoJuego, indice: number): EstadoJuego => {
  const r = comprar(e, indice)
  if (!r.ok) throw new Error(`falla ${r.error}`)
  return r.estado
}
const idx = (f: number, c: number) => f * N + c
const centro = idx(2, 2)

describe('ComprarParcela', () => {
  it('la primera compra es libre y aplica todos los efectos', () => {
    const precio = precioParcela(base, centro) as number
    const r = comprar(base, centro)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.eventos).toEqual([{ tipo: 'parcela-comprada', indice: centro, precio }])
    expect(r.estado.dinero).toBe(base.dinero - precio)
    expect(r.estado.comprasHechas).toBe(1)
    expect(r.estado.valle.parcelas[centro]?.estado).toBe('propia')
    expect(r.estado.valle.rio).toBe(base.valle.rio)
    expect(r.estado.valle.parcelas).not.toBe(base.valle.parcelas)
    expect(base.valle.parcelas[centro]?.estado).toBe('en-venta')
    expect(base.comprasHechas).toBe(0)
  })

  it('segunda compra adyacente sí; diagonal y lejana no', () => {
    const e = ok(base, centro)
    for (const v of [idx(1, 2), idx(3, 2), idx(2, 1), idx(2, 3)]) {
      expect(comprar(e, v).ok).toBe(true)
    }
    for (const v of [idx(1, 1), idx(3, 3), idx(1, 3), idx(3, 1), idx(0, 0), idx(2, 4)]) {
      const r = comprar(e, v)
      expect(r).toMatchObject({ ok: false, error: 'no-adyacente' })
      expect(r.estado).toBe(e)
    }
  })

  it('no hay adyacencia cíclica entre bordes', () => {
    const e = ok(base, idx(0, N - 1))
    expect(comprar(e, idx(1, 0))).toMatchObject({ ok: false, error: 'no-adyacente' })
    expect(comprar(e, idx(0, 0))).toMatchObject({ ok: false, error: 'no-adyacente' })
  })

  it('fondos justos sí y quedan 0; uno menos no', () => {
    const precio = precioParcela(base, centro) as number
    const justo = ok({ ...base, dinero: precio }, centro)
    expect(justo.dinero).toBe(0)
    const corto = { ...base, dinero: precio - 1 }
    const r = comprar(corto, centro)
    expect(r).toMatchObject({ ok: false, error: 'fondos-insuficientes' })
    expect(r.estado).toBe(corto)
  })

  it('ya propia', () => {
    const e = ok(base, centro)
    const r = comprar(e, centro)
    expect(r).toMatchObject({ ok: false, error: 'ya-propia' })
    expect(r.estado).toBe(e)
  })

  it('índices inválidos', () => {
    const malos: unknown[] = [
      NaN,
      Infinity,
      -1,
      0.5,
      N * N,
      1e9,
      '3',
      null,
      undefined,
      {},
      [0],
      true,
    ]
    for (const indice of malos) {
      const r = comprar(base, indice as number)
      expect(r).toMatchObject({ ok: false, error: 'parametro-invalido' })
      expect(r.estado).toBe(base)
    }
  })

  it('comprasHechas corrupto da precio-invalido, nunca precio 0', () => {
    for (const comprasHechas of [-1, 1.5, NaN, 1e9]) {
      const e = { ...base, comprasHechas }
      const r = comprar(e, centro)
      expect(r).toMatchObject({ ok: false, error: 'precio-invalido' })
      expect(r.estado).toBe(e)
    }
  })

  it('funciona en Modo Plano y en pausa', () => {
    expect(comprar({ ...base, modo: 'plano' }, centro).ok).toBe(true)
    expect(comprar({ ...base, pausado: true }, centro).ok).toBe(true)
    const r = comprar({ ...base, modo: 'plano', pausado: true }, centro)
    expect(r.ok && r.estado.minutoDelDia).toBe(base.minutoDelDia)
  })

  it('no cambia las casillas transitables ni el movimiento', () => {
    let e = base
    const antes = Array.from(mapaTransitabilidad(e).bloqueada)
    for (const i of [centro, idx(2, 3), idx(3, 3)]) e = ok(e, i)
    expect(Array.from(mapaTransitabilidad(e).bloqueada)).toEqual(antes)
    const mover = (s: EstadoJuego) =>
      aplicarComando(s, { tipo: 'MoverPersonaje', dx: 1, dy: 1, ms: 500 }).estado.personaje
    expect(mover(e)).toEqual(mover({ ...base, dinero: e.dinero }))
  })
})

describe('parcelaComprable', () => {
  it('incluye el precio en no-adyacente y fondos-insuficientes', () => {
    const e = ok(base, centro)
    expect(parcelaComprable(e, idx(0, 0))).toEqual({
      comprable: false,
      motivo: 'no-adyacente',
      precio: precioParcela(e, idx(0, 0)),
    })
    const pobre = parcelaComprable({ ...e, dinero: 0 }, idx(2, 3))
    expect(pobre).toEqual({
      comprable: false,
      motivo: 'fondos-insuficientes',
      precio: precioParcela(e, idx(2, 3)),
    })
  })

  it('prioridad: inválido > ya-propia > precio-invalido > no-adyacente > fondos', () => {
    const e = ok(base, centro)
    expect(parcelaComprable({ ...e, comprasHechas: -1 }, centro)).toMatchObject({
      motivo: 'ya-propia',
    })
    expect(parcelaComprable({ ...e, comprasHechas: -1, dinero: 0 }, idx(0, 0))).toMatchObject({
      motivo: 'precio-invalido',
    })
    expect(parcelaComprable({ ...e, dinero: 0 }, idx(0, 0))).toMatchObject({
      motivo: 'no-adyacente',
    })
    expect(parcelaComprable(e, -1)).toMatchObject({ motivo: 'parametro-invalido' })
  })
})
