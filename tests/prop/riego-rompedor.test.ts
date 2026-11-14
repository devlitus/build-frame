/* eslint-disable @typescript-eslint/no-non-null-assertion -- valores conocidos en tests */
/**
 * Rompedor · M5-04 Riego y crecimiento (núcleo): simulaciones multi-día, vuelta a hierba, cambio de
 * estación, interacción con `crecerPlantones` (M5-06) en `empezarDiaSiguiente` y guardados manipulados.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  CONFIG_CULTIVOS,
  CONFIG_TIEMPO,
  crearEstadoInicial,
  CULTIVOS,
  defCultivo,
  diasHastaMadurar,
  esCaracterArada,
  fechaDe,
  ladoValle,
  tierraValida,
  type EstadoJuego,
  type Planta,
} from '../../src/core'
import { crecerPlantas } from '../../src/core/riego'
import { empezarDiaSiguiente } from '../../src/core/obras'
import { conTierraLabrable } from '../unit/fixtures/labranza'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100_000 })
const LADO = ladoValle(base.valle)
const cas = (x: number, y: number) => y * LADO + x
const campo: EstadoJuego = {
  ...conTierraLabrable({ ...base, obstaculos: [] }, 50, 50),
  personaje: { x: 50.5, y: 50.5, orientacion: 'sur' },
  herramienta: 'azada',
}
const poner = (e: EstadoJuego, i: number, car: string): EstadoJuego => ({
  ...e,
  tierra: e.tierra.slice(0, i) + car + e.tierra.slice(i + 1),
})
const uso = (e: EstadoJuego, x: number, y: number) =>
  aplicarComando({ ...e, energia: 100 }, { tipo: 'UsarHerramienta', x, y })
const con = (e: EstadoJuego, h: 'azada' | 'regadera' | 'semillas' | 'mano'): EstadoJuego => ({
  ...e,
  herramienta: h,
})
/** Cambio de día directo (el mismo camino que usan Dormir y el desmayo). */
// El personaje se queda donde estaba (al despertar se recoloca junto a la cama).
const dormir = (e: EstadoJuego): EstadoJuego => ({
  ...empezarDiaSiguiente(e, 'dormir').estado,
  personaje: e.personaje,
})
const planta = (i: number, cultivo: string, dias = 0, sinAgua = 0, marchita = 0): Planta => [
  i,
  CULTIVOS.indexOf(cultivo as never),
  dias,
  0,
  sinAgua,
  marchita,
]
const dias400 = Array.from({ length: 400 }, (_, k) => k + 1)
/** Primer día (1-based) de una estación. */
const diaInicio = (est: string) => dias400.find((d) => fechaDe({ dia: d }).estacion === est)!

describe('M5-04 · tierra sin planta: vuelta a hierba', () => {
  it('arada seca vuelve a hierba exactamente a los diasSinRegarAHierba días; regar reinicia la cuenta', () => {
    const n = CONFIG_CULTIVOS.tierra.diasSinRegarAHierba
    const i = cas(50, 50)
    let e = poner(campo, i, 'a')
    for (let d = 1; d < n; d++) {
      e = dormir(e)
      expect(e.tierra[i], `día ${d}`).not.toBe('.')
    }
    expect(dormir(e).tierra[i]).toBe('.')
    // Riega en el último día antes de secarse: la cuenta vuelve a cero.
    const r = uso(con(e, 'regadera'), 50, 50)
    expect(r.ok).toBe(true)
    const m = dormir((r as { estado: EstadoJuego }).estado)
    expect(m.tierra[i]).toBe('a')
    expect(dormir(m).tierra[i]).toBe('1')
  })

  it('la azada tras volver a hierba vuelve a arar; no queda tierra inválida', () => {
    let e = poner(campo, cas(51, 50), 'a')
    for (let d = 0; d < CONFIG_CULTIVOS.tierra.diasSinRegarAHierba; d++) e = dormir(e)
    expect(e.tierra[cas(51, 50)]).toBe('.')
    const r = uso(e, 51, 50)
    expect(r.ok).toBe(true)
    expect(tierraValida((r as { estado: EstadoJuego }).estado)).toBe(true)
  })

  it('una casilla con planta (aun sin regar durante muchos días) nunca vuelve a hierba', () => {
    let e: EstadoJuego = {
      ...poner(campo, cas(50, 51), 'a'),
      plantas: [planta(cas(50, 51), 'rabano')],
    }
    for (let d = 0; d < 12; d++) e = dormir(e)
    expect(esCaracterArada(e.tierra[cas(50, 51)])).toBe(true)
    expect(tierraValida(e)).toBe(true)
  })

  it('limpiar una marchita deja tierra arada que sí vuelve a hierba luego', () => {
    let e: EstadoJuego = {
      ...poner(campo, cas(50, 51), 'a'),
      plantas: [planta(cas(50, 51), 'rabano', 0, 3, 1)],
    }
    e = (uso(con(e, 'azada'), 50, 51) as { estado: EstadoJuego }).estado
    expect(e.plantas).toEqual([])
    expect(e.tierra[cas(50, 51)]).toBe('a')
    for (let d = 0; d < CONFIG_CULTIVOS.tierra.diasSinRegarAHierba; d++) e = dormir(e)
    expect(e.tierra[cas(50, 51)]).toBe('.')
  })
})

