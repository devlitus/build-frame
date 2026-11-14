/* eslint-disable @typescript-eslint/no-non-null-assertion -- aserciones de catálogo conocido en tests */
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  anadirObjeto,
  aplicarComando,
  cantidadDe,
  capacidadInventario,
  CONFIG_INVENTARIO,
  crearEstadoInicial,
  defObjeto,
  EsquemaConfigInventario,
  HERRAMIENTAS,
  inventarioInicial,
  inventarioValido,
  OBJETOS,
  quitarObjeto,
  type Edificio,
  type EstadoJuego,
  type Inventario,
} from './index'

const cobertizo = (id: number, obra: Edificio['obra'] = null): Edificio => ({
  id,
  tipo: 'cobertizo',
  x: 10 * id,
  y: 10,
  obra,
})
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const clon = () => JSON.parse(JSON.stringify(CONFIG_INVENTARIO)) as Json
const valida = (o: unknown) => v.safeParse(EsquemaConfigInventario, o).success

describe('datos del inventario', () => {
  it('data/inventario.json es válido y declara las 6 herramientas y los objetos', () => {
    expect(valida(clon())).toBe(true)
    expect(HERRAMIENTAS).toEqual(['azada', 'regadera', 'semillas', 'mano', 'hacha', 'pico'])
    expect(OBJETOS).toHaveLength(11)
    for (const o of OBJETOS) expect(defObjeto(o)?.pilaMaxima).toBeGreaterThanOrEqual(1)
    expect(defObjeto('semilla-fresa')?.categoria).toBe('semilla')
    expect(defObjeto('fresa')?.categoria).toBe('producto')
    expect(defObjeto('planton')?.categoria).toBe('planton')
    expect(defObjeto('madera')).toBeUndefined()
    expect(defObjeto('constructor')).toBeUndefined()
  })

  it('capacidad base 12 y +12 por cobertizo, en datos', () => {
    expect(CONFIG_INVENTARIO.capacidadBase).toBe(12)
    expect(CONFIG_INVENTARIO.ranurasPorEdificio.cobertizo).toBe(12)
  })

  it.each<[string, (o: Json) => void]>([
    ['falta un objeto', (o) => delete o.objetos.planton],
    ['pila máxima 0', (o) => (o.objetos.planton.pilaMaxima = 0)],
    ['pila máxima decimal', (o) => (o.objetos.planton.pilaMaxima = 1.5)],
    ['capacidad base 0', (o) => (o.capacidadBase = 0)],
    ['ranuras de cobertizo negativas', (o) => (o.ranurasPorEdificio.cobertizo = -1)],
    ['herramienta inicial desconocida', (o) => (o.herramientaInicial = 'martillo')],
    ['objeto del lote desconocido', (o) => (o.loteInicial[0].objeto = 'oro')],
    ['cantidad del lote 0', (o) => (o.loteInicial[0].cantidad = 0)],
    [
      'objeto repetido en el lote',
      (o) => o.loteInicial.push({ objeto: 'semilla-rabano', cantidad: 1 }),
    ],
    ['el lote no cabe', (o) => (o.capacidadBase = 2)],
    ['clave sobrante', (o) => (o.extra = 1)],
  ])('rechaza datos mal formados: %s', (_n, mut) => {
    const o = clon()
    mut(o)
    expect(valida(o)).toBe(false)
  })
})

