/* eslint-disable @typescript-eslint/no-non-null-assertion -- valores conocidos en tests */
/**
 * Rompedor · M5-05 Cosechar (núcleo): rebrote repetido de la fresa, inventario lleno con productos
 * apilables o no, cosecha el último día de estación, interacción con riego y marchitado, plantones
 * y guardados manipulados. El oráculo campo a campo de la mano vive en inventario-rompedor.test.ts.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  anadirObjeto,
  aplicarComando,
  cantidadDe,
  capacidadInventario,
  CONFIG_CULTIVOS,
  crearEstadoInicial,
  CULTIVOS,
  diasHastaMadurar,
  fechaDe,
  inventarioValido,
  ladoValle,
  tierraValida,
  type EstadoJuego,
  type Inventario,
  type Planta,
} from '../../src/core'
import { empezarDiaSiguiente } from '../../src/core/obras'
import { conTierraLabrable } from '../unit/fixtures/labranza'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100_000 })
const LADO = ladoValle(base.valle)
const cas = (x: number, y: number) => y * LADO + x
const campo: EstadoJuego = {
  ...conTierraLabrable({ ...base, obstaculos: [] }, 50, 50),
  personaje: { x: 50.5, y: 50.5, orientacion: 'sur' },
  herramienta: 'mano',
  inventario: [],
}
const FRESA = CONFIG_CULTIVOS.cultivos.fresa
const MADUREZ_FRESA = diasHastaMadurar(FRESA)
const poner = (e: EstadoJuego, i: number, car: string): EstadoJuego => ({
  ...e,
  tierra: e.tierra.slice(0, i) + car + e.tierra.slice(i + 1),
})
const planta = (i: number, cultivo: string, dias = 0, sinAgua = 0, marchita = 0): Planta => [
  i,
  CULTIVOS.indexOf(cultivo as never),
  dias,
  0,
  sinAgua,
  marchita,
]
const uso = (e: EstadoJuego, h: EstadoJuego['herramienta'], x: number, y: number) =>
  aplicarComando({ ...e, herramienta: h, energia: 100 }, { tipo: 'UsarHerramienta', x, y })
const ok = (r: ReturnType<typeof uso>): EstadoJuego => {
  expect(r.ok, JSON.stringify(r.ok ? null : r.error)).toBe(true)
  return (r as { estado: EstadoJuego }).estado
}
const dormir = (e: EstadoJuego): EstadoJuego => ({
  ...empezarDiaSiguiente(e, 'dormir').estado,
  personaje: e.personaje,
})
const conPlanta = (p: Planta, car = 'a', extra: Partial<EstadoJuego> = {}): EstadoJuego => ({
  ...poner(campo, p[0], car),
  plantas: [p],
  ...extra,
})
const llenoCon = (
  cap: number,
  objeto: Parameters<typeof anadirObjeto>[1],
  n: number,
): Inventario => {
  let inv = anadirObjeto([], 'semilla-patata', 99 * (cap - 1), cap)!
  inv = anadirObjeto(inv, objeto, n, cap)!
  return inv
}

describe('M5-05 · rebrote de la fresa varios ciclos', () => {
  it('cada ciclo da 2 fresas, deja dias = madurez - rebrota y vuelve a madurar a los 4 días regando', () => {
    const i = cas(50, 50)
    let e = conPlanta(planta(i, 'fresa'), 'A', { dia: 1 })
    let cosechas = 0
    let diasDesdeCosecha = 0
    for (let d = 0; d < 25; d++) {
      const p = e.plantas[0]!
      if (p[5] === 0 && p[2] >= MADUREZ_FRESA) {
        e = ok(uso(e, 'mano', 50, 50))
        cosechas++
        diasDesdeCosecha = 0
        expect(e.plantas).toEqual([planta(i, 'fresa', MADUREZ_FRESA - FRESA.rebrota!.dias)])
        expect(cantidadDe(e.inventario, 'fresa')).toBe(2 * cosechas)
        expect(tierraValida(e)).toBe(true)
        expect(inventarioValido(e.inventario)).toBe(true)
      }
      if (e.tierra[i] === 'a' && e.plantas[0]![2] < MADUREZ_FRESA) {
        e = ok(uso(e, 'regadera', 50, 50))
      }
      e = dormir(e)
      diasDesdeCosecha++
      if (cosechas > 0 && e.plantas[0]![5] === 0 && !(e.plantas[0]![2] >= MADUREZ_FRESA)) {
        expect(diasDesdeCosecha).toBeLessThanOrEqual(FRESA.rebrota!.dias)
      }
      if (fechaDe(e).estacion !== 'primavera') break
    }
    // Primavera dura 21 días: 8 de crecimiento + ciclos de 4 -> al menos 4 cosechas.
    expect(cosechas).toBeGreaterThanOrEqual(4)
  })

  it('cosechar el último día de primavera: la fresa que rebrota se marchita al amanecer del verano y la mano la limpia', () => {
    const i = cas(50, 50)
    const ultimo = 21
    expect(fechaDe({ dia: ultimo }).estacion).toBe('primavera')
    expect(fechaDe({ dia: ultimo + 1 }).estacion).not.toBe('primavera')
    let e = conPlanta(planta(i, 'fresa', MADUREZ_FRESA), 'a', { dia: ultimo })
    e = ok(uso(e, 'mano', 50, 50))
    expect(cantidadDe(e.inventario, 'fresa')).toBe(2)
    e = dormir(e)
    expect(e.plantas[0]![5]).toBe(1)
    const antes = cantidadDe(e.inventario, 'fresa')
    e = ok(uso(e, 'mano', 50, 50))
    expect(e.plantas).toEqual([])
    expect(cantidadDe(e.inventario, 'fresa')).toBe(antes)
    expect(e.tierra[i]).toBe('a')
  })

  it('una madura sin cosechar el último día de primavera se marchita y ya no da producto', () => {
    const i = cas(50, 50)
    let e = conPlanta(planta(i, 'patata', diasHastaMadurar(CONFIG_CULTIVOS.cultivos.patata)), 'a', {
      dia: 21,
    })
    e = dormir(e)
    const antes = e
    e = ok(uso(e, 'mano', 50, 50))
    expect(cantidadDe(e.inventario, 'patata')).toBe(0)
    expect(cantidadDe(antes.inventario, 'patata')).toBe(0)
    expect(e.plantas).toEqual([])
  })
})

describe('M5-05 · inventario lleno: apilables frente a no apilables', () => {
  const cap = capacidadInventario(campo.edificios)
  const i = cas(50, 50)

  it('con el inventario justo en su capacidad, la fresa (2) cabe en una pila a 97 y no a 98; la patata (1) cabe a 98', () => {
    const f97 = conPlanta(planta(i, 'fresa', MADUREZ_FRESA), 'a', {
      inventario: llenoCon(cap, 'fresa', 97),
    })
    expect(f97.inventario).toHaveLength(cap)
    expect(cantidadDe(ok(uso(f97, 'mano', 50, 50)).inventario, 'fresa')).toBe(99)

    const f98 = { ...f97, inventario: llenoCon(cap, 'fresa', 98) }
    const r = uso(f98, 'mano', 50, 50)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('inventario-lleno')

    const p98 = conPlanta(
      planta(i, 'patata', diasHastaMadurar(CONFIG_CULTIVOS.cultivos.patata)),
      'a',
      { inventario: llenoCon(cap, 'patata', 98) },
    )
    expect(cantidadDe(ok(uso(p98, 'mano', 50, 50)).inventario, 'patata')).toBe(99)
  })

  it('un rechazo por inventario lleno no gasta energía ni pierde la planta; con sitio después, cosecha', () => {
    const e = conPlanta(planta(i, 'fresa', MADUREZ_FRESA), 'A', {
      inventario: llenoCon(cap, 'fresa', 98),
      energia: 50,
    })
    const r = aplicarComando(e, { tipo: 'UsarHerramienta', x: 50, y: 50 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.estado).toBe(e)
    // Libera una ranura (tira 99 semillas) y la cosecha ya cabe.
    const sitio: EstadoJuego = { ...e, inventario: llenoCon(cap - 1, 'fresa', 98) }
    const c = aplicarComando(sitio, { tipo: 'UsarHerramienta', x: 50, y: 50 })
    expect(c.ok).toBe(true)
    if (c.ok) {
      expect(cantidadDe(c.estado.inventario, 'fresa')).toBe(100)
      expect(inventarioValido(c.estado.inventario)).toBe(true)
      expect(c.estado.tierra[i]).toBe('A')
    }
  })

  it('inventario por encima de la capacidad (cobertizo demolido): cosechar se rechaza aunque quepa en una pila', () => {
    const exceso = anadirObjeto([], 'semilla-patata', 99 * (cap + 1), cap + 1)!
    const e = conPlanta(planta(i, 'fresa', MADUREZ_FRESA), 'a', {
      inventario: [...exceso.slice(0, cap), { objeto: 'fresa', cantidad: 10 }, exceso[cap]!],
    })
    expect(inventarioValido(e.inventario)).toBe(true)
    const r = uso(e, 'mano', 50, 50)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('inventario-lleno')
  })
})

describe('M5-05 · mano con plantones y marchitas', () => {
  const i = cas(50, 50)
  it('con un plantón en el inventario, una madura se cosecha (no se planta) y el plantón no se gasta', () => {
    const e = conPlanta(
      planta(i, 'patata', diasHastaMadurar(CONFIG_CULTIVOS.cultivos.patata)),
      'a',
      {
        inventario: [{ objeto: 'planton', cantidad: 3 }],
      },
    )
    const s = ok(uso(e, 'mano', 50, 50))
    expect(cantidadDe(s.inventario, 'planton')).toBe(3)
    expect(cantidadDe(s.inventario, 'patata')).toBe(1)
    expect(s.obstaculos).toEqual(e.obstaculos)
  })

  it('una viva sin madurar con plantón: ni cosecha ni planta encima de ella', () => {
    const e = conPlanta(planta(i, 'patata', 3), 'a', {
      inventario: [{ objeto: 'planton', cantidad: 3 }],
    })
    const s = ok(uso(e, 'mano', 50, 50))
    expect(s.plantas).toEqual(e.plantas)
    expect(s.obstaculos).toEqual(e.obstaculos)
    expect(cantidadDe(s.inventario, 'planton')).toBe(3)
  })

  it('regar una fresa que rebrota (viva) se permite y una madura sigue rechazando el riego', () => {
    const e = conPlanta(planta(i, 'fresa', MADUREZ_FRESA - FRESA.rebrota!.dias), 'a')
    expect(uso(e, 'regadera', 50, 50).ok).toBe(true)
    const m = conPlanta(planta(i, 'fresa', MADUREZ_FRESA), 'a')
    const r = uso(m, 'regadera', 50, 50)
    expect(r.ok).toBe(false)
  })

  it('una madura con diasSinAgua residual (guardado antiguo) rebrota con la cuenta a cero', () => {
    const e = conPlanta(planta(i, 'fresa', MADUREZ_FRESA + 5, 2), 'a')
    const s = ok(uso(e, 'mano', 50, 50))
    expect(s.plantas[0]).toEqual(planta(i, 'fresa', MADUREZ_FRESA - FRESA.rebrota!.dias))
  })
})

describe('M5-05 · guardados manipulados', () => {
  const i = cas(50, 50)
  const mad = diasHastaMadurar(CONFIG_CULTIVOS.cultivos.patata)

  it('plantas inválidas (cultivo fuera de rango, dias negativos/NaN/decimal, marchita=2, duplicadas): no lanza y no cosecha', () => {
    const malas: unknown[][] = [
      [[i, 99, 9, 0, 0, 0]],
      [[i, 0, -1, 0, 0, 0]],
      [[i, 0, NaN, 0, 0, 0]],
      [[i, 0, mad + 0.5, 0, 0, 0]],
      [[i, 0, mad, 0, 0, 2]],
      [
        [i, 0, mad, 0, 0, 0],
        [i, 0, mad, 0, 0, 0],
      ],
      [[i, 0, mad]],
      [null],
    ]
    for (const plantas of malas) {
      const e = { ...poner(campo, i, 'a'), plantas: plantas as never }
      const r = uso(e, 'mano', 50, 50)
      if (r.ok) {
        expect(cantidadDe(r.estado.inventario, 'patata'), JSON.stringify(plantas)).toBe(0)
        expect(r.estado.plantas).toEqual(e.plantas)
      }
    }
  })

  it('dias = Infinity o enorme en una planta válida: se cosecha una vez y no corrompe', () => {
    // Infinity no es entero seguro: tierraValida lo rechaza, no hay cosecha.
    const inf = { ...poner(campo, i, 'a'), plantas: [planta(i, 'patata', Infinity)] }
    const r = uso(inf, 'mano', 50, 50)
    if (r.ok) expect(cantidadDe(r.estado.inventario, 'patata')).toBe(0)
    const enorme = conPlanta(planta(i, 'fresa', Number.MAX_SAFE_INTEGER))
    const s = ok(uso(enorme, 'mano', 50, 50))
    expect(s.plantas[0]).toEqual(planta(i, 'fresa', MADUREZ_FRESA - FRESA.rebrota!.dias))
  })

  // S3 (M5-05): con un inventario corrupto, cosechar responde `inventario-lleno` (conCosecha
  // devuelve undefined) en vez de `estado-invalido`, que es lo que hace la azada/semillas en M5-01.
  // Mensaje engañoso al jugador; `comprobarUsarHerramienta` solo valida el inventario con semillas.
  it.fails(
    'inventario inválido con una madura: se rechaza como estado inválido, no como «inventario lleno»',
    () => {
      const invalidos: unknown[] = [
        [{ objeto: 'patata', cantidad: 0 }],
        [{ objeto: 'patata', cantidad: 100 }],
        [
          { objeto: 'patata', cantidad: 3 },
          { objeto: 'patata', cantidad: 4 },
        ],
        [{ objeto: 'nada', cantidad: 1 }],
        'x',
      ]
      const fallos: string[] = []
      for (const inv of invalidos) {
        const e = conPlanta(planta(i, 'patata', mad), 'a', { inventario: inv as never })
        const r = uso(e, 'mano', 50, 50)
        if (r.ok) fallos.push(`${JSON.stringify(inv)} -> ok`)
        else if (r.error !== 'estado-invalido') fallos.push(`${JSON.stringify(inv)} -> ${r.error}`)
      }
      expect(fallos).toEqual([])
    },
  )
})

describe('M5-05 · invariantes en partidas simuladas', () => {
  const cultivos = ['patata', 'fresa', 'zanahoria', 'rabano', 'lechuga'] as const
  const accion = fc.constantFrom('regar', 'cosechar', 'dormir', 'dormir', 'cosechar-todo')

  it('tras cualquier secuencia: tierra e inventario válidos, y el producto cosechado = eventos', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...cultivos), { minLength: 1, maxLength: 5 }),
        fc.array(accion, { minLength: 1, maxLength: 60 }),
        fc.integer({ min: 1, max: 40 }),
        fc.boolean(),
        (cs, acciones, dia, lleno) => {
          const celdas = cs.map((_, k) => cas(50 + k, 50))
          let e: EstadoJuego = {
            ...campo,
            dia,
            personaje: { x: 52.5, y: 50.5, orientacion: 'sur' },
            tierra: celdas.reduce((t, c) => t.slice(0, c) + 'A' + t.slice(c + 1), campo.tierra),
            plantas: cs.map((c, k) => planta(celdas[k]!, c)),
            inventario: lleno
              ? llenoCon(capacidadInventario(campo.edificios), 'semilla-fresa', 1)
              : [],
          }
          const contados = new Map<string, number>()
          for (const a of acciones) {
            if (a === 'dormir') {
              e = dormir(e)
              continue
            }
            for (const c of celdas) {
              const x = c % LADO
              const y = Math.floor(c / LADO)
              const r = aplicarComando(
                { ...e, herramienta: a === 'regar' ? 'regadera' : 'mano', energia: 100 },
                { tipo: 'UsarHerramienta', x, y },
              )
              if (!r.ok) {
                expect(r.estado).toBeDefined()
                continue
              }
              if (a === 'cosechar-todo' || a === 'cosechar') {
                for (const ev of r.eventos) {
                  if (ev.tipo === 'planta-cosechada') {
                    contados.set(ev.producto, (contados.get(ev.producto) ?? 0) + ev.cantidad)
                  }
                }
              }
              e = r.estado
            }
            expect(tierraValida(e)).toBe(true)
            expect(inventarioValido(e.inventario)).toBe(true)
            expect(e.inventario.length).toBeLessThanOrEqual(capacidadInventario(e.edificios))
          }
          for (const [producto, n] of contados) {
            expect(cantidadDe(e.inventario, producto as never), producto).toBe(n)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
