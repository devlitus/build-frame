/** Rompedor · M1-02 Dibujar el valle. Ataques a parámetros de URL, geometría de dibujo y río. */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { crearEstadoInicial } from '../../src/core'
import { leerParametros } from '../../src/game/parametros'
import { marcarPropias } from '../../src/game/valle/debug'
import { decorarValle } from '../../src/game/valle/decoracion'
import { dibujarDecoracion } from '../../src/game/valle/dibujar'
import { TAM_CASILLA } from '../../src/game/valle/estilo'
import { casillasRio, claveCasilla } from '../../src/game/valle/rio'

describe('leerParametros (URL rara)', () => {
  it.each(['?semilla=abc', '?semilla=', '?semilla=-5', '?semilla=3.5', '?semilla=1e3', '?semilla'])(
    '%s no fija semilla',
    (q) => {
      expect(leerParametros(q).semilla).toBeUndefined()
    },
  )
  it('semilla enorme (no segura) se ignora', () => {
    expect(leerParametros('?semilla=99999999999999999999').semilla).toBeUndefined()
  })
  it('semilla repetida: usa la primera', () => {
    expect(leerParametros('?semilla=1&semilla=2').semilla).toBe(1)
  })
  it('propias sin debug se ignora', () => {
    expect(leerParametros('?semilla=1&propias=0,1').propias).toEqual([])
  })
  it('propias con basura conserva solo los enteros', () => {
    expect(leerParametros('?debug&propias=0,x,,-1,2.5,3,3').propias).toEqual([0, 3])
  })
  it('[S3] semilla >= 2^32 no debe aliasarse silenciosamente a otra semilla', () => {
    // 4294967296 se convierte en 0 por `>>> 0`: dos URLs distintas dan el mismo valle.
    const p = leerParametros('?semilla=4294967296').semilla
    expect(p === undefined || p !== 0).toBe(true)
  })
  it('nunca lanza y la semilla siempre es uint32', () => {
    fc.assert(
      fc.property(fc.string(), (q) => {
        const r = leerParametros('?' + q)
        if (r.semilla !== undefined) {
          expect(Number.isInteger(r.semilla) && r.semilla >= 0 && r.semilla <= 0xffffffff).toBe(
            true,
          )
        }
      }),
      { numRuns: 500 },
    )
  })
})

describe('marcarPropias', () => {
  it('ignora fuera de rango y no muta el original', () => {
    const { valle } = crearEstadoInicial({ semilla: 5, dineroInicial: 0 })
    const m = marcarPropias(valle, [-1, 999, 0])
    expect(m.parcelas.filter((p) => p.estado === 'propia')).toHaveLength(1)
    expect(valle.parcelas.every((p) => p.estado === 'en-venta')).toBe(true)
  })
})

describe('río y decoración en muchas semillas', () => {
  it('río dentro de parcelas de agua «rio»; decoración fuera del río y dentro del mundo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (semilla) => {
        const { valle } = crearEstadoInicial({ semilla, dineroInicial: 0 })
        const cp = valle.casillasPorParcela
        const lado = valle.parcelasPorLado * cp
        const rio = casillasRio(valle)
        const claves = new Set(rio.map((c) => claveCasilla(lado, c.x, c.y)))
        for (const c of rio) {
          expect(c.x >= 0 && c.y >= 0 && c.x < lado && c.y < lado).toBe(true)
          const i = Math.floor(c.y / cp) * valle.parcelasPorLado + Math.floor(c.x / cp)
          expect(valle.parcelas[i]?.agua).toBe('rio')
        }
        for (const d of decorarValle(valle, semilla, claves)) {
          expect(claves.has(claveCasilla(lado, d.x, d.y))).toBe(false)
          expect(d.x >= 0 && d.y >= 0 && d.x < lado && d.y < lado).toBe(true)
          expect(d.variante >= 0 && d.variante < 1).toBe(true)
        }
      }),
      { numRuns: 300 },
    )
  })
})

describe('geometría del dibujo', () => {
  it('[S3] ninguna forma de la decoración se sale de su casilla', () => {
    const formas: { x: number; y: number }[] = []
    const g: Record<string, unknown> = {}
    const chain = () => g
    Object.assign(g, {
      fillStyle: chain,
      lineStyle: chain,
      strokePoints: chain,
      setDepth: chain,
      fillRect: (x: number, y: number, w: number, h: number) => {
        formas.push({ x, y }, { x: x + w, y: y + h })
      },
      fillCircle: (x: number, y: number, r: number) => {
        formas.push({ x: x - r, y: y - r }, { x: x + r, y: y + r })
      },
      fillTriangle: (a: number, b: number, c: number, d: number, e: number, f: number) => {
        formas.push({ x: a, y: b }, { x: c, y: d }, { x: e, y: f })
      },
      fillPoints: (pts: { x: number; y: number }[]) => formas.push(...pts),
    })
    const escena = { add: { graphics: () => g } }
    let fuera = 0
    const tipos = new Set<string>()
    for (const sem of [1, 2, 3, 42, 7, 99]) {
      const est = crearEstadoInicial({ semilla: sem, dineroInicial: 0 }).valle
      const lado = est.parcelasPorLado * est.casillasPorParcela
      const claves = new Set(casillasRio(est).map((c) => claveCasilla(lado, c.x, c.y)))
      for (const d of decorarValle(est, sem, claves)) {
        formas.length = 0
        dibujarDecoracion(escena as never, [d])
        const x0 = d.x * TAM_CASILLA
        const y0 = d.y * TAM_CASILLA
        const sale = formas.some(
          (p) => p.x < x0 || p.x > x0 + TAM_CASILLA || p.y < y0 || p.y > y0 + TAM_CASILLA,
        )
        if (sale) {
          fuera++
          tipos.add(d.tipo + (d.variante < 0.5 ? 'A' : 'B'))
        }
      }
    }
    expect({ fuera, tipos: [...tipos] }).toEqual({ fuera: 0, tipos: [] })
  })
})

describe('core sin DOM ni crypto', () => {
  it('ningún fichero de src/core usa crypto, window, document, Date ni Math.random', () => {
    const malos: string[] = []
    const prohibido = /\b(crypto|window|document|Date\.now|Math\.random|new Date)\b/
    const recorre = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const ruta = join(dir, f)
        if (statSync(ruta).isDirectory()) recorre(ruta)
        else if (f.endsWith('.ts') && prohibido.test(readFileSync(ruta, 'utf8'))) malos.push(ruta)
      }
    }
    recorre('src/core')
    expect(malos).toEqual([])
  })
})
