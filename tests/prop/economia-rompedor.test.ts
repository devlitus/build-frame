/**
 * Rompedor · M3-01 Ahorros iniciales y precio de parcela (sistema crítico: economía).
 * Ataques sobre precioParcela / EsquemaConfigEconomia / crearEstadoInicial / plugin de build.
 * Los tests marcados con [Sx corregido] demostraron un defecto; hoy pasan y quedan como regresión.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import * as v from 'valibot'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { validarDatos } from '../../vite.config'
import {
  AGUAS,
  CONFIG_ECONOMIA,
  EsquemaConfigEconomia,
  FERTILIDADES,
  TERRENOS,
  crearEstadoInicial,
  precioParcela,
  type Agua,
  type ConfigEconomia,
  type EstadoJuego,
  type Fertilidad,
  type Parcela,
  type Terreno,
} from '../../src/core'
import datos from '../../data/economia.json'

// ---------------------------------------------------------------- utilidades

const BASE = crearEstadoInicial({ semilla: 1 })
const P0 = BASE.valle.parcelas[0] as Parcela

function conParcela(t: Terreno, f: Fertilidad, a: Agua, comprasHechas: number) {
  const parcela: Parcela = { ...P0, terreno: t, fertilidad: f, agua: a }
  return { valle: { ...BASE.valle, parcelas: [parcela] }, comprasHechas }
}

const combinaciones = TERRENOS.flatMap((t) =>
  FERTILIDADES.flatMap((f) => AGUAS.map((a) => [t, f, a] as const)),
)

/** Factor decimal de data/economia.json como entero ×100 (todos tienen ≤ 2 decimales). */
function centesimas(x: number): bigint {
  const c = Math.round(x * 100)
  // Si algún dato tuviera más de 2 decimales, el cálculo exacto dejaría de serlo: que falle.
  expect(c / 100).toBe(x)
  return BigInt(c)
}

/** Valor exacto (racional num/den) de base × factores × (1 + subida)^n con los datos reales. */
function valorExacto(t: Terreno, f: Fertilidad, a: Agua, n: number): { num: bigint; den: bigint } {
  const c = CONFIG_ECONOMIA
  // (1 + subida) = (100 + s) / 100, con s la subida en centésimas (0,4 → 140/100).
  const factorSubida = 100n + centesimas(c.subidaPorCompra)
  const num =
    BigInt(c.precioBase) *
    centesimas(c.factorTerreno[t]) *
    centesimas(c.factorFertilidad[f]) *
    centesimas(c.factorAgua[a]) *
    factorSubida ** BigInt(n)
  const den = 1_000_000n * 100n ** BigInt(n)
  return { num, den }
}

/** Precio exacto con aritmética racional (BigInt), redondeo a la decena con mitades hacia arriba. */
function precioExacto(t: Terreno, f: Fertilidad, a: Agua, n: number): bigint {
  const { num, den } = valorExacto(t, f, a, n)
  const r = ((num + 5n * den) / (10n * den)) * 10n
  return r < 10n ? 10n : r
}

function vecinos(i: number, lado: number): number[] {
  const f = Math.floor(i / lado)
  const c = i % lado
  const res: number[] = []
  for (const [a, b] of [
    [f - 1, c],
    [f + 1, c],
    [f, c - 1],
    [f, c + 1],
  ] as const)
    if (a >= 0 && b >= 0 && a < lado && b < lado) res.push(a * lado + b)
  return res
}

function permutaciones(xs: readonly number[]): number[][] {
  if (xs.length <= 1) return [[...xs]]
  return xs.flatMap((x, k) =>
    permutaciones([...xs.slice(0, k), ...xs.slice(k + 1)]).map((r) => [x, ...r]),
  )
}

/** Coste mínimo de comprar las parcelas `set` en algún orden (el precio sube tras cada compra). */
function costeMinimo(e: EstadoJuego, set: readonly number[]): number {
  let mejor = Infinity
  for (const orden of permutaciones(set)) {
    let total = 0
    orden.forEach((i, n) => {
      total += precioParcela({ ...e, comprasHechas: n }, i) ?? Infinity
    })
    mejor = Math.min(mejor, total)
  }
  return mejor
}

