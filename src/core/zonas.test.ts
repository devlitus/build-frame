import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  casillasRio,
  crearEstadoInicial,
  ladoValle,
  zonaEn,
  type Comando,
  type EstadoJuego,
} from './index'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100000 })
const C = base.valle.casillasPorParcela
const N = base.valle.parcelasPorLado
const LADO = ladoValle(base.valle)
const agua = new Set(casillasRio(base.valle, base.cauce.ancho).map((k) => k.y * LADO + k.x))

/** Parcela sin río. */
const libre = base.valle.parcelas.findIndex((_, i) => !base.valle.rio.includes(i))
const comprar = (e: EstadoJuego, i: number): EstadoJuego => {
  const r = aplicarComando(e, { tipo: 'ComprarParcela', indice: i })
  if (!r.ok) throw new Error(r.error)
  return r.estado
}
const propia = comprar(base, libre)
const fx = (libre % N) * C
const fy = Math.floor(libre / N) * C
const pintar = (e: EstadoJuego, x0: number, y0: number, x1: number, y1: number, zona = 'cultivo') =>
  aplicarComando(e, { tipo: 'PintarZona', x0, y0, x1, y1, zona } as Comando)
const borrar = (e: EstadoJuego, x0: number, y0: number, x1: number, y1: number) =>
  aplicarComando(e, { tipo: 'BorrarZona', x0, y0, x1, y1 })
const cuenta = (e: EstadoJuego) => [...e.zonas].filter((c) => c !== '.').length

describe('zonas', () => {
  it('estado inicial vacío, de lado*lado, y formato v8', () => {
    expect(base.zonas).toBe('.'.repeat(LADO * LADO))
    expect(base.versionFormato).toBe(10)
  })

  it('pinta en parcela propia, esquinas en cualquier orden', () => {
    const r = pintar(propia, fx + 2, fy + 2, fx, fy)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.eventos).toEqual([{ tipo: 'zonas-cambiadas', casillas: 9 }])
    expect(zonaEn(r.estado, fx + 1, fy + 1)).toBe('cultivo')
    expect(zonaEn(r.estado, fx + 3, fy)).toBeUndefined()
    expect(cuenta(r.estado)).toBe(9)
    expect(propia.zonas).toBe(base.zonas)
  })

  it('rechaza parcelas ajenas', () => {
    const r = pintar(base, fx, fy, fx + 2, fy + 2)
    expect(r).toMatchObject({ ok: false, error: 'sin-casillas-validas' })
    expect(r.estado).toBe(base)
  })

  it('ignora agua y vados', () => {
    const pr = base.valle.rio[0] as number
    const e = comprar(base, pr)
    const x0 = (pr % N) * C
    const y0 = Math.floor(pr / N) * C
    const r = pintar(e, x0, y0, x0 + C - 1, y0 + C - 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (let y = y0; y < y0 + C; y++)
      for (let x = x0; x < x0 + C; x++) {
        if (agua.has(y * LADO + x)) expect(zonaEn(r.estado, x, y)).toBeUndefined()
        else expect(zonaEn(r.estado, x, y)).toBe('cultivo')
      }
    for (const v of base.cauce.vados) {
      expect(agua.has(v)).toBe(true)
      expect(r.estado.zonas[v]).toBe('.')
    }
  })

  it('pinta bajo árboles y rocas', () => {
    const o = base.obstaculos.find((b) => !agua.has(b.y * LADO + b.x))
    expect(o).toBeDefined()
    if (!o) return
    const i = Math.floor(o.y / C) * N + Math.floor(o.x / C)
    const e = comprar(base, i)
    const r = pintar(e, o.x, o.y, o.x, o.y, 'huerto')
    expect(r.ok).toBe(true)
    if (r.ok) expect(zonaEn(r.estado, o.x, o.y)).toBe('huerto')
  })

  it('recorta al valle y rechaza si todo queda fuera', () => {
    const e = comprar(base, libre === 0 ? 1 : 0)
    const x = (e.valle.parcelas.findIndex((p) => p.estado === 'propia') % N) * C
    expect(pintar(e, x - 500, -500, x + 1, 1000).ok).toBe(true)
    expect(pintar(e, -50, -50, -10, -10)).toMatchObject({
      ok: false,
      error: 'sin-casillas-validas',
    })
    expect(pintar(e, LADO + 5, 0, LADO + 9, 3)).toMatchObject({ ok: false })
  })

  it('repintar otra zona sustituye; mismo objeto si no cambia nada', () => {
    const a = pintar(propia, fx, fy, fx + 1, fy + 1)
    if (!a.ok) throw new Error('a')
    const b = pintar(a.estado, fx, fy, fx + 1, fy + 1, 'vivienda')
    expect(b.ok && zonaEn(b.estado, fx, fy)).toBe('vivienda')
    const c = pintar(a.estado, fx, fy, fx + 1, fy + 1)
    expect(c).toMatchObject({ ok: true, eventos: [] })
    expect(c.estado).toBe(a.estado)
    const d = pintar(a.estado, fx, fy, fx + 2, fy)
    expect(d.ok && d.eventos).toEqual([{ tipo: 'zonas-cambiadas', casillas: 1 }])
  })

  it('borra; mismo objeto si no hay nada que borrar', () => {
    const a = pintar(propia, fx, fy, fx + 3, fy + 3)
    if (!a.ok) throw new Error('a')
    const r = borrar(a.estado, fx + 1, fy + 1, fx + 2, fy + 2)
    expect(r.ok && cuenta(r.estado)).toBe(12)
    expect(r.ok && zonaEn(r.estado, fx + 1, fy + 1)).toBeUndefined()
    const v = borrar(propia, fx, fy, fx + 1, fy + 1)
    expect(v).toMatchObject({ ok: true, eventos: [] })
    expect(v.estado).toBe(propia)
    expect(borrar(base, fx, fy, fx + 1, fy + 1)).toMatchObject({
      ok: false,
      error: 'sin-casillas-validas',
    })
  })

  it('parámetros inválidos', () => {
    const malos = [NaN, 1.5, Infinity, '3', undefined] as unknown as number[]
    for (const v of malos) {
      expect(pintar(propia, v, 0, 1, 1)).toMatchObject({ ok: false, error: 'parametro-invalido' })
      expect(borrar(propia, 0, 0, 1, v)).toMatchObject({ ok: false, error: 'parametro-invalido' })
    }
    expect(pintar(propia, fx, fy, fx, fy, 'castillo')).toMatchObject({
      ok: false,
      error: 'parametro-invalido',
    })
  })

  it('no toca el resto del estado, ni con el tiempo pausado ni en Modo Plano', () => {
    const variantes: EstadoJuego[] = [
      propia,
      { ...propia, pausado: true },
      { ...propia, modo: 'plano' },
    ]
    for (const e0 of variantes) {
      const r = pintar(e0, fx, fy, fx + 2, fy + 2, 'almacen')
      if (!r.ok) throw new Error('r')
      expect({ ...r.estado, zonas: '' }).toEqual({ ...e0, zonas: '' })
      expect(r.estado.valle).toBe(e0.valle)
      expect(r.estado.personaje).toBe(e0.personaje)
    }
  })

  it('JSON ida y vuelta', () => {
    const a = pintar(propia, fx, fy, fx + 4, fy + 4, 'huerto')
    if (!a.ok) throw new Error('a')
    expect(JSON.parse(JSON.stringify(a.estado))).toEqual(a.estado)
  })
})
