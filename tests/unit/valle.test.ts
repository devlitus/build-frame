import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  CONFIG_VALLE,
  EsquemaConfigValle,
  crearEstadoInicial,
  generarValle,
  parcelaEn,
} from '../../src/core'
import datos from '../../data/valle.json'

const gen = (s: number) => generarValle(CONFIG_VALLE, s).valle

describe('generación del valle', () => {
  it('crea 6×6 parcelas de 16×16 desde data/valle.json', () => {
    const valle = gen(1)
    expect(valle.parcelasPorLado).toBe(6)
    expect(valle.casillasPorParcela).toBe(16)
    expect(valle.parcelas).toHaveLength(36)
    expect(valle.parcelas.every((p) => p.estado === 'en-venta')).toBe(true)
    expect(parcelaEn(valle, 2, 3)).toBe(valle.parcelas[15])
    expect(parcelaEn(valle, 6, 0)).toBeUndefined()
  })

  it('el estado inicial guarda el valle y avanza el RNG', () => {
    const e = crearEstadoInicial({ semilla: 7, dineroInicial: 0 })
    expect(e.valle).toEqual(gen(7))
    expect(e.rng).not.toBe(7)
  })

  it('el río es continuo (4-conexo) y cruza de borde a borde', () => {
    for (let s = 0; s < 300; s++) {
      const valle = gen(s * 7919)
      const n = valle.parcelasPorLado
      const rc = valle.rio.map((i) => [Math.floor(i / n), i % n] as const)
      for (let k = 1; k < rc.length; k++) {
        const [f0, c0] = rc[k - 1] ?? [-9, -9]
        const [f1, c1] = rc[k] ?? [-9, -9]
        expect(Math.abs(f0 - f1) + Math.abs(c0 - c1)).toBe(1)
      }
      const filas = rc.map((x) => x[0])
      const cols = rc.map((x) => x[1])
      const vertical = filas[0] === 0 && filas[filas.length - 1] === n - 1
      const horizontal = cols[0] === 0 && cols[cols.length - 1] === n - 1
      expect(vertical || horizontal).toBe(true)
      const set = new Set(valle.rio)
      expect(set.size).toBe(valle.rio.length)
      valle.parcelas.forEach((p, i) => expect(p.agua === 'rio').toBe(set.has(i)))
    }
  })

  it('todos los tipos aparecen en proporciones razonables', () => {
    const cuenta: Record<string, number> = {}
    let total = 0
    for (let s = 1; s <= 200; s++) {
      for (const p of gen(s * 104729).parcelas) {
        total++
        for (const k of [`t:${p.terreno}`, `f:${p.fertilidad}`, `a:${p.agua}`]) {
          cuenta[k] = (cuenta[k] ?? 0) + 1
        }
      }
    }
    const frac = (k: string) => (cuenta[k] ?? 0) / total
    // Esperado ≈ 0.5 / 0.3 / 0.2 para terreno, con tolerancia holgada.
    expect(frac('t:prado')).toBeGreaterThan(0.4)
    expect(frac('t:prado')).toBeLessThan(0.6)
    expect(frac('t:bosque')).toBeGreaterThan(0.2)
    expect(frac('t:bosque')).toBeLessThan(0.4)
    expect(frac('t:rocoso')).toBeGreaterThan(0.1)
    expect(frac('t:rocoso')).toBeLessThan(0.3)
    for (const k of ['f:baja', 'f:media', 'f:alta', 'a:rio', 'a:pozo', 'a:seca']) {
      expect(frac(k)).toBeGreaterThan(0.05)
    }
    expect(frac('a:rio')).toBeGreaterThan(0.15)
    expect(frac('a:rio')).toBeLessThan(0.3)
  })

  it('el terreno rocoso tiende a fertilidad baja', () => {
    let baja = 0
    let n = 0
    for (let s = 1; s <= 100; s++) {
      for (const p of gen(s).parcelas) {
        if (p.terreno === 'rocoso') {
          n++
          if (p.fertilidad === 'baja') baja++
        }
      }
    }
    expect(baja / n).toBeGreaterThan(0.5)
  })
})

describe('validación de data/valle.json', () => {
  it('el archivo real es válido', () => {
    expect(v.safeParse(EsquemaConfigValle, datos).success).toBe(true)
  })

  const invalidos: [string, unknown][] = [
    ['tamaño no entero', { ...datos, parcelasPorLado: 6.5 }],
    ['tamaño cero', { ...datos, casillasPorParcela: 0 }],
    ['peso negativo', { ...datos, pesosTerreno: { ...datos.pesosTerreno, prado: -1 } }],
    ['suma de pesos cero', { ...datos, pesosAguaSinRio: { pozo: 0, seca: 0 } }],
    ['falta una clave', { ...datos, pesosTerreno: { prado: 1, bosque: 1 } }],
    [
      'falta un terreno en fertilidad',
      { ...datos, pesosFertilidad: { prado: datos.pesosFertilidad.prado } },
    ],
    ['probabilidad fuera de rango', { ...datos, probabilidadDesvioRio: 2 }],
  ]
  it.each(invalidos)('rechaza: %s', (_n, json) => {
    expect(v.safeParse(EsquemaConfigValle, json).success).toBe(false)
  })
})
