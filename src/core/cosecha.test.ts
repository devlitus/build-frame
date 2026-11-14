import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { conTierraLabrable } from '../../tests/unit/fixtures/labranza'
import {
  aplicarComando,
  cantidadDe,
  CONFIG_CULTIVOS,
  CONFIG_ENERGIA,
  crearEstadoInicial,
  CULTIVOS,
  diasHastaMadurar,
  faseDe,
  plantaEn,
  plantaNueva,
  puedeCosechar,
  tierraValida,
  type EstadoJuego,
  type Herramienta,
  type ObjetoId,
} from './index'
import { ladoValle } from './mapa'
import { empezarDiaSiguiente } from './obras'

const base = crearEstadoInicial({ semilla: 42 })
const lado = ladoValle(base.valle)
const sitio = (x: number, y: number) => y * lado + x
const SUELO = { x: 50, y: 51 }

type C = (typeof CULTIVOS)[number]

type Tupla = [number, number, number, number, number, number]

function conPlanta(c: C, dias: number, marchita = 0): EstadoJuego {
  const e = conTierraLabrable(
    { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
    50,
    50,
  )
  const i = sitio(SUELO.x, SUELO.y)
  const p = [...plantaNueva(i, CULTIVOS.indexOf(c))] as Tupla
  p[2] = dias
  p[5] = marchita
  return {
    ...e,
    herramienta: 'mano',
    inventario: [],
    tierra: e.tierra.slice(0, i) + 'a' + e.tierra.slice(i + 1),
    plantas: [p],
  }
}
const madura = (c: C) => diasHastaMadurar(CONFIG_CULTIVOS.cultivos[c])
const usa = (e: EstadoJuego, x = SUELO.x, y = SUELO.y) =>
  aplicarComando(e, { tipo: 'UsarHerramienta', x, y })
const ok = (e: EstadoJuego, x = SUELO.x, y = SUELO.y) => {
  const r = usa(e, x, y)
  if (!r.ok) throw new Error(r.error)
  return r
}
const amanece = (e: EstadoJuego): EstadoJuego => ({
  ...empezarDiaSiguiente(e, 'dormir').estado,
  personaje: e.personaje,
})
const riega = (e: EstadoJuego, x: number, y: number): EstadoJuego => ({
  ...ok({ ...e, herramienta: 'regadera' as Herramienta }, x, y).estado,
  herramienta: e.herramienta,
})

/** Inventario con las 12 ranuras base ocupadas por objetos que no son de la cosecha. */
const llenarInventario = (e: EstadoJuego): EstadoJuego => ({
  ...e,
  inventario: [
    'semilla-rabano',
    'semilla-zanahoria',
    'semilla-lechuga',
    'semilla-fresa',
    'semilla-patata',
    'zanahoria',
    'lechuga',
    'rabano',
    'fresa',
    'planton',
  ]
    .map((objeto) => ({ objeto: objeto as ObjetoId, cantidad: 99 }))
    .concat([
      { objeto: 'semilla-rabano' as ObjetoId, cantidad: 99 },
      { objeto: 'semilla-zanahoria' as ObjetoId, cantidad: 99 },
    ]),
})

describe('cosechar con la mano', () => {
  it('cada cultivo maduro da su producto, deja la casilla arada o rebrota y no gasta energía', () => {
    for (const c of CULTIVOS) {
      const def = CONFIG_CULTIVOS.cultivos[c]
      const e = conPlanta(c, madura(c))
      const r = ok(e)
      expect(cantidadDe(r.estado.inventario, def.cosecha.producto)).toBe(def.cosecha.cantidad)
      expect(r.estado.energia).toBe(e.energia)
      expect(r.eventos.some((v) => v.tipo === 'planta-cosechada')).toBe(true)
      expect(tierraValida(r.estado)).toBe(true)
      if (def.rebrota) {
        expect(plantaEn(r.estado, SUELO.x, SUELO.y)?.[2]).toBe(madura(c) - def.rebrota.dias)
      } else {
        expect(plantaEn(r.estado, SUELO.x, SUELO.y)).toBeUndefined()
        expect(r.estado.tierra[sitio(SUELO.x, SUELO.y)]).toBe('a')
      }
    }
  })

  it('una planta sin madurar no se cosecha ni se rechaza: no pasa nada', () => {
    const e = conPlanta('rabano', madura('rabano') - 1)
    const r = ok(e)
    expect(r.estado.plantas).toEqual(e.plantas)
    expect(r.estado.inventario).toEqual([])
  })

  it('la fresa rebrota en fase 2 y vuelve a madurar a los días de sus datos', () => {
    const def = CONFIG_CULTIVOS.cultivos.fresa
    const dias = def.rebrota?.dias ?? 0
    let e = ok(conPlanta('fresa', madura('fresa'))).estado
    expect(faseDe(def, plantaEn(e, SUELO.x, SUELO.y)?.[2] ?? 0)).toBe(2)
    for (let d = 0; d < dias; d++) {
      expect(ok(e).estado.plantas[0]?.[2]).toBeLessThan(madura('fresa'))
      e = amanece(riega(e, SUELO.x, SUELO.y))
    }
    expect(plantaEn(e, SUELO.x, SUELO.y)?.[2]).toBe(madura('fresa'))
    const r = ok(e)
    expect(cantidadDe(r.estado.inventario, 'fresa')).toBe(2 * def.cosecha.cantidad)
  })

  it('con el inventario lleno se rechaza, sin gastar ni perder la planta ni cambiar el estado', () => {
    const e = llenarInventario(conPlanta('patata', madura('patata')))
    const r = usa(e)
    expect(r).toMatchObject({ ok: false, error: 'inventario-lleno' })
    expect((r as { estado: EstadoJuego }).estado).toEqual(e)
  })

  it('con el inventario lleno pero hueco en la pila del producto, sí cabe', () => {
    const e = llenarInventario(conPlanta('rabano', madura('rabano')))
    const r = ok({
      ...e,
      inventario: e.inventario.map((s) => (s.objeto === 'rabano' ? { ...s, cantidad: 5 } : s)),
    })
    expect(cantidadDe(r.estado.inventario, 'rabano')).toBe(6)
  })

  it('la mano limpia una marchita y deja la casilla arada, sin energía', () => {
    const e = conPlanta('rabano', 0, 1)
    const r = ok(e)
    expect(plantaEn(r.estado, SUELO.x, SUELO.y)).toBeUndefined()
    expect(r.estado.tierra[sitio(SUELO.x, SUELO.y)]).toBe('a')
    expect(r.estado.energia).toBe(e.energia)
    expect(r.eventos.some((v) => v.tipo === 'marchita-limpiada')).toBe(true)
  })

  it('una marchita madura se limpia y no se cosecha', () => {
    const r = ok(conPlanta('rabano', madura('rabano'), 1))
    expect(r.eventos.some((v) => v.tipo === 'planta-cosechada')).toBe(false)
    expect(r.estado.inventario).toEqual([])
  })

  it('la mano cuesta 0 de energía en los datos', () => {
    expect(CONFIG_ENERGIA.costes.mano).toBe(0)
  })
})

describe('propiedades de cosechar', () => {
  it('cosechar conserva los invariantes y suma exactamente la cosecha; no se duplica', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CULTIVOS), fc.integer({ min: 0, max: 5 }), (c, extra) => {
        const def = CONFIG_CULTIVOS.cultivos[c]
        const r = ok(conPlanta(c, madura(c) + extra))
        expect(tierraValida(r.estado)).toBe(true)
        expect(cantidadDe(r.estado.inventario, def.cosecha.producto)).toBe(def.cosecha.cantidad)
        const r2 = ok(r.estado)
        expect(cantidadDe(r2.estado.inventario, def.cosecha.producto)).toBe(def.cosecha.cantidad)
      }),
    )
  })
})