describe('estado inicial', () => {
  const e = crearEstadoInicial({ semilla: 42 })

  it('trae el lote de regalo y la herramienta inicial', () => {
    expect(e.inventario).toEqual([
      { objeto: 'semilla-rabano', cantidad: 10 },
      { objeto: 'semilla-patata', cantidad: 10 },
      { objeto: 'semilla-fresa', cantidad: 5 },
    ])
    expect(inventarioInicial()).toEqual(e.inventario)
    expect(e.herramienta).toBe('azada')
    expect(e.semillaElegida).toBeNull()
    expect(inventarioValido(e.inventario)).toBe(true)
  })

  it('madera y piedra siguen en materiales, no en el inventario', () => {
    expect(e.materiales).toEqual({ madera: 80, piedra: 20 })
    expect(e.inventario.every((r) => OBJETOS.includes(r.objeto))).toBe(true)
  })

  it('inventarioInicial a medida y validación', () => {
    const o = crearEstadoInicial({
      semilla: 1,
      inventarioInicial: [{ objeto: 'planton', cantidad: 3 }],
    })
    expect(o.inventario).toEqual([{ objeto: 'planton', cantidad: 3 }])
    expect(() =>
      crearEstadoInicial({ semilla: 1, inventarioInicial: [{ objeto: 'planton', cantidad: 0 }] }),
    ).toThrow(RangeError)
  })
})

describe('capacidad', () => {
  it('base sin edificios', () => {
    expect(capacidadInventario([])).toBe(12)
  })
  it('cada cobertizo terminado suma 12; una obra no', () => {
    expect(capacidadInventario([cobertizo(1)])).toBe(24)
    expect(capacidadInventario([cobertizo(1), cobertizo(2)])).toBe(36)
    expect(capacidadInventario([cobertizo(1), cobertizo(2, { diaInicio: 1, diaFin: 3 })])).toBe(24)
    expect(capacidadInventario([cobertizo(1, { diaInicio: 1, diaFin: 3 })])).toBe(12)
  })
  it('los demás edificios no suman', () => {
    const casa: Edificio = { id: 1, tipo: 'casa', x: 0, y: 0, obra: null }
    const caja: Edificio = { id: 2, tipo: 'caja-envio', x: 5, y: 5, obra: null }
    expect(capacidadInventario([casa, caja])).toBe(12)
  })
})

describe('anadirObjeto', () => {
  const pila = defObjeto('patata')?.pilaMaxima ?? 99

  it('apila en la ranura incompleta antes de abrir otra', () => {
    const a = anadirObjeto([{ objeto: 'patata', cantidad: pila - 2 }], 'patata', 5, 12)
    expect(a).toEqual([
      { objeto: 'patata', cantidad: pila },
      { objeto: 'patata', cantidad: 3 },
    ])
  })
  it('una cantidad enorme abre varias ranuras', () => {
    const a = anadirObjeto([], 'patata', pila * 2 + 1, 12)
    expect(a).toEqual([
      { objeto: 'patata', cantidad: pila },
      { objeto: 'patata', cantidad: pila },
      { objeto: 'patata', cantidad: 1 },
    ])
  })
  it('todo o nada: si no caben, no cambia nada', () => {
    expect(anadirObjeto([], 'patata', pila * 13, 12)).toBeUndefined()
    expect(anadirObjeto([], 'patata', Number.MAX_SAFE_INTEGER, 12)).toBeUndefined()
  })
  it('rechaza cantidades y objetos inválidos', () => {
    for (const n of [0, -1, 1.5, NaN, Infinity]) {
      expect(anadirObjeto([], 'patata', n, 12)).toBeUndefined()
    }
    // @ts-expect-error objeto fuera del catálogo
    expect(anadirObjeto([], 'madera', 1, 12)).toBeUndefined()
  })
  it('justo en su capacidad aún rellena una ranura incompleta, pero no abre otra', () => {
    const lleno: Inventario = [
      { objeto: 'patata', cantidad: 1 },
      { objeto: 'planton', cantidad: pila },
    ]
    expect(anadirObjeto(lleno, 'patata', 1, 2)).toEqual([
      { objeto: 'patata', cantidad: 2 },
      { objeto: 'planton', cantidad: pila },
    ])
    expect(anadirObjeto(lleno, 'lechuga', 1, 2)).toBeUndefined()
  })
  it('por encima de su capacidad no admite nada, ni siquiera apilar', () => {
    const sobra: Inventario = [
      { objeto: 'patata', cantidad: 1 },
      { objeto: 'planton', cantidad: pila },
    ]
    expect(anadirObjeto(sobra, 'patata', 1, 1)).toBeUndefined()
    expect(anadirObjeto(sobra, 'lechuga', 1, 1)).toBeUndefined()
  })
})

