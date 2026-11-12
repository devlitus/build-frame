import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import datos from '../../data/economia.json'
import { EsquemaConfigEconomia } from './datos/esquemas'
import { CONFIG_ECONOMIA } from './datos/economia'
import { crearEstadoInicial } from './estado'
import { precioParcela } from './economia'
import {
  AGUAS,
  FERTILIDADES,
  TERRENOS,
  type Agua,
  type Fertilidad,
  type Parcela,
  type Terreno,
} from './valle'

type Datos = {
  [k: string]: number | Record<string, number> | undefined
  factorTerreno: Record<string, number>
  factorFertilidad: Record<string, number>
  factorAgua: Record<string, number>
}
const clonar = () => structuredClone(datos) as unknown as Datos
const valido = (o: unknown) => v.safeParse(EsquemaConfigEconomia, o).success

/** Estado mínimo con una única parcela de atributos dados. */
function conParcela(terreno: Terreno, fertilidad: Fertilidad, agua: Agua, comprasHechas = 0) {
  const base = crearEstadoInicial({ semilla: 1 })
  const parcela: Parcela = { ...(base.valle.parcelas[0] as Parcela), terreno, fertilidad, agua }
  return { valle: { ...base.valle, parcelas: [parcela] }, comprasHechas }
}
const precio = (t: Terreno, f: Fertilidad, a: Agua, n = 0): number =>
  precioParcela(conParcela(t, f, a, n), 0) ?? Number.NaN

describe('datos de economía', () => {
  it('los datos reales son válidos', () => {
    expect(valido(datos)).toBe(true)
    expect(CONFIG_ECONOMIA.dineroInicial).toBe(datos.dineroInicial)
  })

  it('rechaza ejemplos inválidos', () => {
    const malos: Array<(o: Datos) => void> = [
      (o) => (o.dineroInicial = -1),
      (o) => (o.dineroInicial = 10.5),
      (o) => (o.precioBase = 0),
      (o) => (o.subidaPorCompra = -0.1),
      (o) => (o.factorTerreno.prado = 0),
      (o) => (o.factorFertilidad.alta = -1),
      (o) => (o.factorAgua.rio = 0),
      (o) => delete o.factorTerreno.rocoso,
      (o) => delete o.factorFertilidad.media,
      (o) => delete o.factorAgua.seca,
      (o) => delete o.subidaPorCompra,
      (o) => (o.extra = 1),
    ]
    for (const mutar of malos) {
      const o = clonar()
      mutar(o)
      expect(valido(o)).toBe(false)
    }
  })
})

describe('partida nueva', () => {
  it('empieza con los ahorros de los datos y sin compras', () => {
    const e = crearEstadoInicial({ semilla: 3 })
    expect(e.dinero).toBe(CONFIG_ECONOMIA.dineroInicial)
    expect(e.comprasHechas).toBe(0)
  })
  it('permite fijar los ahorros', () => {
    expect(crearEstadoInicial({ semilla: 3, dineroInicial: 7 }).dinero).toBe(7)
  })
})

describe('precioParcela', () => {
  it('es positivo, entero y múltiplo de 10 para toda combinación y compras', () => {
    for (const t of TERRENOS)
      for (const f of FERTILIDADES)
        for (const a of AGUAS)
          for (let n = 0; n < 12; n++) {
            const p = precio(t, f, a, n)
            expect(p).toBeGreaterThan(0)
            expect(Number.isInteger(p)).toBe(true)
            expect(p % 10).toBe(0)
          }
  })

  it('crece estrictamente con las compras hechas', () => {
    for (const t of TERRENOS)
      for (const f of FERTILIDADES)
        for (const a of AGUAS)
          for (let n = 0; n < 8; n++)
            expect(precio(t, f, a, n + 1)).toBeGreaterThan(precio(t, f, a, n))
  })

  it('respeta el orden de los factores', () => {
    expect(precio('prado', 'alta', 'rio')).toBeGreaterThan(precio('rocoso', 'baja', 'seca'))
    expect(precio('prado', 'media', 'seca')).toBeGreaterThan(precio('rocoso', 'media', 'seca'))
    expect(precio('prado', 'alta', 'pozo')).toBeGreaterThan(precio('prado', 'baja', 'pozo'))
    expect(precio('bosque', 'media', 'rio')).toBeGreaterThan(precio('bosque', 'media', 'seca'))
  })

  it('devuelve undefined con un índice inválido', () => {
    const e = crearEstadoInicial({ semilla: 1 })
    for (const i of [-1, e.valle.parcelas.length, 1.5, NaN, Infinity])
      expect(precioParcela(e, i)).toBeUndefined()
  })

  it('se mantiene un mínimo de 10 con factores minúsculos', () => {
    const cfg = { ...CONFIG_ECONOMIA, precioBase: 1 }
    expect(precioParcela(crearEstadoInicial({ semilla: 1 }), 0, cfg)).toBe(10)
  })
})

describe('balance con los valores reales (GDD §6.2)', () => {
  const todos = TERRENOS.flatMap((t) =>
    FERTILIDADES.flatMap((f) => AGUAS.map((a) => [t, f, a] as const)),
  )
  const primeros = todos.map(([t, f, a]) => precio(t, f, a, 0))
  const masCara = Math.max(...primeros)
  const masBarata = Math.min(...primeros)

  it('la más barata se puede comprar con los ahorros', () => {
    expect(masBarata).toBeLessThanOrEqual(CONFIG_ECONOMIA.dineroInicial)
  })

  it('no se pueden comprar la más cara y, después, la más barata', () => {
    const segundaBarata = Math.min(...todos.map(([t, f, a]) => precio(t, f, a, 1)))
    expect(masCara + segundaBarata).toBeGreaterThan(CONFIG_ECONOMIA.dineroInicial)
  })

  it('en varias semillas siempre hay una parcela asequible al empezar', () => {
    for (let semilla = 0; semilla < 200; semilla++) {
      const e = crearEstadoInicial({ semilla })
      const precios = e.valle.parcelas.map((_, i) => precioParcela(e, i) ?? Number.NaN)
      expect(Math.min(...precios)).toBeLessThanOrEqual(e.dinero)
    }
  })
})
