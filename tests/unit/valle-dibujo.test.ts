import { describe, expect, it } from 'vitest'
import { casillasRio, claveCasilla, crearEstadoInicial, decorarValle } from '../../src/core'
import { conPropiasDeDepuracion, marcarPropias } from '../../src/game/valle/debug'
import { estiloParcela } from '../../src/game/valle/estilo'
import { leerParametros } from '../../src/game/parametros'

const SEMILLAS = [0, 1, 42, 123, 999, 31337, 4294967295, 77, 2024, 8]

describe('estilo por estado de parcela', () => {
  it('distingue tinte y borde entre en-venta y propia', () => {
    const venta = estiloParcela('en-venta')
    const propia = estiloParcela('propia')
    expect(venta.tinte).not.toBe(propia.tinte)
    expect(venta.borde).not.toBe(propia.borde)
    expect(propia.grosorBorde).toBeGreaterThan(venta.grosorBorde)
  })
})

describe('cauce del río', () => {
  it.each(SEMILLAS)('es una banda continua de borde a borde (semilla %i)', (semilla) => {
    const { valle } = crearEstadoInicial({ semilla, dineroInicial: 0 })
    const casillas = casillasRio(valle)
    const lado = valle.parcelasPorLado * valle.casillasPorParcela
    const claves = new Set(casillas.map((c) => claveCasilla(lado, c.x, c.y)))
    expect(claves.size).toBe(casillas.length)

    // Conexión 4-conexa de todas las casillas desde la primera.
    const visto = new Set<number>()
    const pila = casillas.slice(0, 1)
    for (const q of pila) visto.add(claveCasilla(lado, q.x, q.y))
    for (let q = pila.pop(); q; q = pila.pop()) {
      const { x, y } = q
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const k = claveCasilla(lado, x + dx, y + dy)
        if (x + dx < 0 || y + dy < 0 || x + dx >= lado || y + dy >= lado) continue
        if (claves.has(k) && !visto.has(k)) {
          visto.add(k)
          pila.push({ x: x + dx, y: y + dy })
        }
      }
    }
    expect(visto.size).toBe(claves.size)

    // Toca dos bordes opuestos del valle.
    const toca = (f: (c: { x: number; y: number }) => boolean) => casillas.some(f)
    const vertical = toca((c) => c.y === 0) && toca((c) => c.y === lado - 1)
    const horizontal = toca((c) => c.x === 0) && toca((c) => c.x === lado - 1)
    expect(vertical || horizontal).toBe(true)

    // Cada parcela del cauce tiene casillas de río y ninguna otra parcela las tiene.
    const c = valle.casillasPorParcela
    const parcelasConRio = new Set(
      casillas.map((q) => Math.floor(q.y / c) * valle.parcelasPorLado + Math.floor(q.x / c)),
    )
    expect(parcelasConRio).toEqual(new Set(valle.rio))
  })
})

describe('decoración', () => {
  const { valle } = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
  const rio = casillasRio(valle)
  const lado = valle.parcelasPorLado * valle.casillasPorParcela
  const claves = new Set(rio.map((c) => claveCasilla(lado, c.x, c.y)))

  it('es determinista', () => {
    expect(decorarValle(valle, 42, claves)).toEqual(decorarValle(valle, 42, claves))
  })

  it('cambia con la semilla y hay árboles y rocas', () => {
    const a = decorarValle(valle, 42, claves)
    expect(a).not.toEqual(decorarValle(valle, 43, claves))
    expect(a.some((d) => d.tipo === 'arbol')).toBe(true)
    expect(a.some((d) => d.tipo === 'roca')).toBe(true)
  })

  it('no coloca nada sobre el río y queda dentro de su parcela', () => {
    for (const d of decorarValle(valle, 42, claves)) {
      expect(claves.has(claveCasilla(lado, d.x, d.y))).toBe(false)
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.x).toBeLessThan(lado)
      expect(d.variante).toBeGreaterThanOrEqual(0)
      expect(d.variante).toBeLessThan(1)
    }
  })

  it('el bosque tiene más árboles que el prado', () => {
    const contar = (terreno: string) => {
      const idx = new Set(valle.parcelas.flatMap((p, i) => (p.terreno === terreno ? [i] : [])))
      const c = valle.casillasPorParcela
      const n = valle.parcelasPorLado
      const deco = decorarValle(valle, 42, claves).filter(
        (d) => d.tipo === 'arbol' && idx.has(Math.floor(d.y / c) * n + Math.floor(d.x / c)),
      )
      return idx.size ? deco.length / idx.size : 0
    }
    expect(contar('bosque')).toBeGreaterThan(contar('prado'))
  })
})

describe('marcarPropias', () => {
  const { valle } = crearEstadoInicial({ semilla: 5, dineroInicial: 0 })
  it('marca solo los índices válidos y no muta el original', () => {
    const copia = marcarPropias(valle, [0, 7, 9999])
    expect(copia.parcelas.filter((p) => p.estado === 'propia')).toHaveLength(2)
    expect(copia.parcelas[7]?.estado).toBe('propia')
    expect(valle.parcelas.every((p) => p.estado === 'en-venta')).toBe(true)
  })
})

describe('conPropiasDeDepuracion', () => {
  const base = crearEstadoInicial({ semilla: 5, dineroInicial: 0 })
  it('marca las propias y ajusta comprasHechas sin mutar el original', () => {
    const e = conPropiasDeDepuracion(base, [14, 15, 9999])
    expect(e.valle.parcelas[14]?.estado).toBe('propia')
    expect(e.valle.parcelas[15]?.estado).toBe('propia')
    expect(e.comprasHechas).toBe(e.valle.parcelas.filter((p) => p.estado === 'propia').length)
    expect(base.valle.parcelas[14]?.estado).toBe('en-venta')
    expect(e.personaje).toBe(base.personaje)
  })
})

describe('leerParametros', () => {
  it('sin parámetros', () => {
    expect(leerParametros('')).toEqual({ debug: false, propias: [] })
  })
  it('semilla, debug y propias', () => {
    expect(leerParametros('?semilla=42&debug&propias=0,1,7')).toEqual({
      semilla: 42,
      debug: true,
      propias: [0, 1, 7],
    })
  })
  it('propias exige debug', () => {
    expect(leerParametros('?propias=0,1').propias).toEqual([])
  })
  it('ignora valores inválidos y repetidos', () => {
    const p = leerParametros('?semilla=abc&debug&propias=1,x,-2,1,,3')
    expect(p.semilla).toBeUndefined()
    expect(p.propias).toEqual([1, 3])
  })
  it('la semilla admite hasta 2^32-1 y lo mayor se ignora', () => {
    expect(leerParametros('?semilla=4294967295').semilla).toBe(4294967295)
    expect(leerParametros('?semilla=4294967296').semilla).toBeUndefined()
  })
})