describe('M5-04 · cambio de estación', () => {
  const ultimoPrimavera = diaInicio('verano') - 1
  const mk = (dia: number, p: Planta): EstadoJuego => ({
    ...poner(campo, p[0], 'A'),
    dia,
    plantas: [p],
  })

  it('el último día de primavera, una planta regada y otra madura se marchitan al amanecer, con evento', () => {
    const i = cas(50, 51)
    const j = cas(51, 51)
    const e: EstadoJuego = {
      ...poner(poner(campo, i, 'A'), j, 'a'),
      dia: ultimoPrimavera,
      plantas: [
        planta(i, 'rabano', 1),
        planta(j, 'patata', diasHastaMadurar(CONFIG_CULTIVOS.cultivos.patata)),
      ],
    }
    const r = empezarDiaSiguiente(e, 'dormir')
    expect(r.estado.plantas.map((p) => p[5])).toEqual([1, 1])
    expect(r.eventos.filter((x) => x.tipo === 'planta-marchita')).toHaveLength(2)
  })

  it('un día antes del cambio la planta regada sigue creciendo', () => {
    const p = planta(cas(50, 51), 'rabano', 1)
    const r = empezarDiaSiguiente(mk(ultimoPrimavera - 1, p), 'dormir')
    expect(r.estado.plantas[0]).toEqual([p[0], p[1], 2, 0, 0, 0])
  })

  it('la marchita no emite un segundo evento al cambiar de estación', () => {
    const p = planta(cas(50, 51), 'rabano', 0, 3, 1)
    const r = empezarDiaSiguiente(mk(ultimoPrimavera, p), 'dormir')
    expect(r.eventos.filter((x) => x.tipo === 'planta-marchita')).toEqual([])
    expect(r.estado.plantas[0]).toEqual(p)
  })

  it('al volver la primavera (cambio de año) una planta de primavera no se marchita por estación', () => {
    const finAnio =
      diaInicio('primavera') + CONFIG_TIEMPO.diasPorEstacion * CONFIG_TIEMPO.estaciones.length - 1
    const i = cas(50, 51)
    const e: EstadoJuego = {
      ...poner(campo, i, 'A'),
      dia: finAnio,
      plantas: [planta(i, 'rabano', 1)],
    }
    const r = empezarDiaSiguiente(e, 'dormir')
    expect(r.estado.plantas[0]![5]).toBe(0)
  })

  it('toda planta de cualquier cultivo se marchita al acabar su última estación (propiedad)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CULTIVOS), fc.integer({ min: 0, max: 9 }), (c, dias) => {
        const def = defCultivo(c)!
        const d = dias400.filter(
          (k) =>
            def.estaciones.some((s) => s === fechaDe({ dia: k }).estacion) &&
            !def.estaciones.some((s) => s === fechaDe({ dia: k + 1 }).estacion),
        )[0]!
        const i = cas(50, 51)
        const e: EstadoJuego = { ...poner(campo, i, 'A'), dia: d, plantas: [planta(i, c, dias)] }
        expect(empezarDiaSiguiente(e, 'dormir').estado.plantas[0]![5]).toBe(1)
      }),
    )
  })
})

