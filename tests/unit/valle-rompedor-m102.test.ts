/** Rompedor · M1-02 Dibujar el valle. Ataques a parámetros de URL, geometría de dibujo y río. */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { crearEstadoInicial } from '../../src/core'
import { leerParametros } from '../../src/game/parametros'
import { marcarPropias } from '../../src/game/valle/debug'
import { escalaDecoracion, rectDecoracion } from '../../src/game/valle/terrenoArte'
import { TAM_CASILLA } from '../../src/game/valle/estilo'
import { casillasRio, claveCasilla, decorarValle } from '../../src/core'

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
  }, 20_000) // Ajuste del orquestador: ~3 s en solitario; con carga superaba los 5 s por defecto.
})

describe('geometría del dibujo', () => {
  // Desde M5-00 el árbol (64x96) y la roca (32x32) son sprites con el pivote en la base: el árbol
  // sobresale de su casilla por diseño. Lo que se exige es que la BASE caiga en su casilla, que
  // el sprite quede centrado en ella y que la escala esté en el rango de la variante.
  it('[S3] la base de cada sprite de decoración cae en su casilla y no se sale del valle por los lados', () => {
    let n = 0
    for (const sem of [1, 2, 3, 42, 7, 99]) {
      const est = crearEstadoInicial({ semilla: sem, dineroInicial: 0 }).valle
      const lado = est.parcelasPorLado * est.casillasPorParcela
      const claves = new Set(casillasRio(est).map((c) => claveCasilla(lado, c.x, c.y)))
      for (const d of decorarValle(est, sem, claves)) {
        const r = rectDecoracion(d)
        const x0 = d.x * TAM_CASILLA
        const y0 = d.y * TAM_CASILLA
        expect(r.y1).toBe(y0 + TAM_CASILLA)
        expect((r.x0 + r.x1) / 2).toBeCloseTo(x0 + TAM_CASILLA / 2, 6)
        const k = escalaDecoracion(d.variante)
        expect(k).toBeGreaterThanOrEqual(0.9)
        expect(k).toBeLessThanOrEqual(1.1)
        // Una roca no sobresale por los lados de su casilla más de lo que mide.
        if (d.tipo === 'roca') {
          expect(r.x1 - r.x0).toBeLessThanOrEqual(TAM_CASILLA * 1.1 + 1e-9)
        }
        n++
      }
    }
    expect(n).toBeGreaterThan(100)
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