const OBJETOS: readonly ObjetoId[] = [
  'semilla-rabano',
  'semilla-zanahoria',
  'semilla-lechuga',
  'semilla-fresa',
  'semilla-patata',
  'patata',
  'zanahoria',
  'lechuga',
  'rabano',
  'fresa',
  'planton',
]

describe('propiedad del criterio 5: la mano y el total de objetos', () => {
  const total = (e: EstadoJuego) => e.inventario.reduce((a, s) => a + s.cantidad, 0)
  const inventarios = fc
    .uniqueArray(fc.constantFrom(...OBJETOS), { minLength: 1, maxLength: 5 })
    .chain((ids) =>
      fc.tuple(
        ...ids.map((objeto) =>
          fc.integer({ min: 1, max: 98 }).map((cantidad) => ({ objeto, cantidad })),
        ),
      ),
    )
  it('sube exactamente la cosecha si había madura viva; si no, no cambia (salvo el plantón gastado)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CULTIVOS),
        fc.constantFrom('vacia', 'sin-madurar', 'marchita', 'madura'),
        fc.integer({ min: 0, max: 3 }),
        inventarios,
        (c, caso, extra, inv) => {
          const def = CONFIG_CULTIVOS.cultivos[c]
          let e = conPlanta(
            c,
            caso === 'madura' ? madura(c) + extra : Math.max(0, madura(c) - 1 - extra),
          )
          if (caso === 'vacia') e = { ...e, plantas: [] }
          if (caso === 'marchita') e = conPlanta(c, madura(c) - extra, 1)
          e = { ...e, inventario: inv }
          const viva = caso === 'madura'
          expect(puedeCosechar(e, SUELO.x, SUELO.y)).toBe(viva)
          const r = ok(e)
          const plantado = r.eventos.filter((v) => v.tipo === 'planton-plantado').length
          expect(total(r.estado) - total(e) + plantado).toBe(viva ? def.cosecha.cantidad : 0)
        },
      ),
    )
  })
})

