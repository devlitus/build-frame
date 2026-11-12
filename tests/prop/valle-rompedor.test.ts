/**
 * Rompedor · M1-01 Modelo del valle en el núcleo.
 * Ataques sobre generarValle / crearEstadoInicial / EsquemaConfigValle / plugin de build.
 * Los tests marcados con [Sx corregido] demostraron un defecto; hoy pasan y quedan como regresión.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import * as v from 'valibot'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { validarDatos } from '../../vite.config'
import {
  CONFIG_VALLE,
  EsquemaConfigValle,
  VERSION_FORMATO,
  crearEstadoInicial,
  generarValle,
  siguienteAleatorio,
  type ConfigValle,
  type Valle,
} from '../../src/core'
import datos from '../../data/valle.json'

// ---------------------------------------------------------------- utilidades

/** Comprueba todas las invariantes estructurales del valle. Devuelve el motivo del fallo o null. */
function invariantes(valle: Valle, config: ConfigValle): string | null {
  const n = config.parcelasPorLado
  if (valle.parcelasPorLado !== n) return 'parcelasPorLado distinto de la config'
  if (valle.casillasPorParcela !== config.casillasPorParcela) return 'casillasPorParcela distinto'
  if (valle.parcelas.length !== n * n) return `faltan parcelas: ${valle.parcelas.length}`
  for (let i = 0; i < valle.parcelas.length; i++) {
    const p = valle.parcelas[i]
    if (!p) return `hueco en ${i}`
    if (p.fila * n + p.columna !== i) return `índice incoherente en ${i}`
    if (p.estado !== 'en-venta') return `estado inicial ${p.estado}`
    if (!['prado', 'bosque', 'rocoso'].includes(p.terreno)) return `terreno ${p.terreno}`
    if (!['baja', 'media', 'alta'].includes(p.fertilidad)) return `fertilidad ${p.fertilidad}`
    if (!['rio', 'pozo', 'seca'].includes(p.agua)) return `agua ${p.agua}`
  }
  const rio = valle.rio
  if (rio.length < n) return `río demasiado corto: ${rio.length}`
  if (new Set(rio).size !== rio.length) return 'índices duplicados en rio'
  for (const i of rio) if (!Number.isInteger(i) || i < 0 || i >= n * n) return `índice ${i} fuera`
  const rc = rio.map((i) => [Math.floor(i / n), i % n] as const)
  for (let k = 1; k < rc.length; k++) {
    const a = rc[k - 1] ?? [-9, -9]
    const b = rc[k] ?? [-9, -9]
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return `río discontinuo en ${k}`
  }
  const f = rc.map((x) => x[0])
  const c = rc.map((x) => x[1])
  const vert = f[0] === 0 && f[f.length - 1] === n - 1
  const hori = c[0] === 0 && c[c.length - 1] === n - 1
  if (!vert && !hori) return 'el río no va de borde a borde opuesto'
  const set = new Set(rio)
  for (let i = 0; i < valle.parcelas.length; i++) {
    if ((valle.parcelas[i]?.agua === 'rio') !== set.has(i)) return `agua/rio incoherente en ${i}`
  }
  return null
}

const peso = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 0, max: 10 }),
  fc.double({ min: 0.001, max: 100, noNaN: true }), // los subnormales se atacan aparte (tests [S3 corregido])
)
const pesos3 = <K extends string>(a: K, b: K, c: K) =>
  fc
    .record({ [a]: peso, [b]: peso, [c]: peso } as Record<K, fc.Arbitrary<number>>)
    .filter((o) => Object.values<number>(o).reduce((x, y) => x + y, 0) > 0)

/** Configs válidas según el esquema, incluidas las degeneradas (lado 1-2, ceros, p ∈ {0,1}). */
const configArb: fc.Arbitrary<ConfigValle> = fc.record({
  parcelasPorLado: fc.oneof(fc.constantFrom(1, 2, 3), fc.integer({ min: 1, max: 40 })),
  casillasPorParcela: fc.integer({ min: 1, max: 64 }),
  pesosTerreno: pesos3('prado', 'bosque', 'rocoso'),
  pesosFertilidad: fc.record({
    prado: pesos3('baja', 'media', 'alta'),
    bosque: pesos3('baja', 'media', 'alta'),
    rocoso: pesos3('baja', 'media', 'alta'),
  }),
  pesosAguaSinRio: fc.record({ pozo: peso, seca: peso }).filter((o) => o.pozo + o.seca > 0),
  probabilidadDesvioRio: fc.oneof(
    fc.constantFrom(0, 1),
    fc.double({ min: 0, max: 1, noNaN: true }),
  ),
}) as fc.Arbitrary<ConfigValle>