describe('quitarObjeto', () => {
  it('vacía primero la ranura incompleta y desaparece al llegar a 0', () => {
    const pila = defObjeto('patata')?.pilaMaxima ?? 99
    const inv: Inventario = [
      { objeto: 'patata', cantidad: pila },
      { objeto: 'planton', cantidad: 2 },
      { objeto: 'patata', cantidad: 4 },
    ]
    expect(quitarObjeto(inv, 'patata', 4)).toEqual([
      { objeto: 'patata', cantidad: pila },
      { objeto: 'planton', cantidad: 2 },
    ])
    expect(quitarObjeto(inv, 'patata', 5)).toEqual([
      { objeto: 'patata', cantidad: pila - 1 },
      { objeto: 'planton', cantidad: 2 },
    ])
  })
  it('rechaza si no hay tantas o la cantidad no vale', () => {
    const inv: Inventario = [{ objeto: 'planton', cantidad: 2 }]
    expect(quitarObjeto(inv, 'planton', 3)).toBeUndefined()
    expect(quitarObjeto(inv, 'patata', 1)).toBeUndefined()
    expect(quitarObjeto(inv, 'planton', 0)).toBeUndefined()
    expect(quitarObjeto(inv, 'planton', 0.5)).toBeUndefined()
    expect(cantidadDe(inv, 'planton')).toBe(2)
  })
})

describe('inventarioValido', () => {
  it.each<[string, unknown]>([
    ['no es una lista', {}],
    ['cantidad 0', [{ objeto: 'planton', cantidad: 0 }]],
    ['cantidad decimal', [{ objeto: 'planton', cantidad: 1.5 }]],
    ['cantidad sobre la pila', [{ objeto: 'planton', cantidad: 100 }]],
    ['objeto desconocido', [{ objeto: 'oro', cantidad: 1 }]],
    [
      'dos ranuras incompletas del mismo objeto',
      [
        { objeto: 'planton', cantidad: 1 },
        { objeto: 'planton', cantidad: 2 },
      ],
    ],
    ['ranura nula', [null]],
  ])('rechaza: %s', (_n, inv) => {
    expect(inventarioValido(inv)).toBe(false)
  })
  it('acepta una incompleta por objeto', () => {
    expect(
      inventarioValido([
        { objeto: 'planton', cantidad: 99 },
        { objeto: 'planton', cantidad: 2 },
        { objeto: 'patata', cantidad: 2 },
      ]),
    ).toBe(true)
  })
})

describe('demoler un cobertizo no pierde objetos', () => {
  it('el inventario queda por encima de su capacidad y no admite nada nuevo', () => {
    const base = crearEstadoInicial({ semilla: 42 })
    // 18 ranuras llenas: caben con un cobertizo terminado (capacidad 24), no con la base (12).
    const inv: Inventario = Array.from({ length: 18 }, () => ({
      objeto: 'patata' as const,
      cantidad: 99,
    }))
    const e: EstadoJuego = { ...base, modo: 'plano', inventario: inv, edificios: [cobertizo(1)] }
    expect(capacidadInventario(e.edificios)).toBe(24)
    const r = aplicarComando(e, { tipo: 'DemolerEdificio', id: 1 })
    expect(r.ok).toBe(true)
    expect(r.estado.inventario).toBe(e.inventario)
    expect(capacidadInventario(r.estado.edificios)).toBe(12)
    expect(r.estado.inventario.length).toBeGreaterThan(capacidadInventario(r.estado.edificios))
    expect(anadirObjeto(r.estado.inventario, 'planton', 1, 12)).toBeUndefined()
    // Al bajar de la capacidad vuelve a admitir objetos.
    const menos = quitarObjeto(r.estado.inventario, 'patata', 99 * 8)
    expect(menos).toBeDefined()
    expect(menos!.length).toBeLessThanOrEqual(12)
    expect(anadirObjeto(menos!, 'planton', 1, 12)).toBeDefined()
  })
})
