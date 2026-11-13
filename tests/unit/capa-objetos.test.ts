import { describe, expect, it } from 'vitest'
import type Phaser from 'phaser'
import { CapaObjetos, type ObjetoProfundo } from '../../src/game/valle/capaObjetos'

/** Imagen falsa con lo mínimo que usa la capa. */
class Img {
  destruida = false
  texture = { key: '' }
  depth = 0
  x = 0
  y = 0
  datos: Record<string, unknown> = {}
  setOrigin(): this {
    return this
  }
  setTexture(k: string): this {
    this.texture.key = k
    return this
  }
  setPosition(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }
  setScale(): this {
    return this
  }
  setDepth(d: number): this {
    this.depth = d
    return this
  }
  setData(k: string, v: unknown): this {
    this.datos[k] = v
    return this
  }
  destroy(): void {
    this.destruida = true
  }
}

function escenaFalsa() {
  const creadas: Img[] = []
  const escena = {
    add: {
      image: () => {
        const i = new Img()
        creadas.push(i)
        return i
      },
    },
  } as unknown as Phaser.Scene
  return { escena, creadas }
}

/** Un árbol de 64×96 con la base en la casilla (cx, cy). */
function arbol(id: number, cx: number, cy: number): ObjetoProfundo {
  const x = cx * 32 + 16
  const y = (cy + 1) * 32
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

describe('capa de objetos por profundidad', () => {
  const objetos = [arbol(0, 5, 10), arbol(1, 6, 10), arbol(2, 90, 90), arbol(3, 5, 60)]
  const vista = { x0: 0, y0: 200, x1: 400, y1: 500 }

  it('solo crea imagen para lo que cae en la vista y el margen, con profundidad por la base', () => {
    const { escena, creadas } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    expect(capa.cantidad).toBe(2)
    expect(creadas).toHaveLength(2)
    expect(capa.imagen(0)?.depth).toBe(11 * 32)
    expect(capa.imagen(2)).toBeUndefined()
    expect(capa.contarEn(vista)).toBe(2)
  })

  it('reutiliza las imágenes al mover la vista y destruye las sobrantes', () => {
    const { escena, creadas } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    capa.actualizar({ x0: 0, y0: 1800, x1: 400, y1: 2100 }) // solo el árbol 3
    expect(capa.cantidad).toBe(1)
    expect(creadas).toHaveLength(2)
    expect(creadas.filter((i) => i.destruida)).toHaveLength(1)
    expect(capa.imagen(3)?.y).toBe(61 * 32)
  })

  it('no rehace nada si la vista no cambia de bloque', () => {
    const { escena } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar(objetos)
    capa.actualizar(vista)
    capa.actualizar({ ...vista, x0: 1, x1: 401 })
    expect(capa.reconstrucciones).toBe(1)
  })

  it('un objeto con la copa sobresaliendo por el norte aparece aunque su base esté fuera', () => {
    const { escena } = escenaFalsa()
    const capa = new CapaObjetos(escena, 3200)
    capa.reemplazar([arbol(7, 3, 20)]) // base en y=672, copa desde 576
    capa.actualizar({ x0: 0, y0: 300, x1: 400, y1: 560 }) // vista y margen llegan a 688
    expect(capa.cantidad).toBe(1)
    capa.invalidar()
    expect(capa.cantidad).toBe(0)
  })
})
