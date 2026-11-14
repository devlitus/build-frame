import { describe, expect, it, vi } from 'vitest'
import {
  escalaArte,
  factorDe,
  factorResolucion,
  mundoDePantalla,
  pantallaLogica,
  sufijoArte,
  tamanoLienzo,
  zoomLogico,
  type EscenaEscalable,
} from '../../src/game/resolucion'

describe('factorResolucion (CSS × min(DPR, 2))', () => {
  it.each([
    [1, 1],
    [1.5, 1.5],
    [2, 2],
    [2.625, 2],
    [3, 2],
    [0.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('DPR %f da factor %f', (dpr, esperado) => {
    expect(factorResolucion(dpr)).toBe(esperado)
  })
})

describe('arte @1x o @2x', () => {
  it('usa @2x a partir de DPR 1,5', () => {
    expect(escalaArte(1)).toBe(1)
    expect(escalaArte(1.49)).toBe(1)
    expect(escalaArte(1.5)).toBe(2)
    expect(escalaArte(3)).toBe(2)
    expect(sufijoArte(1)).toBe('@1x')
    expect(sufijoArte(2)).toBe('@2x')
    expect(sufijoArte(Number.NaN)).toBe('@1x')
  })
})

describe('tamaño del lienzo', () => {
  it('multiplica el tamaño CSS por el factor y nunca baja de 1', () => {
    expect(tamanoLienzo(412, 2)).toBe(824)
    expect(tamanoLienzo(411.5, 1.5)).toBe(617)
    expect(tamanoLienzo(0, 2)).toBe(1)
  })
})

function escena(factor: number, ancho: number, alto: number, zoomCamara: number): EscenaEscalable {
  return {
    scale: { zoom: 1 / factor, width: ancho, height: alto },
    cameras: {
      main: {
        zoom: zoomCamara,
        // Cámara de 2 px de dispositivo por px del mundo, centrada en el origen.
        getWorldPoint: (x, y) => ({ x: x / zoomCamara, y: y / zoomCamara }),
      },
    },
  }
}

describe('conversión entre píxeles CSS y de dispositivo', () => {
  it('la pantalla y el zoom lógicos no dependen del factor', () => {
    const e = escena(2, 824, 1830, 2 * 1.25)
    expect(factorDe(e)).toBe(2)
    expect(pantallaLogica(e)).toEqual({ ancho: 412, alto: 915 })
    expect(zoomLogico(e)).toBeCloseTo(1.25, 12)
  })

  it('un punto en CSS se convierte a píxeles de dispositivo antes de pasar por la cámara', () => {
    const e = escena(2, 824, 1830, 2)
    // En CSS (100, 50) son (200, 100) de dispositivo; con zoom 2 caen en el mundo (100, 50).
    expect(mundoDePantalla(e, 100, 50)).toEqual({ x: 100, y: 50 })
  })

  it('con factor 1 todo coincide con lo que da Phaser', () => {
    const e = escena(1, 1280, 720, 1.5)
    expect(pantallaLogica(e)).toEqual({ ancho: 1280, alto: 720 })
    expect(mundoDePantalla(e, 150, 75)).toEqual({ x: 100, y: 50 })
  })

  it('un zoom de pantalla inválido se trata como factor 1', () => {
    const e = escena(1, 100, 100, 1)
    ;(e.scale as { zoom: number }).zoom = 0
    expect(factorDe(e)).toBe(1)
  })
})

// E2E-16 · Rompedor: the per-DPR tiers of m5-00-rompedor «el lienzo mide CSS×min(DPR,2), zoom de
// pantalla coherente y arte @Nx», «DPR n: el arte y el lienzo son los de su tramo» and
// m1-global-rompedor «DPR alto: el lienzo se dibuja a la resolución del dispositivo (nitidez)».
describe('DPR tiers: canvas size and art scale', () => {
  const TRAMOS = [1, 1.25, 1.49, 1.5, 1.75, 2, 2.625, 3] as const

  it.each(TRAMOS)(
    'DPR %f: canvas = round(CSS × min(DPR, 2)) on both axes, logical screen = CSS',
    (dpr) => {
      const f = factorResolucion(dpr)
      expect(f).toBe(Math.min(dpr, 2))
      for (const [w, h] of [
        [412, 915],
        [915, 412],
        [1280, 720],
        [413, 917],
      ] as const) {
        const ancho = tamanoLienzo(w, f)
        const alto = tamanoLienzo(h, f)
        expect(ancho).toBe(Math.round(w * f))
        expect(alto).toBe(Math.round(h * f))
        // Phaser displays it at CSS size (`scale.zoom = 1 / factor`): the logical screen is the CSS
        // one, up to the rounding of the canvas to whole device pixels (< 1 device px).
        const p = pantallaLogica({ scale: { zoom: 1 / f, width: ancho, height: alto } })
        expect(Math.abs(p.ancho - w)).toBeLessThan(1 / f + 1e-9)
        expect(Math.abs(p.alto - h)).toBeLessThan(1 / f + 1e-9)
      }
    },
  )

  it.each(TRAMOS)(
    'DPR %f: every art file requested by cargarArte has the tier suffix, never the other',
    async (dpr) => {
      const { cargarArte } = await import('../../src/game/valle/arte')
      const urls: string[] = []
      const tamanos: number[] = []
      const cargador = {
        atlas: (_k: string, png: string, json: string) => urls.push(png, json),
        image: (_k: string, u: string) => urls.push(u),
        spritesheet: (_k: string, u: string, o: { frameWidth: number }) => {
          urls.push(u)
          tamanos.push(o.frameWidth)
        },
      }
      vi.stubGlobal('devicePixelRatio', dpr)
      try {
        cargarArte({ load: cargador } as never)
      } finally {
        vi.unstubAllGlobals()
      }
      const sufijo = dpr >= 1.5 ? '@2x' : '@1x'
      const otro = dpr >= 1.5 ? '@1x' : '@2x'
      expect(urls.length).toBeGreaterThan(20)
      expect(urls.filter((u) => !u.includes(sufijo))).toEqual([])
      expect(urls.filter((u) => u.includes(otro))).toEqual([])
      // Tile frames are 32 px at @1x and 64 px at @2x.
      expect(tamanos).toContain(dpr >= 1.5 ? 64 : 32)
      expect(tamanos).not.toContain(dpr >= 1.5 ? 32 : 64)
    },
  )
})
