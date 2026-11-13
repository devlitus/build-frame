/**
 * Rompedor · M5-00 ronda 2. `CapaObjetos.contarEn` (el «enVista» del gancho `objetosCapa`) debe contar
 * cada objeto una sola vez y coincidir con los que `actualizar` pone de verdad en la escena.
 */
import { describe, expect, it } from 'vitest'
import { CapaObjetos, type ObjetoProfundo } from '../../src/game/valle/capaObjetos'

function imagenFalsa() {
  const img = {
    texture: { key: '' },
    depth: 0,
    data: new Map<string, unknown>(),
    setOrigin: () => img,
    setTexture: (k: string) => {
      img.texture.key = k
      return img
    },
    setPosition: () => img,
    setScale: () => img,
    setDepth: (d: number) => {
      img.depth = d
      return img
    },
    setData: (k: string, v: unknown) => {
      img.data.set(k, v)
      return img
    },
    destroy: () => undefined,
  }
  return img
}
const escenaFalsa = { add: { image: () => imagenFalsa() } } as never

function objeto(id: number, x: number, y: number): ObjetoProfundo {
  return {
    id,
    x,
    y,
    profundidad: y,
    textura: 'arbol',
    escala: 1,
    rect: { x0: x - 32, x1: x + 32, y0: y - 96, y1: y },
  }
}

describe('CapaObjetos: el recuento de lo visible', () => {
  it('con la vista más ancha que el valle (zoom mínimo), contarEn no cuenta dos veces los mismos objetos', () => {
    const mundo = 3072
    let sem = 3
    const rnd = () => {
      sem = (sem * 1103515245 + 12345) % 2147483648
      return sem / 2147483648
    }
    const objetos = Array.from({ length: 2000 }, (_, i) =>
      objeto(i, 16 + Math.floor(rnd() * 96) * 32, 32 + Math.floor(rnd() * 96) * 32),
    )
    const capa = new CapaObjetos(escenaFalsa, mundo)
    capa.reemplazar(objetos)
    const vista = { x0: -1200, y0: -1000, x1: mundo + 1200, y1: mundo + 1000 }
    capa.actualizar(vista)
    expect(capa.contarEn(vista)).toBe(capa.cantidad)
  })

  it('en cualquier vista, contarEn coincide con los objetos que actualizar crea', () => {
    const mundo = 3072
    let sem = 11
    const rnd = () => {
      sem = (sem * 1103515245 + 12345) % 2147483648
      return sem / 2147483648
    }
    const objetos = Array.from({ length: 2000 }, (_, i) =>
      objeto(i, 16 + Math.floor(rnd() * 96) * 32, 32 + Math.floor(rnd() * 96) * 32),
    )
    const dif: string[] = []
    for (let i = 0; i < 30; i++) {
      const capa = new CapaObjetos(escenaFalsa, mundo)
      capa.reemplazar(objetos)
      const x0 = -300 + rnd() * mundo
      const y0 = rnd() * mundo
      const vista = { x0, y0, x1: x0 + 400 + rnd() * 3000, y1: y0 + 400 + rnd() * 2000 }
      capa.actualizar(vista)
      if (capa.contarEn(vista) !== capa.cantidad)
        dif.push(
          `${JSON.stringify(vista)}: contarEn ${capa.contarEn(vista)} ≠ cantidad ${capa.cantidad}`,
        )
    }
    expect(dif).toEqual([])
  })
})