describe('M5-04 · empezarDiaSiguiente con crecerPlantones (M5-06)', () => {
  it('plantas y plantones crecen en el mismo cambio de día sin pisarse', () => {
    const i = cas(50, 51)
    const lejos = { x: 40, y: 40 }
    const e: EstadoJuego = {
      ...poner(campo, i, 'A'),
      plantas: [planta(i, 'rabano', 1)],
      obstaculos: [{ tipo: 'planton', ...lejos, variante: 0, diaPlantado: 1 }],
      dia: 1 + 50,
    }
    const r = empezarDiaSiguiente(e, 'dormir').estado
    expect(r.plantas[0]![2]).toBe(2)
    expect(r.tierra[i]).toBe('a')
    expect(r.obstaculos.find((o) => o.x === lejos.x && o.y === lejos.y)?.tipo).toBe('arbol')
    expect(tierraValida(r)).toBe(true)
  })

  it('el cambio de día no toca los obstáculos ni la tierra cuando no hay nada que crecer', () => {
    const e: EstadoJuego = { ...campo, obstaculos: base.obstaculos }
    const r = empezarDiaSiguiente(e, 'dormir').estado
    expect(r.obstaculos).toEqual(e.obstaculos)
    expect(r.tierra).toBe(e.tierra)
  })
})

describe('M5-04 · guardados manipulados', () => {
  const i = cas(50, 51)
  const manipulados: Record<string, Partial<EstadoJuego>> = {
    'plantas null': { plantas: null as never },
    'plantas indefinidas (partida vieja)': { plantas: undefined as never },
    'tierra número': { tierra: 5 as never },
    'tierra corta': { tierra: 'aaa' },
    'planta duplicada': { plantas: [planta(i, 'rabano'), planta(i, 'rabano')] },
    'plantas desordenadas': { plantas: [planta(i + 1, 'rabano'), planta(i, 'rabano')] },
    'planta con regada=1': { plantas: [[i, 0, 0, 1, 0, 0]] },
    'planta con cultivo fuera': { plantas: [[i, 99, 0, 0, 0, 0]] },
    'planta con días negativos': { plantas: [[i, 0, -1, 0, 0, 0]] },
    'planta con días NaN': { plantas: [[i, 0, NaN, 0, 0, 0]] },
    'planta sobre hierba': { plantas: [planta(cas(10, 10), 'rabano')] },
    'planta con marchita=2': { plantas: [[i, 0, 0, 0, 0, 2]] },
    'planta con 4 campos': { plantas: [[i, 0, 0, 0]] as never },
    'planta no array': { plantas: ['x'] as never },
  }
  for (const [nombre, parche] of Object.entries(manipulados)) {
    it(`no lanza y el día avanza con ${nombre}`, () => {
      const e: EstadoJuego = { ...poner(campo, i, 'a'), ...parche }
      let r: EstadoJuego | undefined
      expect(() => (r = empezarDiaSiguiente(e, 'dormir').estado)).not.toThrow()
      expect(r!.dia).toBe(e.dia + 1)
      expect(() => uso(con(e, 'regadera'), 50, 51)).not.toThrow()
      expect(() => uso(con(e, 'azada'), 50, 51)).not.toThrow()
    })
  }

  it('crecerPlantas con un estado inválido lo devuelve intacto (mismo objeto y sin eventos)', () => {
    for (const parche of Object.values(manipulados)) {
      const e: EstadoJuego = { ...poner(campo, i, 'a'), ...parche }
      if (tierraValida(e)) continue
      const r = crecerPlantas(e)
      expect(r.estado).toBe(e)
      expect(r.eventos).toEqual([])
    }
  })

  it('tierra con caracteres basura fuera de las plantas no rompe el crecimiento', () => {
    const t = (campo.tierra.slice(0, 5) + 'xZ0@' + campo.tierra.slice(9)).slice(
      0,
      campo.tierra.length,
    )
    const e: EstadoJuego = { ...campo, tierra: t }
    expect(tierraValida(e)).toBe(true)
    const r = crecerPlantas(e).estado
    expect(r.tierra.length).toBe(t.length)
    expect(r.tierra.slice(5, 9)).toBe('xZ0@')
  })

  // Regresión del S3 hallado por el Rompedor (guardado manipulado): con diasSinAgua = MAX_SAFE_INTEGER
  // la suma salía del rango seguro y congelaba la granja; `crecerPlantas` ahora satura el contador.
  it('diasSinAgua gigante en una planta viva la marchita y no desborda', () => {
    const e: EstadoJuego = {
      ...poner(campo, i, 'a'),
      plantas: [[i, 0, 0, 0, Number.MAX_SAFE_INTEGER, 0]],
    }
    const r = empezarDiaSiguiente(e, 'dormir').estado
    expect(r.plantas[0]![5]).toBe(1)
    expect(Number.isSafeInteger(r.plantas[0]![4])).toBe(true)
  })

  it('dias gigante cuenta como madura: espera sin marchitarse', () => {
    const e: EstadoJuego = {
      ...poner(campo, i, 'a'),
      plantas: [[i, 0, Number.MAX_SAFE_INTEGER, 0, 0, 0]],
    }
    const r = empezarDiaSiguiente(e, 'dormir').estado
    expect(r.plantas[0]).toEqual([i, 0, Number.MAX_SAFE_INTEGER, 0, 0, 0])
  })
})