const semillaArb = fc.oneof(
  fc.constantFrom(0, 1, 2 ** 32 - 1, 2 ** 31, -1, -(2 ** 31)),
  fc.integer({ min: 0, max: 2 ** 32 - 1 }),
)

// ---------------------------------------------------------------- generación

describe('rompedor · generación con configs degeneradas pero válidas', () => {
  it('toda config aceptada por el esquema genera un valle que cumple las invariantes', () => {
    fc.assert(
      fc.property(configArb, semillaArb, (config, s) => {
        expect(v.safeParse(EsquemaConfigValle, config).success).toBe(true)
        const { valle } = generarValle(config, s >>> 0)
        expect(invariantes(valle, config)).toBeNull()
      }),
      { numRuns: 400 },
    )
  })

  it('una clave con peso 0 nunca sale (pesos finitos normales)', () => {
    fc.assert(
      fc.property(configArb, semillaArb, (config, s) => {
        const { valle } = generarValle(config, s >>> 0)
        for (const p of valle.parcelas) {
          expect(config.pesosTerreno[p.terreno]).toBeGreaterThan(0)
          expect(config.pesosFertilidad[p.terreno][p.fertilidad]).toBeGreaterThan(0)
          if (p.agua !== 'rio') expect(config.pesosAguaSinRio[p.agua]).toBeGreaterThan(0)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('probabilidad de desvío 0 ⇒ río recto de longitud n; 1 ⇒ longitud 2n', () => {
    for (const n of [1, 2, 3, 6, 17]) {
      for (let s = 0; s < 50; s++) {
        const recto = generarValle(
          { ...CONFIG_VALLE, parcelasPorLado: n, probabilidadDesvioRio: 0 },
          s,
        )
        expect(recto.valle.rio).toHaveLength(n)
        const zig = generarValle(
          { ...CONFIG_VALLE, parcelasPorLado: n, probabilidadDesvioRio: 1 },
          s,
        )
        expect(zig.valle.rio).toHaveLength(n === 1 ? 1 : 2 * n)
        expect(invariantes(zig.valle, { ...CONFIG_VALLE, parcelasPorLado: n })).toBeNull()
      }
    }
  })

  it('lado grande (200) termina rápido y cumple invariantes', () => {
    const config = { ...CONFIG_VALLE, parcelasPorLado: 200 }
    const t0 = performance.now()
    const { valle } = generarValle(config, 12345)
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(invariantes(valle, config)).toBeNull()
  })

  it('el río tiene ambas orientaciones y arranca en todas las posiciones laterales', () => {
    const n = CONFIG_VALLE.parcelasPorLado
    const inicios = new Set<string>()
    for (let s = 0; s < 2000; s++) {
      const { valle } = generarValle(CONFIG_VALLE, s * 2654435761)
      const i = valle.rio[0] ?? -1
      inicios.add(`${Math.floor(i / n)},${i % n}`)
    }
    // vertical arranca en fila 0 (n posiciones), horizontal en columna 0 (n posiciones), (0,0) compartido
    expect(inicios.size).toBe(2 * n - 1)
  })
})

// ---------------------------------------------------------------- estado

describe('rompedor · crearEstadoInicial', () => {
  const extremas = [0, 1, 2 ** 32 - 1, 2 ** 32, -1, -(2 ** 31), 0.5, -0.5, 1e20, NaN, Infinity]

  it.each(extremas)('semilla extrema %s: no rompe y deja un valle válido', (s) => {
    const e = crearEstadoInicial({ semilla: s, dineroInicial: 0 })
    expect(e.versionFormato).toBe(3)
    expect(VERSION_FORMATO).toBe(3)
    expect(Number.isInteger(e.semilla)).toBe(true)
    expect(e.semilla).toBeGreaterThanOrEqual(0)
    expect(e.semilla).toBeLessThan(2 ** 32)
    expect(Number.isInteger(e.rng)).toBe(true)
    expect(e.rng).not.toBe(e.semilla)
    expect(invariantes(e.valle, CONFIG_VALLE)).toBeNull()
    // reproducible a partir de la semilla guardada
    expect(crearEstadoInicial({ semilla: e.semilla, dineroInicial: 0 })).toEqual(e)
  })

  it('el estado es JSON puro: ida y vuelta idéntica', () => {
    fc.assert(
      fc.property(semillaArb, (s) => {
        const e = crearEstadoInicial({ semilla: s, dineroInicial: 100 })
        expect(JSON.parse(JSON.stringify(e))).toStrictEqual(e)
      }),
      { numRuns: 200 },
    )
  })

  it('generarValle no muta la config ni comparte referencias con ella', () => {
    const config = structuredClone(CONFIG_VALLE) as ConfigValle
    const copia = structuredClone(config)
    const a = generarValle(config, 99)
    expect(config).toEqual(copia)
    // mutar el valle devuelto no altera una nueva generación
    ;(a.valle.parcelas as unknown as { terreno: string }[])[0] = { terreno: 'X' }
    ;(a.valle.rio as number[]).push(-1)
    const b = generarValle(config, 99)
    expect(b.valle.parcelas[0]?.terreno).not.toBe('X')
    expect(b.valle.rio).not.toContain(-1)
  })

  it('el rng que devuelve generarValle continúa la secuencia (no se reutiliza la semilla)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (s) => {
        const { estadoRng } = generarValle(CONFIG_VALLE, s)
        const n = CONFIG_VALLE.parcelasPorLado
        let r = s
        let k = 0
        while (r !== estadoRng && k < 1000) {
          r = siguienteAleatorio(r).estadoRng
          k++
        }
        // río: orientación + inicio + 1 por fila; parcelas: terreno + fertilidad (+ agua)
        expect(r).toBe(estadoRng)
        expect(k).toBeGreaterThanOrEqual(2 + n + 2 * n * n)
      }),
    )
  })
})

// ---------------------------------------------------------------- esquema

describe('rompedor · el esquema no debe aceptar configs que rompen la generación', () => {
  // JSON.parse('1e999') === Infinity: es expresable en data/valle.json.
  it('[S3 corregido] rechaza pesos infinitos (1e999 en JSON)', () => {
    const json: unknown = JSON.parse(JSON.stringify(datos).replace('"prado":5', '"prado":1e999'))
    expect((json as ConfigValle).pesosTerreno.prado).toBe(Infinity)
    expect(v.safeParse(EsquemaConfigValle, json).success).toBe(false)
  })

  it('[S3 corregido] pesos enormes pero finitos cuya suma desborda no fuerzan la última clave', () => {
    // Todos válidos para el esquema; la suma da Infinity y elegirPonderado siempre cae en la última clave.
    const config: ConfigValle = {
      ...CONFIG_VALLE,
      pesosTerreno: { prado: 1e308, bosque: 1e308, rocoso: 1e308 },
    }
    expect(v.safeParse(EsquemaConfigValle, config).success).toBe(true)
    const terrenos = new Set<string>()
    for (let s = 0; s < 50; s++)
      for (const p of generarValle(config, s).valle.parcelas) terrenos.add(p.terreno)
    expect([...terrenos].sort()).toEqual(['bosque', 'prado', 'rocoso'])
  })

  it('[S3 corregido] una clave con peso 0 nunca sale, aunque el otro peso sea diminuto', () => {
    // 5e-324 es un número JSON válido > 0; r * total se redondea a 5e-324 y se elige "seca" (peso 0).
    const config: ConfigValle = { ...CONFIG_VALLE, pesosAguaSinRio: { pozo: 5e-324, seca: 0 } }
    expect(v.safeParse(EsquemaConfigValle, config).success).toBe(true)
    for (let s = 0; s < 20; s++) {
      for (const p of generarValle(config, s).valle.parcelas) expect(p.agua).not.toBe('seca')
    }
  })

  it('[S3 corregido] rechaza tamaños absurdos que colgarían la generación', () => {
    // parcelasPorLado = 1e6 ⇒ 1e12 parcelas: el esquema lo acepta y generarValle se cuelga / agota memoria.
    for (const lado of [1e6, 2 ** 31, 1e300]) {
      expect(v.safeParse(EsquemaConfigValle, { ...datos, parcelasPorLado: lado }).success).toBe(
        false,
      )
    }
    expect(v.safeParse(EsquemaConfigValle, { ...datos, casillasPorParcela: 1e300 }).success).toBe(
      false,
    )
  })

  it('rechaza lado no entero, probabilidad > 1 o < 0, NaN, cadenas y claves extra', () => {
    const malos: unknown[] = [
      { ...datos, parcelasPorLado: 2.5 },
      { ...datos, parcelasPorLado: 0 },
      { ...datos, parcelasPorLado: '6' },
      { ...datos, probabilidadDesvioRio: 1.0000001 },
      { ...datos, probabilidadDesvioRio: -0.1 },
      { ...datos, probabilidadDesvioRio: NaN },
      { ...datos, pesosTerreno: { prado: 0, bosque: 0, rocoso: 0 } },
      {
        ...datos,
        pesosFertilidad: { ...datos.pesosFertilidad, rocoso: { baja: 0, media: 0, alta: 0 } },
      },
      { ...datos, pesosTerreno: { ...datos.pesosTerreno, prado: NaN } },
      { ...datos, extra: 1 },
      { ...datos, pesosAguaSinRio: { pozo: 1, seca: 1, rio: 1 } },
      null,
      [],
    ]
    for (const m of malos) expect(v.safeParse(EsquemaConfigValle, m).success).toBe(false)
  })
})

// ---------------------------------------------------------------- plugin de build

describe('rompedor · plugin validar-datos de vite.config.ts', () => {
  async function plugin(): Promise<Plugin> {
    const mod = (await import('../../vite.config')) as { default: { plugins: unknown[] } }
    const p = mod.default.plugins.flat(5).find((x) => (x as Plugin)?.name === 'validar-datos')
    expect(p).toBeDefined()
    return p as Plugin
  }
  const ctx = {
    error(msg: string): never {
      throw new Error(msg)
    },
  }
  const correr = (p: Plugin) => (p.buildStart as unknown as (this: typeof ctx) => void).call(ctx)

  function enDirectorio<T>(contenido: string | null, fn: () => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'raices-rompedor-'))
    if (contenido !== null) {
      mkdirSync(join(dir, 'data'))
      writeFileSync(join(dir, 'data', 'valle.json'), contenido)
    }
    const antes = process.cwd()
    process.chdir(dir)
    try {
      return fn()
    } finally {
      process.chdir(antes)
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('acepta el data/valle.json real', async () => {
    const p = await plugin()
    expect(() => correr(p)).not.toThrow()
  })

  // Ajuste del orquestador: el plugin recibe la ruta explícita en lugar de depender del cwd.
  function conArchivo<T>(contenido: string, fn: (ruta: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), 'raices-rompedor-'))
    const ruta = join(dir, 'valle.json')
    writeFileSync(ruta, contenido)
    try {
      return fn(ruta)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('aborta con un valle.json inválido según el esquema', () => {
    const malo = JSON.stringify({ ...datos, parcelasPorLado: 6.5 })
    expect(() => conArchivo(malo, (ruta) => correr(validarDatos(ruta)))).toThrow(
      /valle\.json inválido/,
    )
  })

  it('aborta con un valle.json que no es JSON', () => {
    expect(() => conArchivo('{ no es json', (ruta) => correr(validarDatos(ruta)))).toThrow()
  })

  it('[S3 corregido] valida el valle.json del proyecto aunque el build se lance desde otro directorio', async () => {
    // readFileSync('data/valle.json') es relativo al cwd, no a la raíz del proyecto:
    // `vite build <raíz>` desde otra carpeta lee otro archivo (o falla con ENOENT).
    const p = await plugin()
    const otroValido = JSON.stringify(datos)
    // Con un JSON ajeno (válido) en el cwd el plugin debería seguir validando el del proyecto: pasa igual,
    // pero sin ningún data/ en el cwd revienta con ENOENT en vez de validar el archivo real.
    expect(() => enDirectorio(otroValido, () => correr(p))).not.toThrow()
    expect(() => enDirectorio(null, () => correr(p))).not.toThrow()
  })
})
