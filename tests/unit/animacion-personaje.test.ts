import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ANIMACIONES_PERSONAJE,
  DetectorMovimiento,
  animacionPersonaje,
  nombreFotograma,
  type AccionPersonaje,
} from '../../src/game/valle/animacionPersonaje'
import type { Orientacion } from '../../src/core'

describe('animación del protagonista por orientación', () => {
  it.each<[Orientacion, string, boolean]>([
    ['sur', 'abajo', false],
    ['norte', 'arriba', false],
    ['este', 'derecha', false],
    ['oeste', 'derecha', true],
  ])('mirando al %s usa la hoja «%s» (espejo: %s)', (o, dir, espejo) => {
    expect(animacionPersonaje('caminar', o)).toEqual({ clave: `caminar-${dir}`, espejo })
    expect(animacionPersonaje('reposo', o)).toEqual({ clave: `reposo-${dir}`, espejo })
  })

  it.each(['1x', '2x'])('el atlas @%s trae todos los fotogramas de cada animación', (e) => {
    const atlas = JSON.parse(
      readFileSync(`public/assets/protagonista/protagonista@${e}.json`, 'utf8'),
    ) as { frames: Record<string, unknown> }
    for (const accion of Object.keys(ANIMACIONES_PERSONAJE) as AccionPersonaje[]) {
      for (const o of ['norte', 'sur', 'este', 'oeste'] as const) {
        const { clave } = animacionPersonaje(accion, o)
        for (let n = 0; n < ANIMACIONES_PERSONAJE[accion].fotogramas; n++) {
          expect(atlas.frames, nombreFotograma(clave, n)).toHaveProperty(nombreFotograma(clave, n))
        }
      }
    }
  })
})

describe('detector de movimiento', () => {
  it('anda mientras cambia la posición y se para poco después', () => {
    const d = new DetectorMovimiento(90)
    expect(d.actualizar(5, 5, 16)).toBe(false) // primera posición
    expect(d.actualizar(5.1, 5, 16)).toBe(true)
    expect(d.actualizar(5.1, 5, 16)).toBe(true) // un fotograma sin avance no corta el paso
    expect(d.actualizar(5.1, 5, 100)).toBe(false)
    expect(d.actualizar(5.1, 5, 16)).toBe(false)
    expect(d.actualizar(5.1, 5.2, 16)).toBe(true)
  })
})
