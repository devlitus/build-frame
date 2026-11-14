import { describe, expect, it } from 'vitest'
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