describe('datos: cultivos que rebrotan', () => {
  it('tras rebrotar la fase es 2 y los días de rebrote cuadran con diasPorFase', () => {
    for (const c of CULTIVOS) {
      const def = CONFIG_CULTIVOS.cultivos[c]
      if (!def.rebrota) continue
      const r = ok(conPlanta(c, madura(c)))
      const dias = plantaEn(r.estado, SUELO.x, SUELO.y)?.[2] ?? -1
      expect(faseDe(def, dias)).toBe(2)
      expect(madura(c) - dias).toBe(def.rebrota.dias)
    }
  })
})

describe('aceptación del hito: arar, plantar, regar y cosechar en varios días', () => {
  it('varias semillas completan el ciclo y dan sus productos', () => {
    const cultivos: C[] = ['rabano', 'patata', 'fresa']
    let e: EstadoJuego = conTierraLabrable(
      { ...base, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
      50,
      50,
    )
    const casillas = cultivos.map((_, k) => ({ x: 49 + k, y: 51 }))
    const accion = (s: EstadoJuego, h: Herramienta, x: number, y: number) =>
      ok({ ...s, herramienta: h }, x, y).estado
    cultivos.forEach((c, k) => {
      const cas = casillas[k] as { x: number; y: number }
      e = accion(e, 'azada', cas.x, cas.y)
      e = { ...e, semillaElegida: `semilla-${c}` as ObjetoId }
      e = accion(e, 'semillas', cas.x, cas.y)
      expect(plantaEn(e, cas.x, cas.y)).toBeDefined()
    })
    const total = Math.max(...cultivos.map(madura))
    for (let d = 0; d < total; d++) {
      for (const cas of casillas) {
        const p = plantaEn(e, cas.x, cas.y)
        const c = p ? (CULTIVOS[p[1]] as C) : undefined
        if (p && c && p[2] < madura(c)) e = accion(e, 'regadera', cas.x, cas.y)
      }
      e = amanece(e)
    }
    cultivos.forEach((c, k) => {
      const cas = casillas[k] as { x: number; y: number }
      const def = CONFIG_CULTIVOS.cultivos[c]
      const antes = cantidadDe(e.inventario, def.cosecha.producto)
      e = accion(e, 'mano', cas.x, cas.y)
      expect(cantidadDe(e.inventario, def.cosecha.producto)).toBe(antes + def.cosecha.cantidad)
    })
    expect(tierraValida(e)).toBe(true)
  })
})