describe('M5-04 · simulación multi-día (propiedad)', () => {
  const casillas = [cas(49, 49), cas(50, 49), cas(51, 49), cas(49, 50), cas(50, 50), cas(51, 50)]
  const accion = fc.oneof(
    fc.record({
      t: fc.constant('uso' as const),
      h: fc.constantFrom('azada', 'regadera', 'semillas', 'mano'),
      c: fc.integer({ min: 0, max: casillas.length - 1 }),
    }),
    fc.record({ t: fc.constant('dormir' as const) }),
    fc.record({ t: fc.constant('dormir' as const) }),
  )
  it('invariantes de tierra y plantas tras cualquier mezcla de azada, semillas, regadera y días', () => {
    fc.assert(
      fc.property(fc.array(accion, { maxLength: 60 }), (acciones) => {
        let e: EstadoJuego = {
          ...campo,
          dia: 1,
          inventario: [{ objeto: 'semilla-rabano', cantidad: 99 }] as never,
          semillaElegida: 'semilla-rabano',
        }
        for (const a of acciones) {
          const antes = e
          if (a.t === 'dormir') {
            e = dormir(e)
            expect(e.tierra).not.toContain('A')
            expect(e.dia).toBe(antes.dia + 1)
          } else {
            const c = casillas[a.c]!
            const r = uso(con(e, a.h), c % LADO, Math.floor(c / LADO))
            if (r.ok) e = { ...r.estado, energia: 100 }
          }
          expect(tierraValida(e)).toBe(true)
          expect(e.tierra.length).toBe(LADO * LADO)
          expect(/^[.aA1-9]+$/.test(e.tierra)).toBe(true)
          for (const p of e.plantas) {
            const def = defCultivo(CULTIVOS[p[1]])!
            expect(p[2]).toBeLessThanOrEqual(diasHastaMadurar(def))
          }
          // Lo marchito no se recupera; lo vivo nunca pierde días de crecimiento.
          for (const p of antes.plantas) {
            const q = e.plantas.find((z) => z[0] === p[0])
            if (!q || q[1] !== p[1]) continue
            expect(q[2]).toBeGreaterThanOrEqual(p[2])
            if (p[5] === 1) expect(q[5]).toBe(1)
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  it('regar cada día hasta madurar da exactamente diasHastaMadurar días; saltarse uno atrasa uno', () => {
    const i = cas(50, 50)
    for (const c of CULTIVOS) {
      const total = diasHastaMadurar(CONFIG_CULTIVOS.cultivos[c])
      let e: EstadoJuego = { ...poner(campo, i, 'a'), dia: 1, plantas: [planta(i, c)] }
      let regados = 0
      let dia = 0
      while (e.plantas[0]![2] < total && dia < 40) {
        // Se salta el segundo día de riego una vez.
        if (dia !== 1) {
          e = (uso(con(e, 'regadera'), 50, 50) as { estado: EstadoJuego }).estado
          regados++
        }
        e = dormir(e)
        dia++
        if (e.plantas[0]![5] === 1) break
      }
      expect(e.plantas[0]![2], c).toBe(total)
      expect(regados, c).toBe(total)
    }
  })
})