/**
 * Tríos conectados ortogonalmente: con la regla de adyacencia de GDD §6.2 (cada compra tras
 * la primera es vecina de alguna propia) cualquier trío conectado se puede comprar en algún orden.
 */
function triosConectados(lado: number): number[][] {
  const vistos = new Set<string>()
  const res: number[][] = []
  for (let i = 0; i < lado * lado; i++)
    for (const j of vecinos(i, lado))
      for (const k of [...vecinos(i, lado), ...vecinos(j, lado)]) {
        if (k === i || k === j) continue
        const trio = [i, j, k].sort((x, y) => x - y)
        const clave = trio.join(',')
        if (!vistos.has(clave)) {
          vistos.add(clave)
          res.push(trio)
        }
      }
  return res
}

const valido = (o: unknown) => v.safeParse(EsquemaConfigEconomia, o).success
type Mutable = Record<string, unknown> & {
  factorTerreno: Record<string, unknown>
  factorFertilidad: Record<string, unknown>
  factorAgua: Record<string, unknown>
}
const clonar = () => structuredClone(datos) as unknown as Mutable

// ---------------------------------------------------------------- balance

describe('balance con los valores reales (GDD §6.2: «alcanza para 1 o 2 parcelas»)', () => {
  it('[S2 corregido] en ninguna semilla los ahorros alcanzan para TRES parcelas contiguas', () => {
    // Ronda 1 (1300, +25 %): 260 + 320 + 410 = 990 cabía en 334 de 500 semillas.
    // Ronda 2 (1100, +40 %): el trío más barato posible ya cuesta 1130.
    const trios = triosConectados(BASE.valle.parcelasPorLado)
    const conTres: Array<{ semilla: number; trio: number[]; coste: number }> = []
    for (let semilla = 0; semilla < 60; semilla++) {
      const e = crearEstadoInicial({ semilla })
      for (const t of trios) {
        const coste = costeMinimo(e, t)
        if (coste <= e.dinero) {
          conTres.push({ semilla, trio: t, coste })
          break
        }
      }
    }
    expect(conTres.slice(0, 3)).toEqual([])
  })

  it('ni siquiera sin la regla de adyacencia caben tres (200 semillas)', () => {
    for (let semilla = 0; semilla < 200; semilla++) {
      const e = crearEstadoInicial({ semilla })
      const baratas = e.valle.parcelas
        .map((_, i) => i)
        .sort((a, b) => (precioParcela(e, a) ?? 0) - (precioParcela(e, b) ?? 0))
        .slice(0, 3)
      expect(costeMinimo(e, baratas)).toBeGreaterThan(e.dinero)
    }
  })

  it('umbral teórico: las tres más baratas posibles cuestan 260 + 360 + 510 = 1130 > ahorros', () => {
    const p = (n: number) => precioParcela(conParcela('rocoso', 'baja', 'seca', n), 0)
    expect([p(0), p(1), p(2)]).toEqual([260, 360, 510])
    expect(260 + 360 + 510).toBeGreaterThan(CONFIG_ECONOMIA.dineroInicial)
  })

  it('la más cara (1010) cabe sola, pero no con una segunda barata (1010 + 360 > ahorros)', () => {
    const cara = precioParcela(conParcela('prado', 'alta', 'rio', 0), 0) ?? Number.NaN
    const segunda = precioParcela(conParcela('rocoso', 'baja', 'seca', 1), 0) ?? Number.NaN
    expect(cara).toBeLessThanOrEqual(CONFIG_ECONOMIA.dineroInicial)
    expect(cara + segunda).toBeGreaterThan(CONFIG_ECONOMIA.dineroInicial)
  })

  it('en todas las semillas se pueden comprar al menos dos parcelas contiguas (300 semillas)', () => {
    for (let semilla = 0; semilla < 300; semilla++) {
      const e = crearEstadoInicial({ semilla })
      const L = e.valle.parcelasPorLado
      let dos = false
      for (let i = 0; i < L * L && !dos; i++)
        for (const j of vecinos(i, L)) if (costeMinimo(e, [i, j]) <= e.dinero) dos = true
      expect(dos).toBe(true)
    }
  })

  it('nunca alcanzan para cuatro (ni sin adyacencia)', () => {
    for (let semilla = 0; semilla < 200; semilla++) {
      const e = crearEstadoInicial({ semilla })
      const baratas = e.valle.parcelas
        .map((_, i) => i)
        .sort((a, b) => (precioParcela(e, a) ?? 0) - (precioParcela(e, b) ?? 0))
        .slice(0, 4)
      expect(costeMinimo(e, baratas)).toBeGreaterThan(e.dinero)
    }
  })

  it('primera parcela en 260–1010 y siempre alguna asequible (300 semillas)', () => {
    for (const [t, f, a] of combinaciones) {
      const p = precioParcela(conParcela(t, f, a, 0), 0) ?? Number.NaN
      expect(p).toBeGreaterThanOrEqual(260)
      expect(p).toBeLessThanOrEqual(1010)
    }
    for (let semilla = 0; semilla < 300; semilla++) {
      const e = crearEstadoInicial({ semilla })
      expect(e.dinero).toBe(CONFIG_ECONOMIA.dineroInicial)
      const min = Math.min(...e.valle.parcelas.map((_, i) => precioParcela(e, i) ?? Infinity))
      expect(min).toBeLessThanOrEqual(e.dinero)
    }
  })
})

// ---------------------------------------------------------------- redondeo

describe('redondeo y precisión', () => {
  it('coincide con la aritmética exacta (mitades hacia arriba): 27 combinaciones × 60 compras', () => {
    for (const [t, f, a] of combinaciones)
      for (let n = 0; n < 60; n++) {
        const p = precioParcela(conParcela(t, f, a, n), 0) ?? Number.NaN
        expect(Number.isSafeInteger(p)).toBe(true)
        expect(BigInt(p)).toBe(precioExacto(t, f, a, n))
      }
  })

  it('[S3] las mitades exactas suben aunque 1,4 no sea representable en binario', () => {
    // 175 × 1,4 = 244,99999999999997 en coma flotante → 240 en vez de 250. Con los datos reales
    // de hoy no ocurre (27 × 60 casos exactos), pero sí con datos plausibles: base 250, prado·
    // media·río, 1 compra → 450 en vez de 460; base 750, prado·media·seca, 1 compra → 940 (950).
    // 7 de 103 140 casos con bases 100–2000 de 10 en 10 y hasta 19 compras.
    // Con los datos reales: las mitades exactas (si las hay) de 27 combinaciones × 60 compras.
    for (const [t, f, a] of combinaciones)
      for (let n = 0; n < 60; n++) {
        const { num, den } = valorExacto(t, f, a, n)
        if (num % (10n * den) === 5n * den)
          expect(BigInt(precioParcela(conParcela(t, f, a, n), 0) ?? 0)).toBe(
            precioExacto(t, f, a, n),
          )
      }
    // Bases b ≡ 25 (mód 50) dan b × 1,4 ≡ 5 (mód 10) exacto: 25 → 35 → 40, 75 → 105 → 110…
    const malos: Array<[number, number | undefined]> = []
    for (let b = 25; b <= 20_000; b += 50) {
      const cfg: ConfigEconomia = {
        ...CONFIG_ECONOMIA,
        precioBase: b,
        factorTerreno: { prado: 1, bosque: 1, rocoso: 1 },
        factorFertilidad: { baja: 1, media: 1, alta: 1 },
        factorAgua: { rio: 1, pozo: 1, seca: 1 },
        subidaPorCompra: 0.4,
      }
      const p = precioParcela({ valle: BASE.valle, comprasHechas: 1 }, 0, cfg)
      const esperado = ((b * 14) / 10 + 5) / 10 // entero exacto: (b·1,4 + 5) / 10
      if (p !== esperado * 10) malos.push([b, p])
    }
    expect(malos.slice(0, 5)).toEqual([])
  })

  it('propiedad: en todo el rango del esquema el precio es undefined o entero seguro ≥ 10 múltiplo de 10; sin compras siempre existe', () => {
    const factor = fc.double({ min: Number.MIN_VALUE, max: 1000, noNaN: true })
    const config = fc.record({
      dineroInicial: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
      precioBase: fc.integer({ min: 1, max: 1_000_000 }),
      factorTerreno: fc.record({ prado: factor, bosque: factor, rocoso: factor }),
      factorFertilidad: fc.record({ baja: factor, media: factor, alta: factor }),
      factorAgua: fc.record({ rio: factor, pozo: factor, seca: factor }),
      subidaPorCompra: fc.double({ min: 0, max: 10, noNaN: true }),
    })
    fc.assert(
      fc.property(config, fc.integer({ min: 0, max: 5000 }), fc.nat(35), (cfg, n, i) => {
        expect(valido(cfg)).toBe(true)
        const c = cfg as ConfigEconomia
        const p = precioParcela({ valle: BASE.valle, comprasHechas: n }, i, c)
        if (p !== undefined) {
          expect(Number.isSafeInteger(p)).toBe(true)
          expect(p % 10).toBe(0)
          expect(p).toBeGreaterThanOrEqual(10)
        }
        expect(precioParcela({ valle: BASE.valle, comprasHechas: 0 }, i, c)).toBeDefined()
      }),
      { numRuns: 1000 },
    )
  })

  it('justo en los topes del esquema: sin compras 1e15 (entero seguro); con muchas, undefined', () => {
    const tope: ConfigEconomia = {
      ...CONFIG_ECONOMIA,
      precioBase: 1_000_000,
      factorTerreno: { prado: 1000, bosque: 1000, rocoso: 1000 },
      factorFertilidad: { baja: 1000, media: 1000, alta: 1000 },
      factorAgua: { rio: 1000, pozo: 1000, seca: 1000 },
      subidaPorCompra: 10,
    }
    expect(valido(tope)).toBe(true)
    expect(precioParcela({ valle: BASE.valle, comprasHechas: 0 }, 0, tope)).toBe(1e15)
    // 1e15 × 11 = 1,1e16 > MAX_SAFE_INTEGER: ya no es un entero seguro.
    expect(precioParcela({ valle: BASE.valle, comprasHechas: 1 }, 0, tope)).toBeUndefined()
    expect(precioParcela({ valle: BASE.valle, comprasHechas: 400 }, 0, tope)).toBeUndefined()
    for (const malo of [
      { ...tope, precioBase: 1_000_001 },
      { ...tope, subidaPorCompra: 10.000001 },
      { ...tope, factorAgua: { ...tope.factorAgua, rio: 1000.0001 } },
    ])
      expect(valido(malo)).toBe(false)
  })

  it('comprasHechas -0 y MAX_SAFE_INTEGER no revientan (precio o undefined, nunca NaN/Infinity)', () => {
    expect(precioParcela({ valle: BASE.valle, comprasHechas: -0 }, 0)).toBe(
      precioParcela({ valle: BASE.valle, comprasHechas: 0 }, 0),
    )
    expect(
      precioParcela({ valle: BASE.valle, comprasHechas: Number.MAX_SAFE_INTEGER }, 0),
    ).toBeUndefined()
    expect(
      precioParcela({ valle: BASE.valle, comprasHechas: '1' as unknown as number }, 0),
    ).toBeUndefined()
  })

  it('propiedad: con config válida razonable el precio es entero ≥ 10, múltiplo de 10 y no decrece', () => {
    const factor = fc.double({ min: 0.01, max: 5, noNaN: true })
    const config = fc.record({
      dineroInicial: fc.integer({ min: 0, max: 1e6 }),
      precioBase: fc.integer({ min: 1, max: 1e5 }),
      factorTerreno: fc.record({ prado: factor, bosque: factor, rocoso: factor }),
      factorFertilidad: fc.record({ baja: factor, media: factor, alta: factor }),
      factorAgua: fc.record({ rio: factor, pozo: factor, seca: factor }),
      subidaPorCompra: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    // Hasta 20 compras: 1e5 × 5³ × 2^21 ≈ 2,6e13 sigue siendo entero seguro (con más, undefined es legítimo).
    fc.assert(
      fc.property(config, fc.integer({ min: 0, max: 20 }), fc.nat(35), (cfg, n, i) => {
        expect(valido(cfg)).toBe(true)
        const c = cfg as ConfigEconomia
        const e = { valle: BASE.valle, comprasHechas: n }
        const p = precioParcela(e, i, c) ?? Number.NaN
        const q = precioParcela({ ...e, comprasHechas: n + 1 }, i, c) ?? Number.NaN
        expect(Number.isSafeInteger(p)).toBe(true)
        expect(p % 10).toBe(0)
        expect(p).toBeGreaterThanOrEqual(10)
        expect(q).toBeGreaterThanOrEqual(p)
      }),
      { numRuns: 500 },
    )
  })

  it('con 35 compras (máximo en un valle 6×6) el precio sigue siendo un entero seguro', () => {
    const p = precioParcela(conParcela('prado', 'alta', 'rio', 35), 0) ?? Number.NaN
    expect(Number.isSafeInteger(p)).toBe(true)
  })

  it('[S3 corregido] con comprasHechas corrupto (negativo, fraccionario, NaN, enorme) da undefined', () => {
    // Un guardado manipulado (M7): -1 abarata (300 en vez de 600), 1.5 da 520, NaN → NaN,
    // 3200 → Infinity. Debería devolver undefined (como con un índice inválido) o rechazarse.
    const malos = [-1, -100, 1.5, Number.NaN, 3200, Infinity]
    const resultados = malos.map((n) => precioParcela({ valle: BASE.valle, comprasHechas: n }, 0))
    expect(resultados).toEqual(malos.map(() => undefined))
  })
})

// ---------------------------------------------------------------- índices

describe('índices', () => {
  it('-0 es el índice 0; fuera de rango, decimales, NaN e infinitos dan undefined', () => {
    expect(precioParcela(BASE, -0)).toBe(precioParcela(BASE, 0))
    const n = BASE.valle.parcelas.length
    for (const i of [
      -1,
      n,
      2 ** 53,
      -(2 ** 53),
      1e21,
      0.5,
      -0.5,
      1 + 1e-10,
      NaN,
      -Infinity,
      Infinity,
    ])
      expect(precioParcela(BASE, i)).toBeUndefined()
  })

  it('índices que no son number (string, null, objeto, booleano) no devuelven precio', () => {
    for (const i of ['0', '1', null, undefined, {}, [0], true])
      expect(precioParcela(BASE, i as unknown as number)).toBeUndefined()
  })

  it('el estado de la parcela no cambia el precio; no muta la entrada; determinista', () => {
    const e = crearEstadoInicial({ semilla: 9 })
    const copia = structuredClone(e)
    const precios = e.valle.parcelas.map((_, i) => precioParcela(e, i))
    expect(e).toEqual(copia)
    expect(e.valle.parcelas.map((_, i) => precioParcela(e, i))).toEqual(precios)
    const propia = {
      ...e,
      valle: {
        ...e.valle,
        parcelas: e.valle.parcelas.map((p) => ({ ...p, estado: 'propia' as const })),
      },
    }
    expect(propia.valle.parcelas.map((_, i) => precioParcela(propia, i))).toEqual(precios)
  })
})

// ---------------------------------------------------------------- esquema

describe('esquema de economia.json', () => {
  const mutaciones: Array<[string, (o: Mutable) => void]> = [
    ['dineroInicial NaN', (o) => (o.dineroInicial = Number.NaN)],
    ['dineroInicial Infinity', (o) => (o.dineroInicial = Infinity)],
    ['dineroInicial string', (o) => (o.dineroInicial = '1300')],
    ['dineroInicial null', (o) => (o.dineroInicial = null)],
    ['precioBase decimal', (o) => (o.precioBase = 600.5)],
    ['precioBase negativo', (o) => (o.precioBase = -600)],
    ['subida NaN', (o) => (o.subidaPorCompra = Number.NaN)],
    ['subida Infinity', (o) => (o.subidaPorCompra = Infinity)],
    ['subida string', (o) => (o.subidaPorCompra = '0.25')],
    ['factor NaN', (o) => (o.factorTerreno.prado = Number.NaN)],
    ['factor Infinity', (o) => (o.factorFertilidad.alta = Infinity)],
    ['factor -0', (o) => (o.factorAgua.pozo = -0)],
    ['factor string', (o) => (o.factorAgua.rio = '1.3')],
    ['factor booleano', (o) => (o.factorAgua.rio = true)],
    ['clave extra en factores', (o) => (o.factorTerreno.pantano = 1)],
    ['factores como array', (o) => (o.factorAgua = [1.3, 1.1, 0.9] as never)],
    ['falta dineroInicial', (o) => delete o.dineroInicial],
    ['falta precioBase', (o) => delete o.precioBase],
    ['falta factorAgua', (o) => delete (o as Record<string, unknown>).factorAgua],
  ]
  for (const [nombre, mutar] of mutaciones)
    it(`rechaza: ${nombre}`, () => {
      const o = clonar()
      mutar(o)
      expect(valido(o)).toBe(false)
    })

  it('[S3 corregido] rechaza ahorros y precio base que no son enteros seguros (1e300, 2^60)', () => {
    // v.integer() usa Number.isInteger, que es true para 1e300: el dinero deja de ser exacto.
    const o1 = clonar()
    o1.dineroInicial = 1e300
    const o2 = clonar()
    o2.precioBase = 2 ** 60
    expect([valido(o1), valido(o2)]).toEqual([false, false])
  })

  it('[S3 corregido] ninguna config que acepta el esquema produce un precio no finito', () => {
    // precioBase 1e308 pasa el esquema; × 1,3 × 1,3 = Infinity.
    const o = clonar()
    o.precioBase = 1e308
    const aceptada = valido(o)
    const p = precioParcela(
      conParcela('prado', 'alta', 'rio', 0),
      0,
      o as unknown as ConfigEconomia,
    )
    expect({ aceptada, p }).toEqual({ aceptada: false, p })
  })
})

// ---------------------------------------------------------------- partida nueva

describe('partida nueva', () => {
  it('dineroInicial explícitamente undefined usa el de los datos; comprasHechas empieza en 0', () => {
    const e = crearEstadoInicial({ semilla: 4, dineroInicial: undefined } as never)
    expect(e.dinero).toBe(datos.dineroInicial)
    expect(e.comprasHechas).toBe(0)
  })

  it('[S3 corregido] crearEstadoInicial rechaza ahorros negativos, fraccionarios o no finitos', () => {
    // minutoInicial sí se valida (lanza); dineroInicial se copia tal cual.
    const malos = [-500, 0.5, Number.NaN, Infinity]
    const aceptados = malos.filter((d) => {
      try {
        crearEstadoInicial({ semilla: 1, dineroInicial: d })
        return true
      } catch {
        return false
      }
    })
    expect(aceptados).toEqual([])
  })

  it('la capa de juego ya no fija los ahorros (usa los de los datos)', () => {
    const raiz = resolve(import.meta.dirname, '../..')
    for (const f of ['src/game/juego.ts', 'src/game/scenes/EscenaValle.ts'])
      expect(readFileSync(join(raiz, f), 'utf8')).not.toMatch(/dineroInicial/)
  })

  it('economia.ts y datos/economia.ts no usan APIs prohibidas (ADR 0004)', () => {
    const raiz = resolve(import.meta.dirname, '../..')
    for (const f of ['src/core/economia.ts', 'src/core/datos/economia.ts']) {
      const src = readFileSync(join(raiz, f), 'utf8')
      expect(src).not.toMatch(
        /Math\.random|\bDate\b|performance\.|window|document|phaser|localStorage/i,
      )
    }
  })
})

// ---------------------------------------------------------------- plugin de build

describe('plugin de build: valida data/economia.json', () => {
  function correr(p: Plugin) {
    const hook = p.buildStart as (this: unknown) => void
    hook.call({
      error(m: string) {
        throw new Error(m)
      },
    })
  }
  function conEconomia<T>(contenido: string, fn: (ruta: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'raices-rompedor-eco-'))
    const ruta = join(dir, 'economia.json')
    writeFileSync(ruta, contenido)
    try {
      return fn(ruta)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('acepta los datos reales con las rutas por defecto', () => {
    expect(() => correr(validarDatos())).not.toThrow()
  })

  it('aborta con un economia.json inválido aunque valle.json sea válido', () => {
    for (const malo of [
      { ...datos, dineroInicial: -1 },
      { ...datos, factorAgua: { rio: 1.3, pozo: 1.1 } },
      { ...datos, subidaPorCompra: '0.25' },
      { ...datos, extra: true },
    ])
      expect(() =>
        conEconomia(JSON.stringify(malo), (r) => correr(validarDatos(undefined, r))),
      ).toThrow(/economia\.json inválido/)
  })

  it('aborta con un economia.json que no es JSON o no existe', () => {
    expect(() => conEconomia('{ roto', (r) => correr(validarDatos(undefined, r)))).toThrow()
    expect(() =>
      correr(validarDatos(undefined, join(tmpdir(), 'no-existe-economia-rompedor.json'))),
    ).toThrow()
  })
})
